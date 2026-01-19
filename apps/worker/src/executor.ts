import { Worker, type Job } from "bullmq";
// @ts-expect-error - redlock types don't properly export for ESM
import Redlock from "redlock";
import { redis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { config } from "./config.js";
import { decrypt, generateIdempotencyKey, generateClientOrderId } from "./lib/crypto.js";
import { ClobWsManager } from "./ws-manager.js";
import {
  createClobRestClient,
  createDataApiClient,
  type ClobApiCredentials,
} from "@odie/polymarket-client";
import { SAFETY_DEFAULTS } from "@odie/shared";
import {
  getStrategyById,
  getActiveCredentialForUser,
  getWalletById,
  getTradeRunByIdempotencyKey,
  createTradeRun,
  updateTradeRun,
  createOrders,
  updateOrder,
  upsertPnlRecord,
  incrementRunsCompleted,
  updateStrategyNextRun,
} from "@odie/db";

interface ExecuteJobData {
  strategyId: string;
  userId: string;
  scheduledFor: string;
}

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 3,
  retryDelay: 200,
  retryJitter: 200,
});

const dataApi = createDataApiClient(config.polymarket.dataApiUrl);

export function createExecutor(wsManager: ClobWsManager) {
  const worker = new Worker<ExecuteJobData>(
    "strategy-execution",
    async (job: Job<ExecuteJobData>) => {
      const { strategyId, userId, scheduledFor } = job.data;
      const scheduledDate = new Date(scheduledFor);
      const idempotencyKey = generateIdempotencyKey(userId, strategyId, scheduledDate);

      // Acquire lock to prevent concurrent runs for same user/strategy
      const lockKey = `lock:strategy:${userId}:${strategyId}`;
      let lock;

      try {
        lock = await redlock.acquire([lockKey], 120000); // 2 minute lock
      } catch {
        logger.warn({ strategyId, userId }, "Failed to acquire lock, job will retry");
        throw new Error("Failed to acquire execution lock");
      }

      try {
        logger.info({ strategyId, userId, scheduledFor }, "Starting job execution...");

        // Check idempotency - skip if already processed
        const existingRun = await getTradeRunByIdempotencyKey(idempotencyKey);
        if (existingRun) {
          logger.info({ strategyId, runId: existingRun.id }, "Run already exists, skipping");
          return { skipped: true, runId: existingRun.id };
        }

        // Load strategy
        logger.info({ strategyId }, "Loading strategy...");
        const strategy = await getStrategyById(strategyId);
        if (!strategy) {
          throw new Error(`Strategy not found: ${strategyId}`);
        }
        logger.info({ strategyId, seriesSlug: strategy.seriesSlug, enabled: strategy.enabled }, "Strategy loaded");

        if (!strategy.enabled) {
          logger.info({ strategyId }, "Strategy disabled, skipping");
          return { skipped: true, reason: "disabled" };
        }

        // Load credentials
        logger.info({ userId }, "Loading credentials...");
        const credential = await getActiveCredentialForUser(userId);
        if (!credential) {
          throw new Error("No active credentials for user");
        }
        logger.info({ credentialId: credential.id, walletId: credential.walletId }, "Credentials loaded");

        // Decrypt credentials
        logger.info("Decrypting credentials...");
        const credentialsJson = decrypt(credential.encryptedBlob, credential.iv);
        const credentials: ClobApiCredentials = JSON.parse(credentialsJson);
        logger.info({ hasApiKey: !!credentials.apiKey, hasSecret: !!credentials.apiSecret }, "Credentials decrypted");

        // Get wallet address from credential's wallet
        logger.info({ walletId: credential.walletId }, "Loading wallet...");
        const wallet = await getWalletById(credential.walletId);
        if (!wallet) {
          throw new Error(`Wallet not found for credential: ${credential.walletId}`);
        }
        const walletAddress = wallet.address;
        logger.info({ walletAddress }, "Wallet loaded");

        // Execute the run
        const result = await executeRun({
          strategy,
          credentials,
          walletAddress,
          idempotencyKey,
          scheduledFor: scheduledDate,
          wsManager,
        });

        // Handle run result
        let nextRunAt: Date | null = null;
        
        if (strategy.enabled) {
          if (result.skipped) {
            // Skipped runs (no market found) - just schedule next check, don't count as completed
            nextRunAt = new Date(Date.now() + strategy.frequencySeconds * 1000);
            logger.info({ nextRunAt }, "Run skipped, scheduling next check");
            await updateStrategyNextRun(strategyId, nextRunAt);
          } else if (result.marketEndDate) {
            // Successful trade - wait until market resolves before next trade
            nextRunAt = new Date(result.marketEndDate.getTime() + 60000);
            logger.info({ 
              marketEndDate: result.marketEndDate, 
              nextRunAt 
            }, "Trade placed! Scheduling next run after market resolution");
            await incrementRunsCompleted(strategyId, nextRunAt);
          } else {
            // Trade completed but no end date - use frequency
            nextRunAt = new Date(Date.now() + strategy.frequencySeconds * 1000);
            await incrementRunsCompleted(strategyId, nextRunAt);
          }
        }

        return result;
      } finally {
        await lock.release();
      }
    },
    {
      connection: redis,
      concurrency: config.concurrency,
    }
  );

  worker.on("completed", (job, result) => {
    logger.info({ jobId: job.id, result }, "Job completed");
  });

  worker.on("failed", (job, error) => {
    console.error("=== JOB FAILED ===");
    console.error("Job ID:", job?.id);
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("Job Data:", JSON.stringify(job?.data, null, 2));
    console.error("==================");
    logger.error({ 
      jobId: job?.id, 
      errorMessage: error.message,
      errorStack: error.stack,
      jobData: job?.data 
    }, "Job failed");
  });

  return worker;
}

