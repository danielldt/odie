// ============================================
// CLOB REST API Types
// ============================================

export interface ClobApiCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
}

export interface ClobOrderRequest {
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  clientOrderId?: string;
  timeInForce?: "GTC" | "IOC" | "FOK";
  expiration?: number;
}

export interface ClobOrderResponse {
  orderId: string;
  clientOrderId?: string;
  status: string;
  errorMsg?: string;
}

export interface ClobBatchOrderResponse {
  orders: ClobOrderResponse[];
}

export interface ClobOrderStatus {
  orderId: string;
  clientOrderId?: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: string;
  originalSize: string;
  remainingSize: string;
  filledSize: string;
  status: "LIVE" | "FILLED" | "CANCELED" | "EXPIRED";
  createdAt: string;
  updatedAt: string;
}

export interface ClobCancelResponse {
  orderId: string;
  status: string;
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface ClobOrderbook {
  tokenId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  hash: string;
  timestamp: string;
}

export interface ClobPrice {
  tokenId: string;
  price: string;
}

export interface ClobMidpoint {
  tokenId: string;
  mid: string;
}

// ============================================
// CLOB WebSocket Types
// ============================================

export interface WsSubscription {
  channel: "book" | "user";
  market?: string;
  assetId?: string;
}

export interface WsBookUpdate {
  event_type: "book";
  asset_id: string;
  market: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: string;
  hash: string;
}

export interface WsTradeUpdate {
  event_type: "trade";
  asset_id: string;
  market: string;
  side: "BUY" | "SELL";
  price: string;
  size: string;
  fee_rate_bps: string;
  timestamp: string;
  trade_id: string;
}

export interface WsOrderUpdate {
  event_type: "order";
  order_id: string;
  client_order_id?: string;
  asset_id: string;
  side: "BUY" | "SELL";
  price: string;
  original_size: string;
  size_matched: string;
  status: "LIVE" | "FILLED" | "CANCELED" | "EXPIRED" | "MATCHED";
  timestamp: string;
}

export type WsMessage = WsBookUpdate | WsTradeUpdate | WsOrderUpdate;

// ============================================
// Data API Types
// ============================================

export interface DataApiPosition {
  asset: string;
  outcome: string;
  market: string;
  size: string;
  avgPrice: string;
  curPrice: string;
  initialValue: string;
  currentValue: string;
  percentPnl: string;
  cashPnl: string;
}

export interface DataApiTrade {
  id: string;
  market: string;
  asset: string;
  side: "BUY" | "SELL";
  price: string;
  size: string;
  fee: string;
  timestamp: string;
  outcome: string;
}

export interface DataApiBalances {
  usdc: string;
  collateral: string;
}

// ============================================
// Gamma API Types
// ============================================

export interface GammaMarket {
  id: string;
  slug: string;
  question: string;
  description?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  outcomes: string[];
  outcomePrices: string[];
  tokens: GammaToken[];
  volume: string;
  liquidity: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GammaToken {
  token_id: string;
  outcome: string;
  price: string;
  winner: boolean;
}

export interface GammaMarketsResponse {
  markets: GammaMarket[];
  nextCursor?: string;
}
