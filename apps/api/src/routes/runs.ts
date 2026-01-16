import type { FastifyInstance } from "fastify";
import { runsQuerySchema } from "@odie/shared/schemas";
import { getUserTradeRuns, getTradeRunById } from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";
import { NotFoundError, ForbiddenError } from "../lib/error-handler.js";

export async function runRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // List runs
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const params = runsQuerySchema.parse(request.query);

    const result = await getUserTradeRuns(userId, {
      strategyId: params.strategyId,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      runs: result.runs,
      total: result.total,
      limit: params.limit,
      offset: params.offset,
    };
  });

  // Get single run with orders
  app.get("/:id", async (request) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const run = await getTradeRunById(id);
    
    if (!run) {
      throw new NotFoundError("Trade run not found");
    }
    
    if (run.userId !== userId) {
      throw new ForbiddenError("Trade run does not belong to user");
    }

    return { run };
  });
}
