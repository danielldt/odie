import { POLYMARKET_DATA_API_URL } from "@odie/shared";
import { DataApiError } from "./errors.js";
import type {
  DataApiPosition,
  DataApiTrade,
  DataApiBalances,
} from "./types.js";

export interface DataApiClientOptions {
  baseUrl?: string;
}

/**
 * Polymarket Data API Client
 * 
 * Base URL: https://data-api.polymarket.com
 * 
 * Used for:
 * - Fetching user positions
 * - Fetching trade history
 * - Checking balances
 */
export class DataApiClient {
  private baseUrl: string;

  constructor(options: DataApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || POLYMARKET_DATA_API_URL;
  }

  /**
   * Get positions for a wallet address
   */
  async getPositions(walletAddress: string): Promise<DataApiPosition[]> {
    return this.request<DataApiPosition[]>(
      `/positions?user=${walletAddress.toLowerCase()}`
    );
  }

  /**
   * Get trade history for a wallet address
   */
  async getTrades(
    walletAddress: string,
    params?: {
      market?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<DataApiTrade[]> {
    const searchParams = new URLSearchParams({
      user: walletAddress.toLowerCase(),
    });
    
    if (params?.market) {
      searchParams.set("market", params.market);
    }
    if (params?.limit) {
      searchParams.set("limit", params.limit.toString());
    }
    if (params?.offset) {
      searchParams.set("offset", params.offset.toString());
    }

    return this.request<DataApiTrade[]>(`/trades?${searchParams.toString()}`);
  }

  /**
   * Get USDC and collateral balances for a wallet
   */
  async getBalances(walletAddress: string): Promise<DataApiBalances> {
    return this.request<DataApiBalances>(
      `/balances?user=${walletAddress.toLowerCase()}`
    );
  }

  /**
   * Calculate available USDC for trading
   * Takes into account positions and pending orders
   */
  async getAvailableUsdc(walletAddress: string): Promise<number> {
    const balances = await this.getBalances(walletAddress);
    return parseFloat(balances.usdc);
  }

  /**
   * Get position for a specific token
   */
  async getPositionForToken(
    walletAddress: string,
    tokenId: string
  ): Promise<DataApiPosition | null> {
    const positions = await this.getPositions(walletAddress);
    return positions.find((p) => p.asset === tokenId) || null;
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
      throw new DataApiError(
        `Data API error: ${response.status} ${response.statusText}`,
        response.status,
        body
      );
    }

    return response.json() as Promise<T>;
  }
}

export function createDataApiClient(baseUrl?: string): DataApiClient {
  return new DataApiClient({ baseUrl });
}