interface ExecuteRunParams {
  strategy: Awaited<ReturnType<typeof getStrategyById>>;
  credentials: ClobApiCredentials;
  walletAddress: string;
  idempotencyKey: string;
  scheduledFor: Date;
  wsManager: ClobWsManager;
}

// Minimum time a market should be open before we trade it (avoid skewed prices at open)
const MIN_MARKET_AGE_MS = 1 * 60 * 1000; // 1 minute (reduced from 3)

// Resolve active market from series slug
// Skips markets that just opened (prices often skewed)
async function resolveMarketFromSeries(seriesSlug: string): Promise<{
  marketId: string;
  yesTokenId: string;
  noTokenId: string;
  question: string;
  endDate: Date | null;
} | null> {
  try {
    logger.info({ seriesSlug }, "Searching for active BTC 15-min markets...");
    
    // Try the Series API endpoint first (for recurring markets like BTC 15-min)
    // https://docs.polymarket.com - Gamma API has a /series endpoint
    const seriesResponse = await fetch(
      `https://gamma-api.polymarket.com/series/${seriesSlug}`
    );
    
    if (seriesResponse.ok) {
      const seriesData = await seriesResponse.json() as any;
      logger.info({ seriesData }, "Series API response");
      
      // Series might return the current active market directly
      if (seriesData.markets && seriesData.markets.length > 0) {
        const activeMarket = seriesData.markets.find((m: any) => 
          m.active && !m.closed && m.acceptingOrders !== false
        );
        if (activeMarket) {
          logger.info({ market: activeMarket }, "Found active market from series");
          const tokenIds = JSON.parse(activeMarket.clobTokenIds || "[]");
          if (tokenIds.length >= 2) {
            return {
              marketId: activeMarket.id,
              yesTokenId: tokenIds[0],
              noTokenId: tokenIds[1],
              question: activeMarket.question,
              endDate: activeMarket.endDate ? new Date(activeMarket.endDate) : null,
            };
          }
        }
      }
    } else {
      logger.info({ status: seriesResponse.status }, "Series endpoint not available, trying search...");
    }

    // Fallback: Try multiple search approaches
    const searchQueries = [
      `https://gamma-api.polymarket.com/markets?slug_contains=${seriesSlug}&active=true&closed=false`,
      `https://gamma-api.polymarket.com/markets?tag=crypto&active=true&closed=false&limit=100`,
      `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500`,
    ];

    let allMarkets: any[] = [];
    
    for (const url of searchQueries) {
      logger.info({ url }, "Trying search URL...");
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        // Handle both array and object responses
        const markets = Array.isArray(data) ? data : (data.markets || data.data || []);
        logger.info({ url, count: markets.length }, "Search response");
        
        if (markets.length > 0) {
          allMarkets = markets;
          break;
        }
      }
    }

    logger.info({ totalMarkets: allMarkets.length }, "Total markets fetched");

    // Log some sample markets to see what's available
    if (allMarkets.length > 0) {
      logger.info({ 
        samples: allMarkets.slice(0, 20).map((m: any) => ({
          slug: m.slug,
          question: m.question?.slice(0, 60),
        }))
      }, "Sample markets available");
    }

    // Find BTC 15-min markets with flexible matching
    const btc15mMarkets = allMarkets.filter((m: any) => {
      const slug = (m.slug || '').toLowerCase();
      const question = (m.question || '').toLowerCase();
      
      // Match various BTC 15-min patterns
      return (
        slug.includes('btc-updown-15m') ||
        slug.includes('btc-15m') ||
        slug.includes('bitcoin-15m') ||
        (slug.includes('btc') && slug.includes('15')) ||
        (question.includes('bitcoin') && question.includes('15')) ||
        (question.includes('btc') && question.includes('15 min'))
      );
    });

    logger.info({ 
      found: btc15mMarkets.length,
      markets: btc15mMarkets.map((m: any) => ({
        id: m.id,
        slug: m.slug,
        question: m.question?.slice(0, 50),
        active: m.active,
        closed: m.closed,
        acceptingOrders: m.acceptingOrders,
        endDate: m.endDate,
        clobTokenIds: m.clobTokenIds,
      }))
    }, "BTC 15-min markets found");

    // Filter for markets accepting orders
    const eligibleMarkets = btc15mMarkets.filter((m: any) => {
      if (m.closed) {
        logger.info({ slug: m.slug }, "Skipped: market closed");
        return false;
      }
      if (m.acceptingOrders === false) {
        logger.info({ slug: m.slug }, "Skipped: not accepting orders");
        return false;
      }
      if (!m.active) {
        logger.info({ slug: m.slug }, "Skipped: not active");
        return false;
      }
      return true;
    })
      // Sort by end date (soonest first) to trade markets closer to resolution
      .sort((a: any, b: any) => {
        const aEnd = new Date(a.endDate || 0).getTime();
        const bEnd = new Date(b.endDate || 0).getTime();
        return aEnd - bEnd;
      });

    logger.info({ 
      seriesSlug, 
      eligibleCount: eligibleMarkets.length,
      eligibleMarkets: eligibleMarkets.slice(0, 3).map((m: any) => ({
        id: m.id,
        slug: m.slug,
        question: m.question?.slice(0, 50),
        endDate: m.endDate,
      }))
    }, "Eligible markets after filtering");

    const activeMarket = eligibleMarkets[0];

    if (!activeMarket) {
      logger.warn({ 
        seriesSlug, 
        btc15mFound: btc15mMarkets.length,
        eligibleCount: eligibleMarkets.length,
        reason: btc15mMarkets.length === 0 ? "no BTC 15-min markets found" : "all markets closed or not accepting orders"
      }, "No active market found in series");
      return null;
    }

    // Parse token IDs from clobTokenIds string (it's a JSON array string)
    let tokenIds: string[] = [];
    try {
      tokenIds = JSON.parse(activeMarket.clobTokenIds || "[]");
    } catch {
      logger.error({ clobTokenIds: activeMarket.clobTokenIds }, "Failed to parse token IDs");
      return null;
    }

    if (tokenIds.length < 2) {
      logger.error({ tokenIds }, "Market doesn't have enough token IDs");
      return null;
    }

    // First token is YES, second is NO (standard Polymarket convention)
    return {
      marketId: activeMarket.id,
      yesTokenId: tokenIds[0]!,
      noTokenId: tokenIds[1]!,
      question: activeMarket.question,
      endDate: activeMarket.endDate ? new Date(activeMarket.endDate) : null,
    };
  } catch (error) {
    logger.error(error, "Error resolving market from series");
    return null;
  }
}

