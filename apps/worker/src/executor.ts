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
  type WsOrderUpdate,
} from "@odie/polymarket-client";
import { SAFETY_DEFAULTS } from "@odie/shared";
import {
  getStrategyById,
  getActiveCredentialForUser,
  getTradeRunByIdempotencyKey,
  createTradeRun,
  updateTradeRun,
  createOrders,
  updateOrder,
  getOrdersForRun,
  createFill,
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
        // Check idempotency - skip if already processed
        const existingRun = await getTradeRunByIdempotencyKey(idempotencyKey);
        if (existingRun) {
          logger.info({ strategyId, runId: existingRun.id }, "Run already exists, skipping");
          return { skipped: true, runId: existingRun.id };
        }

        // Load strategy
        const strategy = await getStrategyById(strategyId);
        if (!strategy) {
          throw new Error(`Strategy not found: ${strategyId}`);
        }

        if (!strategy.enabled) {
          logger.info({ strategyId }, "Strategy disabled, skipping");
          return { skipped: true, reason: "disabled" };
        }

        // Load credentials
        const credential = await getActiveCredentialForUser(userId);
        if (!credential) {
          throw new Error("No active credentials for user");
        }

        // Decrypt credentials
        const credentialsJson = decrypt(credential.encryptedBlob, credential.iv);
        const credentials: ClobApiCredentials = JSON.parse(credentialsJson);

        // Get wallet address from credential's wallet
        const walletAddress = "0x" + credential.walletId.replace(/-/g, "").slice(0, 40); // Placeholder - should fetch from wallet table

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
    logger.error({ jobId: job?.id, error: error.message }, "Job failed");
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
    // Search for active markets in this series
    const response = await fetch(
      `https://gamma-api.polymarket.com/public-search?query=${encodeURIComponent(seriesSlug)}`
    );
    
    if (!response.ok) {
      logger.error({ seriesSlug, status: response.status }, "Failed to search for markets");
      return null;
    }

    const markets = await response.json() as any[];
    const now = Date.now();
    
    // Filter for active markets that have been open for a while
    const eligibleMarkets = markets
      .filter((m: any) => {
        if (m.closed || m.acceptingOrders === false || !m.active) {
          return false;
        }
        
        // Skip markets that just opened (prices are skewed)
        const acceptingOrdersTimestamp = m.acceptingOrdersTimestamp 
          ? new Date(m.acceptingOrdersTimestamp).getTime() 
          : 0;
        const marketAge = now - acceptingOrdersTimestamp;
        
        if (marketAge < MIN_MARKET_AGE_MS) {
          logger.info({ 
            marketId: m.id, 
            question: m.question,
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

    const activeMarket = eligibleMarkets[0];

    if (!activeMarket) {
      logger.warn({ 
        seriesSlug, 
        totalFound: markets.length,
        message: "No eligible market found (all too new or closed)"
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

// Old functions removed - logic integrated into executeRun

/* REMOVED: validateBalance, validatePricesAndLiquidity, placeDualLegOrders, monitorAndHedge, neutralizeLeg */

// Keep only autoCashOut which is still used
async function _deprecated_placeDualLegOrders(
  runId: string,
  strategy: NonNullable<Awaited<ReturnType<typeof getStrategyById>>>,
  clobRest: ReturnType<typeof createClobRestClient>,
  wsManager: ClobWsManager
) {
  const yesClientOrderId = generateClientOrderId(runId, "YES");
  const noClientOrderId = generateClientOrderId(runId, "NO");

  // Create order records first
  const orderRecords = await createOrders([
    {
      tradeRunId: runId,
      clientOrderId: yesClientOrderId,
      tokenId: strategy.yesTokenId,
      side: "BUY",
      price: strategy.yesLimitPrice,
      size: strategy.yesSize,
    },
    {
      tradeRunId: runId,
      clientOrderId: noClientOrderId,
      tokenId: strategy.noTokenId,
      side: "BUY",
      price: strategy.noLimitPrice,
      size: strategy.noSize,
    },
  ]);

  const yesOrderRecord = orderRecords[0];
  const noOrderRecord = orderRecords[1];

  if (!yesOrderRecord || !noOrderRecord) {
    throw new Error("Failed to create order records");
  }

  // Place batch orders via CLOB REST
  const batchResponse = await clobRest.placeBatchOrders([
    {
      tokenId: strategy.yesTokenId,
      side: "BUY",
      price: parseFloat(strategy.yesLimitPrice),
      size: parseFloat(strategy.yesSize),
      clientOrderId: yesClientOrderId,
    },
    {
      tokenId: strategy.noTokenId,
      side: "BUY",
      price: parseFloat(strategy.noLimitPrice),
      size: parseFloat(strategy.noSize),
      clientOrderId: noClientOrderId,
    },
  ]);

  // Update order records with CLOB order IDs
  const yesResponse = batchResponse.orders[0];
  const noResponse = batchResponse.orders[1];

  if (yesResponse) {
    await updateOrder(yesOrderRecord.id, {
      clobOrderId: yesResponse.orderId,
      status: "open",
      placedAt: new Date(),
    });
  }

  if (noResponse) {
    await updateOrder(noOrderRecord.id, {
      clobOrderId: noResponse.orderId,
      status: "open",
      placedAt: new Date(),
    });
  }

  return {
    yesOrderId: yesResponse?.orderId,
    noOrderId: noResponse?.orderId,
    yesRecordId: yesOrderRecord.id,
    noRecordId: noOrderRecord.id,
  };
}

async function monitorAndHedge(
  runId: string,
  strategy: NonNullable<Awaited<ReturnType<typeof getStrategyById>>>,
  orderResult: Awaited<ReturnType<typeof placeDualLegOrders>>,
  clobRest: ReturnType<typeof createClobRestClient>,
  wsManager: ClobWsManager,
  runLogger: typeof logger
): Promise<{ status: "BOTH_FILLED" | "HEDGED" | "CANCELLED"; message?: string }> {
  const deadline = Date.now() + strategy.legTimeoutMs;
  const fillState = { yesFilled: false, noFilled: false };

  // Register WebSocket callbacks for order updates
  if (orderResult.yesOrderId) {
    wsManager.onOrderUpdate(orderResult.yesOrderId, (update: WsOrderUpdate) => {
      if (update.status === "FILLED" || update.status === "MATCHED") {
        fillState.yesFilled = true;
      }
    });
  }

  if (orderResult.noOrderId) {
    wsManager.onOrderUpdate(orderResult.noOrderId, (update: WsOrderUpdate) => {
      if (update.status === "FILLED" || update.status === "MATCHED") {
        fillState.noFilled = true;
      }
    });
  }

  // Poll until timeout or both filled
  while (Date.now() < deadline) {
    if (fillState.yesFilled && fillState.noFilled) {
      // Cleanup callbacks
      if (orderResult.yesOrderId) wsManager.removeOrderCallback(orderResult.yesOrderId);
      if (orderResult.noOrderId) wsManager.removeOrderCallback(orderResult.noOrderId);

      // Update order records
      await updateOrder(orderResult.yesRecordId, { status: "filled", filledAt: new Date() });
      await updateOrder(orderResult.noRecordId, { status: "filled", filledAt: new Date() });

      return { status: "BOTH_FILLED" };
    }

    // Also poll REST as fallback
    try {
      if (orderResult.yesOrderId && !fillState.yesFilled) {
        const yesStatus = await clobRest.getOrder(orderResult.yesOrderId);
        if (yesStatus.status === "FILLED") {
          fillState.yesFilled = true;
        }
      }

      if (orderResult.noOrderId && !fillState.noFilled) {
        const noStatus = await clobRest.getOrder(orderResult.noOrderId);
        if (noStatus.status === "FILLED") {
          fillState.noFilled = true;
        }
      }
    } catch (pollError) {
      runLogger.warn(pollError, "Error polling order status");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Timeout reached - handle mismatch
  runLogger.warn({ fillState }, "Timeout reached, checking for mismatch");

  // Cleanup callbacks
  if (orderResult.yesOrderId) wsManager.removeOrderCallback(orderResult.yesOrderId);
  if (orderResult.noOrderId) wsManager.removeOrderCallback(orderResult.noOrderId);

  if (fillState.yesFilled && !fillState.noFilled) {
    // YES filled, NO didn't - cancel NO and sell YES
    runLogger.warn("YES filled but NO didn't, hedging...");

    if (orderResult.noOrderId) {
      await clobRest.cancelOrder(orderResult.noOrderId);
      await updateOrder(orderResult.noRecordId, { status: "cancelled", cancelledAt: new Date() });
    }

    // Sell YES to neutralize
    await neutralizeLeg(runId, strategy.yesTokenId, parseFloat(strategy.yesSize), clobRest);
    await updateOrder(orderResult.yesRecordId, { status: "filled", filledAt: new Date() });

    return { status: "HEDGED", message: "YES filled, NO cancelled, position neutralized" };
  }

  if (!fillState.yesFilled && fillState.noFilled) {
    // NO filled, YES didn't - cancel YES and sell NO
    runLogger.warn("NO filled but YES didn't, hedging...");

    if (orderResult.yesOrderId) {
      await clobRest.cancelOrder(orderResult.yesOrderId);
      await updateOrder(orderResult.yesRecordId, { status: "cancelled", cancelledAt: new Date() });
    }

    // Sell NO to neutralize
    await neutralizeLeg(runId, strategy.noTokenId, parseFloat(strategy.noSize), clobRest);
    await updateOrder(orderResult.noRecordId, { status: "filled", filledAt: new Date() });

    return { status: "HEDGED", message: "NO filled, YES cancelled, position neutralized" };
  }

  // Neither filled - cancel both
  runLogger.info("Neither leg filled, cancelling both");

  if (orderResult.yesOrderId) {
    await clobRest.cancelOrder(orderResult.yesOrderId);
    await updateOrder(orderResult.yesRecordId, { status: "cancelled", cancelledAt: new Date() });
  }

  if (orderResult.noOrderId) {
    await clobRest.cancelOrder(orderResult.noOrderId);
    await updateOrder(orderResult.noRecordId, { status: "cancelled", cancelledAt: new Date() });
  }

  return { status: "CANCELLED", message: "Neither leg filled within timeout" };
}

async function neutralizeLeg(
  runId: string,
  tokenId: string,
  size: number,
  clobRest: ReturnType<typeof createClobRestClient>
) {
  // Place aggressive sell order to neutralize position
  // Using a price of 0.01 to ensure it sells (market order equivalent)
  const clientOrderId = generateClientOrderId(runId, `HEDGE-${tokenId.slice(-6)}`);

  await clobRest.placeOrder({
    tokenId,
    side: "SELL",
    price: 0.01, // Aggressive price to ensure fill
    size,
    clientOrderId,
    timeInForce: "IOC", // Immediate-or-cancel
  });
}

interface CashOutParams {
  runId: string;
  userId: string;
  marketId: string;
  yesTokenId: string;
  noTokenId: string;
  yesSize: number;
  noSize: number;
  entryCost: number;
}

async function autoCashOut(
  params: CashOutParams,
  clobRest: ReturnType<typeof createClobRestClient>,
  runLogger: typeof logger
) {
  const { runId, userId, marketId, yesTokenId, noTokenId, yesSize, noSize, entryCost } = params;

  try {
    // Get current midpoints for pricing
    const yesMidpoint = await clobRest.getMidpoint(yesTokenId);
    const noMidpoint = await clobRest.getMidpoint(noTokenId);

    // Sell aggressively to ensure fill (99% of mid, or minimum 0.01)
    const yesSellPrice = Math.max(0.01, parseFloat(yesMidpoint.mid) * 0.98);
    const noSellPrice = Math.max(0.01, parseFloat(noMidpoint.mid) * 0.98);

    const yesClientOrderId = generateClientOrderId(runId, "EXIT-YES");
    const noClientOrderId = generateClientOrderId(runId, "EXIT-NO");

    runLogger.info({ yesSellPrice, noSellPrice, yesSize, noSize }, "Placing cash-out orders");

    // Place sell orders with IOC (Immediate-Or-Cancel) to ensure quick exit
    await clobRest.placeBatchOrders([
      {
        tokenId: yesTokenId,
        side: "SELL",
        price: yesSellPrice,
        size: yesSize,
        clientOrderId: yesClientOrderId,
        timeInForce: "IOC",
      },
      {
        tokenId: noTokenId,
        side: "SELL",
        price: noSellPrice,
        size: noSize,
        clientOrderId: noClientOrderId,
        timeInForce: "IOC",
      },
    ]);

    // Calculate approximate PnL (actual may vary due to partial fills)
    const exitYesProceeds = yesSellPrice * yesSize;
    const exitNoProceeds = noSellPrice * noSize;
    const totalProceeds = exitYesProceeds + exitNoProceeds;
    const pnl = totalProceeds - entryCost;

    // Update trade run with exit info
    await updateTradeRun(runId, {
      exitYesProceeds: exitYesProceeds.toString(),
      exitNoProceeds: exitNoProceeds.toString(),
      feesTotal: "0",
    });

    // Record PnL
    await upsertPnlRecord({
      userId,
      marketId,
      date: new Date().toISOString().split("T")[0]!,
      pnl: pnl.toString(),
      volume: entryCost.toString(),
      fees: "0",
      tradesCount: 1,
    });

    runLogger.info({ pnl, totalProceeds, entryCost }, "Auto cash-out completed - funds freed for next trade!");
    return { pnl, totalProceeds };
  } catch (error) {
    runLogger.error(error, "Auto cash-out failed");
    throw error;
  }
}
