import { POLYMARKET_GAMMA_API_URL } from "@odie/shared";
import { GammaApiError } from "./errors.js";
import type { GammaMarket, GammaMarketsResponse } from "./types.js";

export interface GammaApiClientOptions {
  baseUrl?: string;
}

/**
 * Polymarket Gamma API Client
 * 
 * Base URL: https://gamma-api.polymarket.com
 * 
 * Used for:
 * - Market discovery
 * - Market metadata (token IDs, outcomes, etc.)
 * - Market search
 */
export class GammaApiClient {
  private baseUrl: string;

  constructor(options: GammaApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || POLYMARKET_GAMMA_API_URL;
  }

  /**
   * Get a single market by ID
   */
  async getMarket(marketId: string): Promise<GammaMarket> {
    return this.request<GammaMarket>(`/markets/${marketId}`);
  }

  /**
   * Get a market by slug
   */
  async getMarketBySlug(slug: string): Promise<GammaMarket> {
    const markets = await this.getMarkets({ slug });
    if (markets.markets.length === 0) {
      throw new GammaApiError(`Market not found: ${slug}`, 404);
    }
    return markets.markets[0]!;
  }

  /**
   * List markets with optional filters
   * According to Polymarket docs: https://docs.polymarket.com/api-reference/markets/list-markets
   */
  async getMarkets(params?: {
    active?: boolean;
    closed?: boolean;
    slug?: string;
    limit?: number;
    offset?: number;
  }): Promise<GammaMarketsResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.active !== undefined) {
      searchParams.set("active", params.active.toString());
    }
    if (params?.closed !== undefined) {
      searchParams.set("closed", params.closed.toString());
    }
    if (params?.slug) {
      // Gamma API uses slug[] for array params
      searchParams.set("slug", params.slug);
    }
    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.offset !== undefined) {
      searchParams.set("offset", params.offset.toString());
    }

    const queryString = searchParams.toString();
    const path = queryString ? `/markets?${queryString}` : "/markets";
    
    // Gamma API returns array directly, not wrapped in object
    const response = await this.request<GammaMarket[] | GammaMarketsResponse>(path);
    
    // Handle both array and object response formats
    if (Array.isArray(response)) {
      return { markets: response };
    }
    return response;
  }

  /**
   * Search markets using Polymarket's public search endpoint
   */
  async searchMarkets(query: string): Promise<GammaMarket[]> {
    const searchParams = new URLSearchParams();
    searchParams.set("query", query);
    
    const path = `/public-search?${searchParams.toString()}`;
    
    try {
      const response = await this.request<GammaMarket[]>(path);
      return Array.isArray(response) ? response : [];
    } catch (error) {
      // Fallback to basic market list if search fails
      console.error("Public search failed, falling back to markets list:", error);
      const response = await this.getMarkets({ limit: 100 });
      const lowerQuery = query.toLowerCase();
      return response.markets.filter(
        (m) =>
          m.question?.toLowerCase().includes(lowerQuery) ||
          m.slug?.toLowerCase().includes(lowerQuery)
      );
    }
  }

  /**
   * Get all active markets (paginated)
   */
  async getAllActiveMarkets(maxPages = 10): Promise<GammaMarket[]> {
    const allMarkets: GammaMarket[] = [];
    const limit = 100;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.getMarkets({
        active: true,
        closed: false,
        limit,
        offset: page * limit,
      });
      
      allMarkets.push(...response.markets);
      
      // Stop if we got fewer than limit (no more pages)
      if (response.markets.length < limit) {
        break;
      }
    }

    return allMarkets;
  }

  /**
   * Extract token IDs for YES/NO outcomes from a market
   */
  getMarketTokens(market: GammaMarket): {
    yesTokenId: string;
    noTokenId: string;
  } | null {
    if (market.tokens.length < 2) {
      return null;
    }

    const yesToken = market.tokens.find(
      (t) => t.outcome.toLowerCase() === "yes"
    );
    const noToken = market.tokens.find(
      (t) => t.outcome.toLowerCase() === "no"
    );

    if (!yesToken || !noToken) {
      return null;
    }

    return {
      yesTokenId: yesToken.token_id,
      noTokenId: noToken.token_id,
    };
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new GammaApiError(
        `Gamma API error: ${response.status} ${response.statusText}`,
        response.status,
        body
      );
    }

    return response.json() as Promise<T>;
  }
}

export function createGammaApiClient(baseUrl?: string): GammaApiClient {
  return new GammaApiClient({ baseUrl });
}
