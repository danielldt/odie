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

        // Increment runs completed
        // For series-based strategies holding to resolution:
        // Schedule next run AFTER the market resolves (so funds are available)
        let nextRunAt: Date | null = null;
        
        if (strategy.enabled) {
          if (result.marketEndDate) {
            // Wait until market resolves + 1 minute buffer for settlement
            nextRunAt = new Date(result.marketEndDate.getTime() + 60000);
            logger.info({ 
              marketEndDate: result.marketEndDate, 
              nextRunAt 
            }, "Scheduling next run after market resolution");
          } else {
            // Fallback to frequency-based scheduling
            nextRunAt = new Date(Date.now() + strategy.frequencySeconds * 1000);
          }
        }
        
        await incrementRunsCompleted(strategyId, nextRunAt);

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
const MIN_MARKET_AGE_MS = 3 * 60 * 1000; // 3 minutes

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
    // Try multiple search strategies
    const searchQueries = [
      seriesSlug, // e.g., "btc-updown-15m"
      seriesSlug.replace(/-/g, ' '), // e.g., "btc updown 15m"
      seriesSlug.split('-').slice(0, 2).join(' '), // e.g., "btc updown"
    ];

    let markets: any[] = [];

    // Try public-search first
    for (const query of searchQueries) {
      const response = await fetch(
        `https://gamma-api.polymarket.com/public-search?query=${encodeURIComponent(query)}&limit=50`
      );
      
      if (response.ok) {
        const results = await response.json() as any[];
        logger.info({ query, resultsCount: results.length }, "Search attempt");
        
        if (results.length > 0) {
          markets = results;
          break;
        }
      }
    }

    // If public-search returned nothing, try the markets endpoint directly
    if (markets.length === 0) {
      logger.info("Public search returned no results, trying markets endpoint...");
      const marketsResponse = await fetch(
        `https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100`
      );
      
      if (marketsResponse.ok) {
        const allMarkets = await marketsResponse.json() as any[];
        // Filter by slug pattern
        const baseSlug = seriesSlug.replace(/-\d+$/, ''); // Remove trailing timestamp if any
        markets = allMarkets.filter((m: any) => 
          m.slug?.toLowerCase().includes(baseSlug.toLowerCase()) ||
          m.question?.toLowerCase().includes(baseSlug.replace(/-/g, ' ').toLowerCase())
        );
        logger.info({ baseSlug, matchedCount: markets.length }, "Markets matched from direct fetch");
      }
    }

    const now = Date.now();
    
    logger.info({ 
      seriesSlug, 
      totalFound: markets.length,
      sampleMarkets: markets.slice(0, 5).map((m: any) => ({
        id: m.id,
        slug: m.slug,
        question: m.question?.slice(0, 50),
        active: m.active,
        closed: m.closed,
        acceptingOrders: m.acceptingOrders,
        endDate: m.endDate,
      }))
    }, "Markets found");

    // Filter for active markets that have been open for a while
    const baseSlug = seriesSlug.replace(/-\d+$/, '');
    const eligibleMarkets = markets
      .filter((m: any) => {
        // Check if market matches series pattern
        const matchesSlug = m.slug?.toLowerCase().includes(baseSlug.toLowerCase());
        const matchesQuestion = m.question?.toLowerCase().includes(baseSlug.replace(/-/g, ' ').toLowerCase());
        
        if (!matchesSlug && !matchesQuestion) {
          return false;
        }
        
        if (m.closed || m.acceptingOrders === false || !m.active) {
          logger.debug({ 
            marketId: m.id, 
            slug: m.slug,
            closed: m.closed, 
            active: m.active, 
            acceptingOrders: m.acceptingOrders 
          }, "Market filtered out - not active/accepting orders");
          return false;
        }
        
        // Skip markets that just opened (prices are skewed)
        const acceptingOrdersTimestamp = m.acceptingOrdersTimestamp 
          ? new Date(m.acceptingOrdersTimestamp).getTime() 
          : (m.startDate ? new Date(m.startDate).getTime() : 0);
        const marketAge = now - acceptingOrdersTimestamp;
        
        if (marketAge > 0 && marketAge < MIN_MARKET_AGE_MS) {
          logger.info({ 
            marketId: m.id, 
            question: m.question?.slice(0, 50),
            ageMinutes: (marketAge / 60000).toFixed(1),
            minAgeMinutes: MIN_MARKET_AGE_MS / 60000
          }, "Skipping market - too new, prices may be skewed");
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
        totalFound: markets.length,
        reason: markets.length === 0 ? "search returned no results" : "all markets filtered out (closed or too new)"
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
