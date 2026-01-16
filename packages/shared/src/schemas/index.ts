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
// Strategy Schemas
// ============================================

export const strategyCreateSchema = z.object({
  marketId: z.string(),
  name: z.string().min(1).max(100),
  
  yesTokenId: z.string(),
  noTokenId: z.string(),
  
  yesLimitPrice: z.number().min(0.001).max(0.999),
  noLimitPrice: z.number().min(0.001).max(0.999),
  yesSize: z.number().positive(),
  noSize: z.number().positive(),
  
  frequencySeconds: z.number().int().min(60),
  maxRuns: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  
  minLiquidityUsdc: z.number().positive().optional().default(SAFETY_DEFAULTS.MIN_LIQUIDITY_USDC),
  maxSlippageFromMidpoint: z.number().min(0).max(1).optional().default(SAFETY_DEFAULTS.MAX_SLIPPAGE_FROM_MIDPOINT),
  legTimeoutMs: z.number().int().positive().optional().default(SAFETY_DEFAULTS.DEFAULT_LEG_TIMEOUT_MS),
  autoCashOut: z.boolean().optional().default(true),
}).refine(
  (data) => data.yesLimitPrice + data.noLimitPrice < 1 - SAFETY_DEFAULTS.FEE_BUFFER,
  { message: "YES + NO prices must be less than 1 minus fee buffer for arbitrage edge" }
);

// Base schema without refinement for partial updates
const strategyBaseSchema = z.object({
  marketId: z.string(),
  name: z.string().min(1).max(100),
  yesTokenId: z.string(),
  noTokenId: z.string(),
  yesLimitPrice: z.number().min(0.001).max(0.999),
  noLimitPrice: z.number().min(0.001).max(0.999),
  yesSize: z.number().positive(),
  noSize: z.number().positive(),
  frequencySeconds: z.number().int().min(60),
  maxRuns: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  minLiquidityUsdc: z.number().positive().optional().default(SAFETY_DEFAULTS.MIN_LIQUIDITY_USDC),
  maxSlippageFromMidpoint: z.number().min(0).max(1).optional().default(SAFETY_DEFAULTS.MAX_SLIPPAGE_FROM_MIDPOINT),
  legTimeoutMs: z.number().int().positive().optional().default(SAFETY_DEFAULTS.DEFAULT_LEG_TIMEOUT_MS),
  autoCashOut: z.boolean().optional().default(true),
});

export const strategyUpdateSchema = strategyBaseSchema.partial().omit({
  marketId: true,
  yesTokenId: true,
  noTokenId: true,
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
