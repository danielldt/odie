import type { FastifyInstance } from "fastify";
import { strategyCreateSchema, strategyUpdateSchema } from "@odie/shared/schemas";
import {
  createStrategy,
  getStrategyById,
  getUserStrategies,
  updateStrategy,
  deleteStrategy,
  getActiveCredentialForUser,
} from "@odie/db";
import { authenticate, getUserId } from "../lib/auth.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../lib/error-handler.js";

export async function strategyRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // List user strategies
  app.get("/", async (request) => {
    const userId = getUserId(request);
    const strategies = await getUserStrategies(userId);
    
    return { strategies };
  });

  // Get single strategy
  app.get("/:id", async (request) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const strategy = await getStrategyById(id);
    
    if (!strategy) {
      throw new NotFoundError("Strategy not found");
    }
    
    if (strategy.userId !== userId) {
      throw new ForbiddenError("Strategy does not belong to user");
    }

    return { strategy };
  });

  // Create strategy (series-based)
  app.post("/", async (request, reply) => {
    const userId = getUserId(request);
    const input = strategyCreateSchema.parse(request.body);

    // Verify user has credentials
    const credentials = await getActiveCredentialForUser(userId);
    if (!credentials) {
      throw new BadRequestError("Please set up your Polymarket credentials first (Settings page)");
    }

    // Calculate first run time (start immediately)
    const nextRunAt = new Date();

    const strategy = await createStrategy({
      userId,
      name: input.name,
      // New series-based fields
      seriesSlug: input.seriesSlug,
      limitPrice: input.limitPrice.toString(),
      positionSizeUsdc: input.positionSizeUsdc.toString(),
      // Schedule & safety
      frequencySeconds: input.frequencySeconds,
      maxRuns: input.maxRuns ?? null,
      enabled: input.enabled ?? true,
      minLiquidityUsdc: (input.minLiquidityUsdc ?? 10).toString(),
      maxSlippageFromMidpoint: (input.maxSlippageFromMidpoint ?? 0.02).toString(),
      legTimeoutMs: input.legTimeoutMs ?? 30000,
      autoCashOut: input.autoCashOut ?? true,
      nextRunAt,
    });

    return reply.status(201).send({ strategy });
  });

  // Update strategy
  app.patch("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const input = strategyUpdateSchema.parse(request.body);

    // Verify ownership
    const existing = await getStrategyById(id);
    if (!existing) {
      throw new NotFoundError("Strategy not found");
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError("Strategy does not belong to user");
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    
    if (input['name'] !== undefined) updateData['name'] = input['name'];
    if (input['limitPrice'] !== undefined) updateData['limitPrice'] = input['limitPrice'].toString();
    if (input['positionSizeUsdc'] !== undefined) updateData['positionSizeUsdc'] = input['positionSizeUsdc'].toString();
    if (input['frequencySeconds'] !== undefined) updateData['frequencySeconds'] = input['frequencySeconds'];
    if (input['maxRuns'] !== undefined) updateData['maxRuns'] = input['maxRuns'];
    if (input['enabled'] !== undefined) updateData['enabled'] = input['enabled'];
    if (input['minLiquidityUsdc'] !== undefined) updateData['minLiquidityUsdc'] = input['minLiquidityUsdc'].toString();
    if (input['maxSlippageFromMidpoint'] !== undefined) updateData['maxSlippageFromMidpoint'] = input['maxSlippageFromMidpoint'].toString();
    if (input['legTimeoutMs'] !== undefined) updateData['legTimeoutMs'] = input['legTimeoutMs'];
    if (input['autoCashOut'] !== undefined) updateData['autoCashOut'] = input['autoCashOut'];

    const strategy = await updateStrategy(id, updateData);

    return { strategy };
  });

  // Delete strategy
  app.delete("/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const existing = await getStrategyById(id);
    if (!existing) {
      throw new NotFoundError("Strategy not found");
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError("Strategy does not belong to user");
    }

    await deleteStrategy(id);

    return { success: true };
  });

  // Trigger immediate run
  app.post("/:id/run-now", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const strategy = await getStrategyById(id);
    if (!strategy) {
      throw new NotFoundError("Strategy not found");
    }
    if (strategy.userId !== userId) {
      throw new ForbiddenError("Strategy does not belong to user");
    }

    // Update next run to now
    await updateStrategy(id, { nextRunAt: new Date() });

    return { success: true, message: "Strategy queued for immediate execution" };
  });
}
