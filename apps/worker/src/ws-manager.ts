import { ClobWsClient, type WsOrderUpdate, type WsBookUpdate } from "@odie/polymarket-client";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";

export interface OrderbookSnapshot {
  tokenId: string;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
  timestamp: number;
}

/**
 * Manages WebSocket connections to Polymarket CLOB
 * Maintains orderbook snapshots and order update callbacks
 */
export class ClobWsManager {
  private client: ClobWsClient;
  private orderbooks = new Map<string, OrderbookSnapshot>();
  private orderCallbacks = new Map<string, (update: WsOrderUpdate) => void>();

  constructor() {
    this.client = new ClobWsClient({
      wsUrl: config.polymarket.clobWsUrl,
      reconnect: true,
      reconnectIntervalMs: 5000,
      maxReconnectAttempts: 20,
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.client.on("connected", () => {
      logger.info("Connected to Polymarket CLOB WebSocket");
    });

    this.client.on("disconnected", (code, reason) => {
      logger.warn({ code, reason }, "Disconnected from Polymarket CLOB WebSocket");
    });

    this.client.on("error", (error) => {
      logger.error(error, "Polymarket CLOB WebSocket error");
    });

    this.client.on("book", (update: WsBookUpdate) => {
      const snapshot: OrderbookSnapshot = {
        tokenId: update.asset_id,
        bids: update.bids.map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
        asks: update.asks.map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
        timestamp: parseInt(update.timestamp),
      };
      this.orderbooks.set(update.asset_id, snapshot);
    });

    this.client.on("order", (update: WsOrderUpdate) => {
      const callback = this.orderCallbacks.get(update.order_id);
      if (callback) {
        callback(update);
      }
    });
  }

  async connect() {
    await this.client.connect();
  }

  disconnect() {
    this.client.disconnect();
  }

  /**
   * Subscribe to orderbook updates for a token
   */
  subscribeOrderbook(tokenId: string) {
    this.client.subscribeBook(tokenId);
    logger.debug({ tokenId }, "Subscribed to orderbook");
  }

  /**
   * Unsubscribe from orderbook updates
   */
  unsubscribeOrderbook(tokenId: string) {
    this.client.unsubscribe("book", tokenId);
    this.orderbooks.delete(tokenId);
  }

  /**
   * Get latest orderbook snapshot
   */
  getOrderbook(tokenId: string): OrderbookSnapshot | null {
    return this.orderbooks.get(tokenId) || null;
  }

  /**
   * Register a callback for order updates
   */
  onOrderUpdate(orderId: string, callback: (update: WsOrderUpdate) => void) {
    this.orderCallbacks.set(orderId, callback);
  }

  /**
   * Remove order update callback
   */
  removeOrderCallback(orderId: string) {
    this.orderCallbacks.delete(orderId);
  }

  /**
   * Subscribe to user order updates (requires credentials)
   */
  subscribeUserOrders(credentials: { apiKey: string; apiSecret: string; passphrase: string }) {
    this.client.setCredentials(credentials);
    this.client.subscribeUser();
    logger.debug("Subscribed to user orders");
  }

  get isConnected(): boolean {
    return this.client.isConnected;
  }
}
