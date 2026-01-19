import type { FastifyInstance } from "fastify";
import { marketsQuerySchema } from "@odie/shared/schemas";
import { searchMarkets, getMarketById, upsertMarket } from "@odie/db";
import { createGammaApiClient } from "@odie/polymarket-client";
import { authenticate } from "../lib/auth.js";
import { NotFoundError } from "../lib/error-handler.js";

const gammaApi = createGammaApiClient();

export async function marketRoutes(app: FastifyInstance) {
  // NOTE: Markets are public data - no authentication required for list/search
  // Only sync endpoint requires auth

  // List/search markets - fetches directly from Polymarket Gamma API (PUBLIC)
  app.get("/", async (request) => {
    const params = marketsQuerySchema.parse(request.query);
    
    try {
      let markets: any[];

      if (params.search) {
        // Use Polymarket's public-search endpoint for searching
        request.log.info({ query: params.search }, "Searching markets via public-search");
        markets = await gammaApi.searchMarkets(params.search);
        
        // Apply pagination
        markets = markets.slice(params.offset, params.offset + params.limit);
      } else {
        // List markets without search
        // Don't filter by closed - let user see all markets
        const gammaResponse = await gammaApi.getMarkets({
          active: params.active,
          limit: params.limit,
          offset: params.offset,
        });
        markets = gammaResponse.markets;
      }

      // Transform to our format
      const transformedMarkets = markets.map((m: any) => ({
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

  // Get market by slug (useful for btc-updown-15m-* markets)
  app.get("/slug/:slug", async (request) => {
    const { slug } = request.params as { slug: string };
    
    try {
      const response = await fetch(`https://gamma-api.polymarket.com/markets/slug/${slug}`);
      if (!response.ok) {
        throw new NotFoundError(`Market not found: ${slug}`);
      }
      const market = await response.json();
      return { market };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      request.log.error(error, "Failed to fetch market by slug");
      throw new NotFoundError(`Market not found: ${slug}`);
    }
  });

  // Get single market by ID
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

  // Get latest BTC 15-minute markets (convenience endpoint)
  app.get("/btc-15m", async (request) => {
    try {
      // Search for btc-updown-15m markets
      const markets = await gammaApi.searchMarkets("btc-updown-15m");
      
      // Sort by end date (newest first) and filter for non-closed
      const sorted = markets
        .filter((m: any) => !m.closed && m.acceptingOrders !== false)
        .sort((a: any, b: any) => {
          const aEnd = new Date(a.endDate || 0).getTime();
          const bEnd = new Date(b.endDate || 0).getTime();
          return bEnd - aEnd;
        })
        .slice(0, 10);

      return {
        markets: sorted.map((m: any) => ({
          id: m.id,
          slug: m.slug,
          question: m.question,
          endDate: m.endDate,
          active: m.active,
          closed: m.closed,
          acceptingOrders: m.acceptingOrders,
          outcomes: m.outcomes,
          outcomePrices: m.outcomePrices,
          tokens: m.tokens,
          clobTokenIds: m.clobTokenIds,
        })),
        total: sorted.length,
      };
    } catch (error) {
      request.log.error(error, "Failed to fetch BTC 15m markets");
      return { markets: [], total: 0, error: "Failed to fetch markets" };
    }
  });

  // Sync markets from Gamma API (admin/cron endpoint) - requires auth
  app.post("/sync", { onRequest: authenticate }, async (request, reply) => {
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
