import { Queue } from "bullmq";
import { redis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { getStrategiesToRun, updateStrategy } from "@odie/db";

const POLL_INTERVAL_MS = 10000; // 10 seconds

export const strategyQueue = new Queue("strategy-execution", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

let pollInterval: NodeJS.Timeout | null = null;

export function createScheduler() {
  logger.info("Starting scheduler...");

  // Poll for strategies that are due to run
  const poll = async () => {
    try {
      const now = new Date();
      const strategies = await getStrategiesToRun(now);

      for (const strategy of strategies) {
        // Check if max runs reached
        if (strategy.maxRuns !== null && strategy.runsCompleted >= strategy.maxRuns) {
          // Disable strategy
          await updateStrategy(strategy.id, { enabled: false, nextRunAt: null });
          logger.info({ strategyId: strategy.id }, "Strategy max runs reached, disabled");
          continue;
        }

        // Calculate next run time
        const nextRunAt = new Date(now.getTime() + strategy.frequencySeconds * 1000);

        // Update strategy next run time immediately to prevent duplicate scheduling
        await updateStrategy(strategy.id, { nextRunAt });

        // Queue the job
        await strategyQueue.add(
          "execute",
          {
            strategyId: strategy.id,
            userId: strategy.userId,
            scheduledFor: now.toISOString(),
          },
          {
            jobId: `${strategy.id}-${now.getTime()}`,
          }
        );

        logger.info(
          { strategyId: strategy.id, nextRunAt },
          "Strategy queued for execution"
        );
      }
    } catch (error) {
      logger.error(error, "Error polling for strategies");
    }
  };

  // Start polling
  poll();
  pollInterval = setInterval(poll, POLL_INTERVAL_MS);

  return {
    close: async () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      await strategyQueue.close();
      logger.info("Scheduler stopped");
    },
  };
}
