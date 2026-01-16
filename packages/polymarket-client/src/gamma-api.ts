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
   */
  async getMarkets(params?: {
    active?: boolean;
    closed?: boolean;
    slug?: string;
    limit?: number;
    cursor?: string;
  }): Promise<GammaMarketsResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.active !== undefined) {
      searchParams.set("active", params.active.toString());
    }
    if (params?.closed !== undefined) {
      searchParams.set("closed", params.closed.toString());
    }
    if (params?.slug) {
      searchParams.set("slug", params.slug);
    }
    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.cursor) {
      searchParams.set("cursor", params.cursor);
    }

    const queryString = searchParams.toString();
    const path = queryString ? `/markets?${queryString}` : "/markets";
    
    return this.request<GammaMarketsResponse>(path);
  }

  /**
   * Search markets by keyword
   */
  async searchMarkets(query: string, limit = 50): Promise<GammaMarket[]> {
    // Gamma API may have a search endpoint, or we filter client-side
    const response = await this.getMarkets({ active: true, limit });
    
    const lowerQuery = query.toLowerCase();
    return response.markets.filter(
      (m) =>
        m.question.toLowerCase().includes(lowerQuery) ||
        m.slug.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get all active markets (paginated)
   */
  async getAllActiveMarkets(): Promise<GammaMarket[]> {
    const allMarkets: GammaMarket[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.getMarkets({
        active: true,
        closed: false,
        limit: 100,
        cursor,
      });
      
      allMarkets.push(...response.markets);
      cursor = response.nextCursor;
    } while (cursor);

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
