import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { createScheduler } from "./scheduler.js";
import { createExecutor } from "./executor.js";
import { ClobWsManager } from "./ws-manager.js";

async function main() {
  logger.info("Starting worker...");

  // Initialize WebSocket manager for CLOB
  const wsManager = new ClobWsManager();
  await wsManager.connect();

  // Initialize scheduler (polls for strategies to run)
  const scheduler = createScheduler();

  // Initialize executor (processes jobs)
  const executor = createExecutor(wsManager);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      // Stop accepting new jobs
      await scheduler.close();
      
      // Close executor (waits for active jobs)
      await executor.close();
      
      // Disconnect WebSocket
      wsManager.disconnect();

      logger.info("Worker shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info(`Worker started with concurrency ${config.concurrency}`);
}

main().catch((err) => {
  logger.error(err, "Failed to start worker");
  process.exit(1);
});
