import { relations } from "drizzle-orm";
import { users, refreshTokens } from "./users.js";
import { wallets } from "./wallets.js";
import { userCredentials } from "./credentials.js";
import { markets } from "./markets.js";
import { strategies } from "./strategies.js";
import { tradeRuns } from "./trade-runs.js";
import { orders } from "./orders.js";
import { fills } from "./fills.js";
import { positions } from "./positions.js";
import { pnlRecords } from "./pnl.js";

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(wallets),
  credentials: many(userCredentials),
  strategies: many(strategies),
  tradeRuns: many(tradeRuns),
  positions: many(positions),
  pnlRecords: many(pnlRecords),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

// Wallet relations
export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  credentials: many(userCredentials),
}));

// Credential relations
export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  user: one(users, {
    fields: [userCredentials.userId],
    references: [users.id],
  }),
  wallet: one(wallets, {
    fields: [userCredentials.walletId],
    references: [wallets.id],
  }),
}));

// Market relations
export const marketsRelations = relations(markets, ({ many }) => ({
  strategies: many(strategies),
  positions: many(positions),
  pnlRecords: many(pnlRecords),
}));

// Strategy relations
export const strategiesRelations = relations(strategies, ({ one, many }) => ({
  user: one(users, {
    fields: [strategies.userId],
    references: [users.id],
  }),
  market: one(markets, {
    fields: [strategies.marketId],
    references: [markets.id],
  }),
  tradeRuns: many(tradeRuns),
}));

// Trade run relations
export const tradeRunsRelations = relations(tradeRuns, ({ one, many }) => ({
  strategy: one(strategies, {
    fields: [tradeRuns.strategyId],
    references: [strategies.id],
  }),
  user: one(users, {
    fields: [tradeRuns.userId],
    references: [users.id],
  }),
  orders: many(orders),
}));

// Order relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  tradeRun: one(tradeRuns, {
    fields: [orders.tradeRunId],
    references: [tradeRuns.id],
  }),
  fills: many(fills),
}));

// Fill relations
export const fillsRelations = relations(fills, ({ one }) => ({
  order: one(orders, {
    fields: [fills.orderId],
    references: [orders.id],
  }),
}));

// Position relations
export const positionsRelations = relations(positions, ({ one }) => ({
  user: one(users, {
    fields: [positions.userId],
    references: [users.id],
  }),
  market: one(markets, {
    fields: [positions.marketId],
    references: [markets.id],
  }),
}));

// PnL relations
export const pnlRecordsRelations = relations(pnlRecords, ({ one }) => ({
  user: one(users, {
    fields: [pnlRecords.userId],
    references: [users.id],
  }),
  market: one(markets, {
    fields: [pnlRecords.marketId],
    references: [markets.id],
  }),
}));
