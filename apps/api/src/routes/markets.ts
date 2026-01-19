import type { FastifyInstance } from "fastify";
import { marketsQuerySchema } from "@odie/shared/schemas";
import { searchMarkets, getMarketById, upsertMarket } from "@odie/db";
import { createGammaApiClient } from "@odie/polymarket-client";
import { authenticate } from "../lib/auth.js";
import { NotFoundError } from "../lib/error-handler.js";

const gammaApi = createGammaApiClient();

export async function marketRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  // List/search markets - fetches directly from Polymarket Gamma API
  app.get("/", async (request) => {
    const params = marketsQuerySchema.parse(request.query);
    
    try {
      // When searching, fetch more markets to search through
      const fetchLimit = params.search ? 500 : params.limit;
      
      // Fetch from Polymarket Gamma API directly
      const gammaResponse = await gammaApi.getMarkets({
        active: params.active ?? true,
        limit: fetchLimit,
        offset: params.search ? 0 : params.offset, // Start from 0 when searching
      });

      let markets = gammaResponse.markets;

      // Filter by search term if provided
      if (params.search) {
        const searchTerms = params.search.toLowerCase().split(/\s+/);
        markets = markets.filter((m) => {
          const text = `${m.question || ""} ${m.slug || ""} ${m.description || ""}`.toLowerCase();
          // Match if ALL search terms are found
          return searchTerms.every(term => text.includes(term));
        });
        
        // Apply pagination after filtering
        markets = markets.slice(params.offset, params.offset + params.limit);
      }

      // Transform to our format
      const transformedMarkets = markets.map((m) => ({
        id: m.id,
        slug: m.slug,
        question: m.question,
        description: m.description,
        active: m.active,
        closed: m.closed,
        outcomes: m.outcomes,
        outcomePrices: m.outcomePrices,
        volume: m.volume,
        liquidity: m.liquidity,
        tokens: m.tokens,
        endDate: m.endDate,
      }));

      return {
        markets: transformedMarkets,
        total: transformedMarkets.length,
        limit: params.limit,
        offset: params.offset,
      };
    } catch (error) {
      request.log.error(error, "Failed to fetch markets from Gamma API");
      
      // Fallback to local DB
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
    }
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
