// Polymarket API endpoints
export const POLYMARKET_CLOB_URL = "https://clob.polymarket.com";
export const POLYMARKET_CLOB_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/";
export const POLYMARKET_DATA_API_URL = "https://data-api.polymarket.com";
export const POLYMARKET_GAMMA_API_URL = "https://gamma-api.polymarket.com";
export const POLYMARKET_CHAIN_ID = 137; // Polygon

// Order statuses
export const ORDER_STATUS = {
  PENDING: "pending",
  OPEN: "open",
  FILLED: "filled",
  PARTIALLY_FILLED: "partially_filled",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;

// Trade run statuses
export const RUN_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  FILLED: "filled",
  CANCELLED: "cancelled",
  FAILED: "failed",
  HEDGED: "hedged",
} as const;

// Strategy frequency presets (seconds)
export const FREQUENCY_PRESETS = {
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  FIFTEEN_MINUTES: 900,
  THIRTY_MINUTES: 1800,
  ONE_HOUR: 3600,
} as const;

// Safety defaults
export const SAFETY_DEFAULTS = {
  MIN_ARB_EDGE: 0.01, // 1% minimum edge after fees
  DEFAULT_LEG_TIMEOUT_MS: 30000, // 30 seconds
  MAX_SLIPPAGE_FROM_MIDPOINT: 0.05, // 5%
  MIN_LIQUIDITY_USDC: 100, // $100 minimum liquidity per side
  FEE_BUFFER: 0.002, // 0.2% fee buffer
} as const;

// WebSocket event types
export const WS_EVENTS = {
  // Client -> Server
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
  
  // Server -> Client
  ORDERBOOK_UPDATE: "orderbook_update",
  RUN_UPDATE: "run_update",
  ORDER_UPDATE: "order_update",
  FILL: "fill",
  POSITION_UPDATE: "position_update",
  PNL_UPDATE: "pnl_update",
  ERROR: "error",
} as const;
