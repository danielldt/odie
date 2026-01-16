import type { ORDER_STATUS, RUN_STATUS } from "../constants.js";

// ============================================
// User & Auth Types
// ============================================

export interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Wallet {
  id: string;
  userId: string;
  address: string;
  chainId: number;
  createdAt: Date;
}

export interface UserCredential {
  id: string;
  userId: string;
  walletId: string;
  provider: "polymarket_clob";
  keyVersion: number;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ============================================
// Market Types (Gamma API)
// ============================================

export interface Market {
  id: string;
  slug: string;
  question: string;
  description: string;
  active: boolean;
  closed: boolean;
  outcomes: string[];
  tokens: MarketToken[];
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketToken {
  tokenId: string;
  outcome: string;
  price: number;
}

// ============================================
// Strategy Types
// ============================================

export interface Strategy {
  id: string;
  userId: string;
  marketId: string;
  name: string;
  
  // Token configuration
  yesTokenId: string;
  noTokenId: string;
  
  // Price & size
  yesLimitPrice: number;
  noLimitPrice: number;
  yesSize: number;
  noSize: number;
  
  // Scheduling
  frequencySeconds: number;
  maxRuns: number | null; // null = unlimited
  enabled: boolean;
  
  // Safety parameters
  minLiquidityUsdc: number;
  maxSlippageFromMidpoint: number;
  legTimeoutMs: number;
  autoCashOut: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export type StrategyCreateInput = Omit<Strategy, "id" | "createdAt" | "updatedAt">;
export type StrategyUpdateInput = Partial<StrategyCreateInput>;

// ============================================
// Trade Run Types
// ============================================

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export interface TradeRun {
  id: string;
  strategyId: string;
  userId: string;
  
  scheduledFor: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  
  status: RunStatus;
  idempotencyKey: string;
  
  // Entry info
  entryYesCost: number | null;
  entryNoCost: number | null;
  
  // Exit info (if auto cash-out)
  exitYesProceeds: number | null;
  exitNoProceeds: number | null;
  feesTotal: number | null;
  
  errorMessage: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Order Types
// ============================================

export interface Order {
  id: string;
  tradeRunId: string;
  
  clobOrderId: string | null;
  clientOrderId: string;
  
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  filledSize: number;
  
  status: OrderStatus;
  
  placedAt: Date | null;
  filledAt: Date | null;
  cancelledAt: Date | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderCreateInput {
  tradeRunId: string;
  clientOrderId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
}

// ============================================
// Fill Types
// ============================================

export interface Fill {
  id: string;
  orderId: string;
  clobTradeId: string;
  
  price: number;
  size: number;
  fee: number;
  
  filledAt: Date;
  createdAt: Date;
}

// ============================================
// Position & PnL Types
// ============================================

export interface Position {
  id: string;
  userId: string;
  tokenId: string;
  marketId: string;
  
  size: number;
  avgEntryPrice: number;
  
  updatedAt: Date;
}

export interface PnlRecord {
  id: string;
  userId: string;
  marketId: string;
  date: Date;
  
  pnl: number;
  volume: number;
  fees: number;
  tradesCount: number;
  
  createdAt: Date;
}

export interface DailyPnlSummary {
  date: Date;
  pnl: number;
  volume: number;
  fees: number;
  tradesCount: number;
}

// ============================================
// Polymarket API Types
// ============================================

export interface PolymarketApiCredentials {
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
}

export interface ClobOrderResponse {
  orderId: string;
  clientOrderId: string;
  status: string;
}

export interface ClobOrderbook {
  tokenId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

// ============================================
// WebSocket Event Types
// ============================================

export interface WsSubscribeMessage {
  type: "subscribe";
  channel: string;
  params?: Record<string, string>;
}

export interface WsUnsubscribeMessage {
  type: "unsubscribe";
  channel: string;
}

export interface WsOrderbookUpdate {
  type: "orderbook_update";
  marketId: string;
  tokenId: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface WsRunUpdate {
  type: "run_update";
  run: TradeRun;
}

export interface WsOrderUpdate {
  type: "order_update";
  order: Order;
}

export interface WsFillEvent {
  type: "fill";
  fill: Fill;
  orderId: string;
  runId: string;
}

export interface WsPositionUpdate {
  type: "position_update";
  position: Position;
}

export interface WsPnlUpdate {
  type: "pnl_update";
  daily: DailyPnlSummary;
}
