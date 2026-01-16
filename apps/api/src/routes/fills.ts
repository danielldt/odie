import type { FastifyInstance } from "fastify";
import { fillsQuerySchema } from "@odie/shared/schemas";
import { queryFills, getFillById, getOrderById, getTradeRunById } from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";
import { NotFoundError, ForbiddenError } from "../lib/error-handler.js";

export async function fillRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // List fills
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const params = fillsQuerySchema.parse(request.query);

    // Verify ownership if filtering by run or order
    if (params.runId) {
      const run = await getTradeRunById(params.runId);
      if (!run) {
        throw new NotFoundError("Trade run not found");
      }
      if (run.userId !== userId) {
        throw new ForbiddenError("Trade run does not belong to user");
      }
    }

    if (params.orderId) {
      const order = await getOrderById(params.orderId);
      if (!order) {
        throw new NotFoundError("Order not found");
      }
      const run = await getTradeRunById(order.tradeRunId);
      if (!run || run.userId !== userId) {
        throw new ForbiddenError("Order does not belong to user");
      }
    }

    const result = await queryFills({
      runId: params.runId,
      orderId: params.orderId,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      fills: result.fills,
      total: result.total,
      limit: params.limit,
      offset: params.offset,
    };
  });

  // Get single fill
  app.get("/:id", async (request) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const fill = await getFillById(id);
    
    if (!fill) {
      throw new NotFoundError("Fill not found");
    }

    // Verify ownership through order -> run
    const order = await getOrderById(fill.orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    
    const run = await getTradeRunById(order.tradeRunId);
    if (!run || run.userId !== userId) {
      throw new ForbiddenError("Fill does not belong to user");
    }

    return { fill };
  });
}
