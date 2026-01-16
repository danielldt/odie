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
        const nextRunAt = strategy.enabled
          ? new Date(Date.now() + strategy.frequencySeconds * 1000)
          : null;
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

async function executeRun(params: ExecuteRunParams) {
  const { strategy, credentials, walletAddress, idempotencyKey, scheduledFor, wsManager } = params;
  
  if (!strategy) throw new Error("Strategy is null");

  const clobRest = createClobRestClient(credentials, config.polymarket.clobUrl);

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

  const runLogger = logger.child({ runId: run.id, strategyId: strategy.id });

  try {
    // 1. Validate balance
    runLogger.info("Validating balance...");
    await validateBalance(walletAddress, strategy);

    // 2. Validate prices and liquidity
    runLogger.info("Validating prices and liquidity...");
    await validatePricesAndLiquidity(strategy, wsManager);

    // 3. Place both orders
    runLogger.info("Placing dual-leg orders...");
    const orderResult = await placeDualLegOrders(run.id, strategy, clobRest, wsManager);

    // 4. Monitor fills with timeout
    runLogger.info("Monitoring fills...");
    const fillResult = await monitorAndHedge(
      run.id,
      strategy,
      orderResult,
      clobRest,
      wsManager,
      runLogger
    );

    // 5. Handle result
    if (fillResult.status === "BOTH_FILLED") {
      runLogger.info("Both legs filled");

      // Calculate entry costs
      const entryYesCost = parseFloat(strategy.yesLimitPrice) * parseFloat(strategy.yesSize);
      const entryNoCost = parseFloat(strategy.noLimitPrice) * parseFloat(strategy.noSize);

      // Update run with entry info
      await updateTradeRun(run.id, {
        status: "filled",
        entryYesCost: entryYesCost.toString(),
        entryNoCost: entryNoCost.toString(),
        endedAt: new Date(),
      });

      // Auto cash-out if enabled
      if (strategy.autoCashOut) {
        runLogger.info("Auto cash-out enabled, exiting positions...");
        await autoCashOut(run.id, strategy, clobRest, wsManager, runLogger);
      }

      return { status: "filled", runId: run.id };
    } else {
      // Hedged or cancelled
      runLogger.warn({ result: fillResult }, "Run completed with hedge/cancel");

      await updateTradeRun(run.id, {
        status: fillResult.status === "HEDGED" ? "hedged" : "cancelled",
        endedAt: new Date(),
        errorMessage: fillResult.message,
      });

      return { status: fillResult.status, runId: run.id };
    }
  } catch (error) {
    runLogger.error(error, "Run execution failed");

    // Cancel any open orders
    try {
      const orders = await getOrdersForRun(run.id);
      const openOrders = orders.filter(
        (o) => o.clobOrderId && ["pending", "open", "partially_filled"].includes(o.status)
      );
      
      for (const order of openOrders) {
        if (order.clobOrderId) {
          await clobRest.cancelOrder(order.clobOrderId);
          await updateOrder(order.id, { status: "cancelled", cancelledAt: new Date() });
        }
      }
    } catch (cancelError) {
      runLogger.error(cancelError, "Failed to cancel orders during cleanup");
    }

    await updateTradeRun(run.id, {
      status: "failed",
      endedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
}

async function validateBalance(walletAddress: string, strategy: NonNullable<Awaited<ReturnType<typeof getStrategyById>>>) {
  const usdcAvailable = await dataApi.getAvailableUsdc(walletAddress);
  
  const costYes = parseFloat(strategy.yesSize) * parseFloat(strategy.yesLimitPrice);
  const costNo = parseFloat(strategy.noSize) * parseFloat(strategy.noLimitPrice);
  const worstCase = (costYes + costNo) * 1.01; // 1% buffer for fees

  if (usdcAvailable < worstCase) {
    throw new Error(`Insufficient USDC: have ${usdcAvailable}, need ${worstCase}`);
  }
}

async function validatePricesAndLiquidity(
  strategy: NonNullable<Awaited<ReturnType<typeof getStrategyById>>>,
  wsManager: ClobWsManager
) {
  const yesPrice = parseFloat(strategy.yesLimitPrice);
  const noPrice = parseFloat(strategy.noLimitPrice);

  // Check arb condition: YES + NO < 1 - feeBuffer
  if (yesPrice + noPrice >= 1 - SAFETY_DEFAULTS.FEE_BUFFER) {
    throw new Error(`No arbitrage edge: YES(${yesPrice}) + NO(${noPrice}) >= ${1 - SAFETY_DEFAULTS.FEE_BUFFER}`);
  }

  // Subscribe to orderbooks if not already
  wsManager.subscribeOrderbook(strategy.yesTokenId);
  wsManager.subscribeOrderbook(strategy.noTokenId);

  // Wait briefly for orderbook data
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const yesBook = wsManager.getOrderbook(strategy.yesTokenId);
  const noBook = wsManager.getOrderbook(strategy.noTokenId);

  if (!yesBook || !noBook) {
    logger.warn("Orderbook not available, proceeding with order placement");
    return;
  }

  // Check liquidity at price levels
  const minLiquidity = parseFloat(strategy.minLiquidityUsdc);
  
  const yesAskLiquidity = yesBook.asks
    .filter((a) => a.price <= yesPrice)
    .reduce((sum, a) => sum + a.size * a.price, 0);
  
  const noAskLiquidity = noBook.asks
    .filter((a) => a.price <= noPrice)
    .reduce((sum, a) => sum + a.size * a.price, 0);

  if (yesAskLiquidity < minLiquidity) {
    throw new Error(`Insufficient YES liquidity: ${yesAskLiquidity} < ${minLiquidity}`);
  }

  if (noAskLiquidity < minLiquidity) {
    throw new Error(`Insufficient NO liquidity: ${noAskLiquidity} < ${minLiquidity}`);
  }
}

async function placeDualLegOrders(
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

async function autoCashOut(
  runId: string,
  strategy: NonNullable<Awaited<ReturnType<typeof getStrategyById>>>,
  clobRest: ReturnType<typeof createClobRestClient>,
  wsManager: ClobWsManager,
  runLogger: typeof logger
) {
  try {
    // Get current midpoints
    const yesMidpoint = await clobRest.getMidpoint(strategy.yesTokenId);
    const noMidpoint = await clobRest.getMidpoint(strategy.noTokenId);

    const yesSellPrice = parseFloat(yesMidpoint.mid) * 0.99; // Slightly below mid
    const noSellPrice = parseFloat(noMidpoint.mid) * 0.99;

    const yesClientOrderId = generateClientOrderId(runId, "EXIT-YES");
    const noClientOrderId = generateClientOrderId(runId, "EXIT-NO");

    // Place sell orders
    await clobRest.placeBatchOrders([
      {
        tokenId: strategy.yesTokenId,
        side: "SELL",
        price: yesSellPrice,
        size: parseFloat(strategy.yesSize),
        clientOrderId: yesClientOrderId,
        timeInForce: "IOC",
      },
      {
        tokenId: strategy.noTokenId,
        side: "SELL",
        price: noSellPrice,
        size: parseFloat(strategy.noSize),
        clientOrderId: noClientOrderId,
        timeInForce: "IOC",
      },
    ]);

    // Calculate PnL
    const entryYesCost = parseFloat(strategy.yesLimitPrice) * parseFloat(strategy.yesSize);
    const entryNoCost = parseFloat(strategy.noLimitPrice) * parseFloat(strategy.noSize);
    const exitYesProceeds = yesSellPrice * parseFloat(strategy.yesSize);
    const exitNoProceeds = noSellPrice * parseFloat(strategy.noSize);
    const pnl = (exitYesProceeds + exitNoProceeds) - (entryYesCost + entryNoCost);

    // Update trade run with exit info
    await updateTradeRun(runId, {
      exitYesProceeds: exitYesProceeds.toString(),
      exitNoProceeds: exitNoProceeds.toString(),
      feesTotal: "0", // TODO: Calculate actual fees from fills
    });

    // Record PnL
    await upsertPnlRecord({
      userId: strategy.userId,
      marketId: strategy.marketId,
      date: new Date().toISOString().split("T")[0]!,
      pnl: pnl.toString(),
      volume: (entryYesCost + entryNoCost).toString(),
      fees: "0",
      tradesCount: 1,
    });

    runLogger.info({ pnl, exitYesProceeds, exitNoProceeds }, "Auto cash-out completed");
  } catch (error) {
    runLogger.error(error, "Auto cash-out failed");
    throw error;
  }
}
