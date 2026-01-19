import { z } from "zod";
import { SAFETY_DEFAULTS } from "../constants.js";

// ============================================
// Auth Schemas
// ============================================

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

// ============================================
// Wallet Schemas
// ============================================

export const walletVerifySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  chainId: z.number().int().positive(),
  message: z.string(),
  signature: z.string(),
});

export const polymarketCredentialsSchema = z.object({
  walletId: z.string().uuid(),
  apiKey: z.string(),
  apiSecret: z.string(),
  passphrase: z.string(),
});

// ============================================
// Strategy Schemas (Series-based)
// ============================================

// NEW: Simplified strategy schema for series-based trading
export const strategyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  
  // Series slug (e.g., "btc-updown-15m") - system finds current market
  seriesSlug: z.string().min(1).max(200),
  
  // Simplified pricing: same limit price for both YES and NO
  limitPrice: z.number().min(0.01).max(0.49).default(0.49),
  
  // Total USDC to spend per trade (split 50/50 between YES and NO)
  positionSizeUsdc: z.number().min(10).default(50),
  
  // Schedule
  frequencySeconds: z.number().int().min(30).default(60),
  maxRuns: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  
  // Safety (with sensible defaults)
  minLiquidityUsdc: z.number().positive().optional().default(SAFETY_DEFAULTS.MIN_LIQUIDITY_USDC),
  maxSlippageFromMidpoint: z.number().min(0).max(1).optional().default(SAFETY_DEFAULTS.MAX_SLIPPAGE_FROM_MIDPOINT),
  legTimeoutMs: z.number().int().positive().optional().default(30000), // 30 seconds for fast markets
  autoCashOut: z.boolean().optional().default(true),
}).refine(
  (data) => data.limitPrice * 2 < 1 - SAFETY_DEFAULTS.FEE_BUFFER,
  { message: "Limit price too high - need (price × 2) < 0.998 for arbitrage edge" }
);

export const strategyUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  limitPrice: z.number().min(0.01).max(0.49).optional(),
  positionSizeUsdc: z.number().min(10).optional(),
  frequencySeconds: z.number().int().min(30).optional(),
  maxRuns: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional(),
  minLiquidityUsdc: z.number().positive().optional(),
  maxSlippageFromMidpoint: z.number().min(0).max(1).optional(),
  legTimeoutMs: z.number().int().positive().optional(),
  autoCashOut: z.boolean().optional(),
});

// ============================================
// Run & Order Query Schemas
// ============================================

export const runsQuerySchema = z.object({
  strategyId: z.string().uuid().optional(),
  status: z.enum(["pending", "running", "filled", "cancelled", "failed", "hedged"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const ordersQuerySchema = z.object({
  runId: z.string().uuid().optional(),
  status: z.enum(["pending", "open", "filled", "partially_filled", "cancelled", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const fillsQuerySchema = z.object({
  runId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ============================================
// PnL Query Schemas
// ============================================

export const pnlQuerySchema = z.object({
  marketId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

// ============================================
// Market Query Schemas
// ============================================

export const marketsQuerySchema = z.object({
  search: z.string().optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ============================================
// Type exports
// ============================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type WalletVerifyInput = z.infer<typeof walletVerifySchema>;
export type PolymarketCredentialsInput = z.infer<typeof polymarketCredentialsSchema>;
export type StrategyCreateInput = z.infer<typeof strategyCreateSchema>;
export type StrategyUpdateInput = z.infer<typeof strategyUpdateSchema>;
export type RunsQueryInput = z.infer<typeof runsQuerySchema>;
export type OrdersQueryInput = z.infer<typeof ordersQuerySchema>;
export type FillsQueryInput = z.infer<typeof fillsQuerySchema>;
export type PnlQueryInput = z.infer<typeof pnlQuerySchema>;
export type MarketsQueryInput = z.infer<typeof marketsQuerySchema>;
