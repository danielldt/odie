import type { FastifyInstance } from "fastify";
import { ordersQuerySchema } from "@odie/shared/schemas";
import { queryOrders, getOrderById, getTradeRunById } from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";
import { NotFoundError, ForbiddenError } from "../lib/error-handler.js";

export async function orderRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // List orders
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const params = ordersQuerySchema.parse(request.query);

    // If runId provided, verify ownership
    if (params.runId) {
      const run = await getTradeRunById(params.runId);
      if (!run) {
        throw new NotFoundError("Trade run not found");
      }
      if (run.userId !== userId) {
        throw new ForbiddenError("Trade run does not belong to user");
      }
    }

    const result = await queryOrders({
      runId: params.runId,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      orders: result.orders,
      total: result.total,
      limit: params.limit,
      offset: params.offset,
    };
  });

  // Get single order
  app.get("/:id", async (request) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const order = await getOrderById(id);
    
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    // Verify ownership through trade run
    const run = await getTradeRunById(order.tradeRunId);
    if (!run || run.userId !== userId) {
      throw new ForbiddenError("Order does not belong to user");
    }

    return { order };
  });
}
