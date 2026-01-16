import type { FastifyInstance } from "fastify";
import { marketsQuerySchema } from "@odie/shared/schemas";
import { searchMarkets, getMarketById, upsertMarket } from "@odie/db";
import { createGammaApiClient } from "@odie/polymarket-client";
import { authenticate } from "../lib/auth.js";
import { NotFoundError } from "../lib/error-handler.js";

const gammaApi = createGammaApiClient();

export async function marketRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // List/search markets
  app.get("/", async (request) => {
    const params = marketsQuerySchema.parse(request.query);
    
    const result = await searchMarkets({
      search: params.search,
      active: params.active,
      limit: params.limit,
      offset: params.offset,
    });

    return {
      markets: result.markets,
      total: result.total,
      limit: params.limit,
      offset: params.offset,
    };
  });

  // Get single market
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    
    let market = await getMarketById(id);
    
    // If not in DB, fetch from Gamma API
    if (!market) {
      try {
        const gammaMarket = await gammaApi.getMarket(id);
        
        // Cache in DB
        market = await upsertMarket({
          id: gammaMarket.id,
          slug: gammaMarket.slug,
          question: gammaMarket.question,
          description: gammaMarket.description,
          active: gammaMarket.active,
          closed: gammaMarket.closed,
          metadataJson: gammaMarket as unknown as Record<string, unknown>,
          endDate: gammaMarket.endDate ? new Date(gammaMarket.endDate) : null,
        });
      } catch {
        throw new NotFoundError("Market not found");
      }
    }

    return { market };
  });

  // Sync markets from Gamma API (admin/cron endpoint)
  app.post("/sync", async (request, reply) => {
    try {
      const markets = await gammaApi.getAllActiveMarkets();
      
      let synced = 0;
      for (const gammaMarket of markets) {
        await upsertMarket({
          id: gammaMarket.id,
          slug: gammaMarket.slug,
          question: gammaMarket.question,
          description: gammaMarket.description,
          active: gammaMarket.active,
          closed: gammaMarket.closed,
          metadataJson: gammaMarket as unknown as Record<string, unknown>,
          endDate: gammaMarket.endDate ? new Date(gammaMarket.endDate) : null,
        });
        synced++;
      }

      return { synced, total: markets.length };
    } catch (error) {
      request.log.error(error, "Failed to sync markets");
      throw error;
    }
  });
}
