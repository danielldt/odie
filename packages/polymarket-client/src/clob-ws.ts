import WebSocket from "ws";
import { EventEmitter } from "events";
import { POLYMARKET_CLOB_WS_URL } from "@odie/shared";
import { WebSocketError } from "./errors.js";
import type {
  WsSubscription,
  WsMessage,
  WsBookUpdate,
  WsOrderUpdate,
  WsTradeUpdate,
  ClobApiCredentials,
} from "./types.js";

export interface ClobWsClientOptions {
  wsUrl?: string;
  credentials?: ClobApiCredentials;
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

export type ClobWsEventMap = {
  connected: [];
  disconnected: [code: number, reason: string];
  error: [error: Error];
  book: [update: WsBookUpdate];
  order: [update: WsOrderUpdate];
  trade: [update: WsTradeUpdate];
  message: [message: WsMessage];
};

/**
 * Polymarket CLOB WebSocket Client
 * 
 * Connects to: wss://ws-subscriptions-clob.polymarket.com/ws/
 * 
 * Channels:
 * - book: Real-time orderbook updates
 * - user: Order fills and status updates (requires auth)
 */
export class ClobWsClient extends EventEmitter<ClobWsEventMap> {
  private wsUrl: string;
  private credentials?: ClobApiCredentials;
  private ws: WebSocket | null = null;
  private reconnect: boolean;
  private reconnectIntervalMs: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private subscriptions: Set<string> = new Set();
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(options: ClobWsClientOptions = {}) {
    super();
    this.wsUrl = options.wsUrl || POLYMARKET_CLOB_WS_URL;
    this.credentials = options.credentials;
    this.reconnect = options.reconnect ?? true;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
  }

  setCredentials(credentials: ClobApiCredentials) {
    this.credentials = credentials;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.emit("connected");
          
          // Resubscribe to previous subscriptions
          this.resubscribe();
          
          resolve();
        });

        this.ws.on("message", (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("close", (code, reason) => {
          this.isConnecting = false;
          this.emit("disconnected", code, reason.toString());
          
          if (this.shouldReconnect && this.reconnect) {
            this.scheduleReconnect();
          }
        });

        this.ws.on("error", (error) => {
          this.isConnecting = false;
          this.emit("error", error);
          reject(error);
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Subscribe to orderbook updates for a market/asset
   */
  subscribeBook(assetId: string, market?: string): void {
    const subscription: WsSubscription = {
      channel: "book",
      assetId,
      market,
    };
    this.subscribe(subscription);
  }

  /**
   * Subscribe to user order updates (requires credentials)
   */
  subscribeUser(): void {
    if (!this.credentials) {
      throw new WebSocketError("Credentials required for user channel");
    }
    const subscription: WsSubscription = {
      channel: "user",
    };
    this.subscribe(subscription);
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string, assetId?: string): void {
    const key = assetId ? `${channel}:${assetId}` : channel;
    this.subscriptions.delete(key);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: "unsubscribe",
        channel,
        assets_ids: assetId ? [assetId] : undefined,
      });
    }
  }

  private subscribe(subscription: WsSubscription): void {
    const key = subscription.assetId
      ? `${subscription.channel}:${subscription.assetId}`
      : subscription.channel;
    
    this.subscriptions.add(key);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscription(subscription);
    }
  }

  private sendSubscription(subscription: WsSubscription): void {
    const msg: Record<string, unknown> = {
      type: "subscribe",
      channel: subscription.channel,
    };

    if (subscription.assetId) {
      msg.assets_ids = [subscription.assetId];
    }

    if (subscription.market) {
      msg.markets = [subscription.market];
    }

    // Add auth headers for user channel
    if (subscription.channel === "user" && this.credentials) {
      msg.auth = {
        apiKey: this.credentials.apiKey,
        secret: this.credentials.apiSecret,
        passphrase: this.credentials.passphrase,
      };
    }

    this.send(msg);
  }

  private resubscribe(): void {
    for (const key of this.subscriptions) {
      const [channel, assetId] = key.split(":");
      if (channel === "book" && assetId) {
        this.sendSubscription({ channel: "book", assetId });
      } else if (channel === "user") {
        this.sendSubscription({ channel: "user" });
      }
    }
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WsMessage;
      
      this.emit("message", message);

      // Emit typed events based on event_type
      if ("event_type" in message) {
        switch (message.event_type) {
          case "book":
            this.emit("book", message as WsBookUpdate);
            break;
          case "order":
            this.emit("order", message as WsOrderUpdate);
            break;
          case "trade":
            this.emit("trade", message as WsTradeUpdate);
            break;
        }
      }
    } catch (error) {
      this.emit("error", new WebSocketError(`Failed to parse message: ${data}`));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("error", new WebSocketError(
        `Max reconnection attempts (${this.maxReconnectAttempts}) reached`
      ));
      return;
    }

    const delay = this.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect().catch((error) => {
          this.emit("error", error as Error);
        });
      }
    }, delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export function createClobWsClient(
  credentials?: ClobApiCredentials,
  wsUrl?: string
): ClobWsClient {
  return new ClobWsClient({ credentials, wsUrl });
}