async function executeRun(params: ExecuteRunParams) {
  const { strategy, credentials, walletAddress, idempotencyKey, scheduledFor, wsManager } = params;
  
  if (!strategy) throw new Error("Strategy is null");

  const clobRest = createClobRestClient(credentials, config.polymarket.clobUrl);
  const runLogger = logger.child({ strategyId: strategy.id, seriesSlug: strategy.seriesSlug });

  // For series-based strategies, resolve the current active market
  let marketId = strategy.marketId;
  let yesTokenId = strategy.yesTokenId;
  let noTokenId = strategy.noTokenId;
  let limitPrice = parseFloat(strategy.limitPrice || strategy.yesLimitPrice || "0.49");
  let positionSize = parseFloat(strategy.positionSizeUsdc || "50");
  let marketEndDate: Date | null = null;

  if (strategy.seriesSlug) {
    runLogger.info({ seriesSlug: strategy.seriesSlug }, "Resolving market from series...");
    
    const resolved = await resolveMarketFromSeries(strategy.seriesSlug);
    if (!resolved) {
      runLogger.warn("No active market found in series, skipping run");
      return { skipped: true, reason: "no_active_market" };
    }

    marketId = resolved.marketId;
    yesTokenId = resolved.yesTokenId;
    noTokenId = resolved.noTokenId;
    marketEndDate = resolved.endDate;
    
    runLogger.info({ 
      marketId, 
      question: resolved.question,
      endDate: marketEndDate 
    }, "Found active market");
  }

  if (!yesTokenId || !noTokenId) {
    throw new Error("Missing token IDs for strategy");
  }

  // Calculate contract sizes from position size
  // positionSize is split 50/50 between YES and NO
  const sizePerSide = positionSize / 2;
  const contractsPerSide = sizePerSide / limitPrice;

  runLogger.info({
    limitPrice,
    positionSize,
    contractsPerSide,
    edge: (1 - limitPrice * 2) * 100 + "%"
  }, "Trade parameters calculated");

  // Create trade run record
  const run = await createTradeRun({
    strategyId: strategy.id,
    userId: strategy.userId,
    scheduledFor,
    status: "running",
    idempotencyKey,
  });

  if (!run) {
    throw new Error("Failed to create trade run");
  }

  const tradeLogger = runLogger.child({ runId: run.id });

  try {
    // 1. Validate balance
    tradeLogger.info("Validating balance...");
    const usdcAvailable = await dataApi.getAvailableUsdc(walletAddress);
    const worstCase = positionSize * 1.01; // 1% buffer for fees
    
    if (usdcAvailable < worstCase) {
      throw new Error(`Insufficient USDC: have ${usdcAvailable}, need ${worstCase}`);
    }

    // 2. Place both orders
    tradeLogger.info("Placing dual-leg orders...");
    
    const yesClientOrderId = generateClientOrderId(run.id, "YES");
    const noClientOrderId = generateClientOrderId(run.id, "NO");

    // Create order records
    const orderRecords = await createOrders([
      {
        tradeRunId: run.id,
        clientOrderId: yesClientOrderId,
        tokenId: yesTokenId,
        side: "BUY",
        price: limitPrice.toString(),
        size: contractsPerSide.toString(),
      },
      {
        tradeRunId: run.id,
        clientOrderId: noClientOrderId,
        tokenId: noTokenId,
        side: "BUY",
        price: limitPrice.toString(),
        size: contractsPerSide.toString(),
      },
    ]);

    // Place batch orders via CLOB REST
    const batchResponse = await clobRest.placeBatchOrders([
      {
        tokenId: yesTokenId,
        side: "BUY",
        price: limitPrice,
        size: contractsPerSide,
        clientOrderId: yesClientOrderId,
      },
      {
        tokenId: noTokenId,
        side: "BUY",
        price: limitPrice,
        size: contractsPerSide,
        clientOrderId: noClientOrderId,
      },
    ]);

    // Update order records with CLOB order IDs
    const yesResponse = batchResponse.orders[0];
    const noResponse = batchResponse.orders[1];
    const yesOrderRecord = orderRecords[0];
    const noOrderRecord = orderRecords[1];

    if (yesResponse && yesOrderRecord) {
      await updateOrder(yesOrderRecord.id, {
        clobOrderId: yesResponse.orderId,
        status: "open",
        placedAt: new Date(),
      });
    }

    if (noResponse && noOrderRecord) {
      await updateOrder(noOrderRecord.id, {
        clobOrderId: noResponse.orderId,
        status: "open",
        placedAt: new Date(),
      });
    }

    // 3. Monitor fills with timeout
    tradeLogger.info("Monitoring fills...");
    
    const deadline = Date.now() + (strategy.legTimeoutMs || 30000);
    const fillState = { yesFilled: false, noFilled: false };

    while (Date.now() < deadline) {
      // Poll order status
      try {
        if (yesResponse?.orderId && !fillState.yesFilled) {
          const status = await clobRest.getOrder(yesResponse.orderId);
          if (status.status === "FILLED") fillState.yesFilled = true;
        }
        if (noResponse?.orderId && !fillState.noFilled) {
          const status = await clobRest.getOrder(noResponse.orderId);
          if (status.status === "FILLED") fillState.noFilled = true;
        }
      } catch (e) {
        tradeLogger.warn(e, "Error polling order status");
      }

      if (fillState.yesFilled && fillState.noFilled) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    // 4. Handle result
    const entryCost = positionSize;

    if (fillState.yesFilled && fillState.noFilled) {
      tradeLogger.info("Both legs filled! Holding to resolution for guaranteed payout...");

      const entryCostTotal = limitPrice * contractsPerSide * 2;
      const guaranteedPayout = contractsPerSide; // $1 per contract pair
      const expectedProfit = guaranteedPayout - entryCostTotal;

      await updateTradeRun(run.id, {
        status: "filled",
        entryYesCost: (limitPrice * contractsPerSide).toString(),
        entryNoCost: (limitPrice * contractsPerSide).toString(),
        endedAt: new Date(),
      });

      // Record expected PnL (will be realized at market resolution)
      await upsertPnlRecord({
        userId: strategy.userId,
        marketId: marketId || "unknown",
        date: new Date().toISOString().split("T")[0]!,
        pnl: expectedProfit.toString(),
        volume: entryCostTotal.toString(),
        fees: "0",
        tradesCount: 1,
      });

      tradeLogger.info({
        entryCost: entryCostTotal,
        guaranteedPayout,
        expectedProfit,
        marketEndDate,
        message: "Position will auto-settle when market resolves"
      }, "Trade complete - holding to resolution");

      // Return marketEndDate so scheduler knows when funds will be free
      return { 
        status: "filled", 
        runId: run.id, 
        expectedProfit,
        marketEndDate, // Next trade should wait until after this
      };
    }

    // Handle partial fills - hedge and cancel
    if (fillState.yesFilled && !fillState.noFilled) {
      tradeLogger.warn("YES filled but NO didn't - hedging...");
      if (noResponse?.orderId) await clobRest.cancelOrder(noResponse.orderId);
      
      // Sell YES to neutralize
      await clobRest.placeOrder({
        tokenId: yesTokenId,
        side: "SELL",
        price: 0.01,
        size: contractsPerSide,
        clientOrderId: generateClientOrderId(run.id, "HEDGE-YES"),
        timeInForce: "IOC",
      });

      await updateTradeRun(run.id, { status: "hedged", endedAt: new Date(), errorMessage: "YES filled, NO cancelled" });
      return { status: "hedged", runId: run.id };
    }

    if (!fillState.yesFilled && fillState.noFilled) {
      tradeLogger.warn("NO filled but YES didn't - hedging...");
      if (yesResponse?.orderId) await clobRest.cancelOrder(yesResponse.orderId);
      
      // Sell NO to neutralize
      await clobRest.placeOrder({
        tokenId: noTokenId,
        side: "SELL",
        price: 0.01,
        size: contractsPerSide,
        clientOrderId: generateClientOrderId(run.id, "HEDGE-NO"),
        timeInForce: "IOC",
      });

      await updateTradeRun(run.id, { status: "hedged", endedAt: new Date(), errorMessage: "NO filled, YES cancelled" });
      return { status: "hedged", runId: run.id };
    }

    // Neither filled - cancel both
    tradeLogger.info("Neither leg filled, cancelling both");
    if (yesResponse?.orderId) await clobRest.cancelOrder(yesResponse.orderId);
    if (noResponse?.orderId) await clobRest.cancelOrder(noResponse.orderId);

    await updateTradeRun(run.id, { status: "cancelled", endedAt: new Date(), errorMessage: "Neither leg filled" });
    return { status: "cancelled", runId: run.id };

  } catch (error) {
    tradeLogger.error(error, "Run execution failed");

    await updateTradeRun(run.id, {
      status: "failed",
      endedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
}

// All trading logic is now integrated into executeRun
// Cash-out happens at market resolution (Polymarket returns $1 per winning contract automatically)
