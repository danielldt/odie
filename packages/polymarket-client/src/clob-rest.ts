import { createHmac } from "crypto";
import {
  POLYMARKET_CLOB_URL,
} from "@odie/shared";
import { ClobApiError } from "./errors.js";
import type {
  ClobApiCredentials,
  ClobOrderRequest,
  ClobOrderResponse,
  ClobBatchOrderResponse,
  ClobOrderStatus,
  ClobCancelResponse,
  ClobOrderbook,
  ClobPrice,
  ClobMidpoint,
} from "./types.js";

export interface ClobRestClientOptions {
  baseUrl?: string;
  credentials?: ClobApiCredentials;
}

/**
 * Polymarket CLOB REST API Client
 * 
 * Endpoints:
 * - POST /order - place a signed order
 * - POST /orders - batch place up to 15 orders
 * - GET /order/<orderId> - fetch order status
 * - DELETE /order/<orderId> - cancel an order
 * - GET /book - get orderbook
 * - GET /price - get price
 * - GET /midpoint - get midpoint
 */
export class ClobRestClient {
  private baseUrl: string;
  private credentials?: ClobApiCredentials;

  constructor(options: ClobRestClientOptions = {}) {
    this.baseUrl = options.baseUrl || POLYMARKET_CLOB_URL;
    this.credentials = options.credentials;
  }

  setCredentials(credentials: ClobApiCredentials) {
    this.credentials = credentials;
  }

  // ============================================
  // Order Management
  // ============================================

  /**
   * Place a single order
   * POST /order
   */
  async placeOrder(order: ClobOrderRequest): Promise<ClobOrderResponse> {
    return this.authenticatedRequest("POST", "/order", order);
  }

  /**
   * Place multiple orders (up to 15)
   * POST /orders
   */
  async placeBatchOrders(orders: ClobOrderRequest[]): Promise<ClobBatchOrderResponse> {
    if (orders.length > 15) {
      throw new Error("Batch orders limited to 15 orders maximum");
    }
    return this.authenticatedRequest("POST", "/orders", { orders });
  }

  /**
   * Get order status
   * GET /order/<orderId>
   */
  async getOrder(orderId: string): Promise<ClobOrderStatus> {
    return this.authenticatedRequest("GET", `/order/${orderId}`);
  }

  /**
   * Cancel an order
   * DELETE /order/<orderId>
   */
  async cancelOrder(orderId: string): Promise<ClobCancelResponse> {
    return this.authenticatedRequest("DELETE", `/order/${orderId}`);
  }

  /**
   * Cancel multiple orders
   */
  async cancelOrders(orderIds: string[]): Promise<ClobCancelResponse[]> {
    const results = await Promise.allSettled(
      orderIds.map((id) => this.cancelOrder(id))
    );
    
    return results.map((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      return { orderId: orderIds[i]!, status: "CANCEL_FAILED" };
    });
  }

  // ============================================
  // Market Data (Public)
  // ============================================

  /**
   * Get orderbook for a token
   * GET /book?token_id=<tokenId>
   */
  async getOrderbook(tokenId: string): Promise<ClobOrderbook> {
    return this.publicRequest("GET", `/book?token_id=${tokenId}`);
  }

  /**
   * Get current price for a token
   * GET /price?token_id=<tokenId>&side=<side>
   */
  async getPrice(tokenId: string, side: "BUY" | "SELL"): Promise<ClobPrice> {
    return this.publicRequest("GET", `/price?token_id=${tokenId}&side=${side}`);
  }

  /**
   * Get midpoint for a token
   * GET /midpoint?token_id=<tokenId>
   */
  async getMidpoint(tokenId: string): Promise<ClobMidpoint> {
    return this.publicRequest("GET", `/midpoint?token_id=${tokenId}`);
  }

  // ============================================
  // Internal Request Methods
  // ============================================

  private async publicRequest<T>(method: string, path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ClobApiError(
        `CLOB API error: ${response.status} ${response.statusText}`,
        response.status,
        body
      );
    }

    return response.json() as Promise<T>;
  }

  private async authenticatedRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.credentials) {
      throw new Error("Credentials required for authenticated requests");
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : "";
    
    // Create signature: HMAC-SHA256(timestamp + method + path + body)
    const message = timestamp + method + path + bodyStr;
    const signature = this.sign(message, this.credentials.apiSecret);

    const url = `${this.baseUrl}${path}`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "POLY_API_KEY": this.credentials.apiKey,
      "POLY_SIGNATURE": signature,
      "POLY_TIMESTAMP": timestamp,
      "POLY_PASSPHRASE": this.credentials.passphrase,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: bodyStr || undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new ClobApiError(
        `CLOB API error: ${response.status} ${response.statusText}`,
        response.status,
        responseBody
      );
    }

    return response.json() as Promise<T>;
  }

  private sign(message: string, secret: string): string {
    const hmac = createHmac("sha256", Buffer.from(secret, "base64"));
    hmac.update(message);
    return hmac.digest("base64");
  }
}

// Factory function for creating client with credentials
export function createClobRestClient(
  credentials?: ClobApiCredentials,
  baseUrl?: string
): ClobRestClient {
  return new ClobRestClient({ credentials, baseUrl });
}
