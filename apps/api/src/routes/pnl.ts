import type { FastifyInstance } from "fastify";
import { pnlQuerySchema } from "@odie/shared/schemas";
import { getDailyPnl, getAggregatedPnl } from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";

export async function pnlRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // Get daily PnL records
  app.get("/daily", async (request) => {
    const userId = getUserId(request);
    const params = pnlQuerySchema.parse(request.query);

    const records = await getDailyPnl(userId, {
      marketId: params.marketId,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    return { records };
  });

  // Get aggregated PnL summary
  app.get("/summary", async (request) => {
    const userId = getUserId(request);
    const params = pnlQuerySchema.parse(request.query);

    const summary = await getAggregatedPnl(userId, {
      marketId: params.marketId,
      startDate: params.startDate,
      endDate: params.endDate,
    });

    return { summary };
  });
}
