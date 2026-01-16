import { pgTable, uuid, varchar, numeric, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { markets } from "./markets.js";

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketId: varchar("market_id", { length: 100 })
      .notNull()
      .references(() => markets.id),
    name: varchar("name", { length: 100 }).notNull(),

    // Token configuration
    yesTokenId: varchar("yes_token_id", { length: 100 }).notNull(),
    noTokenId: varchar("no_token_id", { length: 100 }).notNull(),

    // Price & size (using numeric for precision)
    yesLimitPrice: numeric("yes_limit_price", { precision: 10, scale: 6 }).notNull(),
    noLimitPrice: numeric("no_limit_price", { precision: 10, scale: 6 }).notNull(),
    yesSize: numeric("yes_size", { precision: 18, scale: 6 }).notNull(),
    noSize: numeric("no_size", { precision: 18, scale: 6 }).notNull(),

    // Scheduling
    frequencySeconds: integer("frequency_seconds").notNull(),
    maxRuns: integer("max_runs"), // null = unlimited
    runsCompleted: integer("runs_completed").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),

    // Safety parameters
    minLiquidityUsdc: numeric("min_liquidity_usdc", { precision: 18, scale: 2 }).notNull(),
    maxSlippageFromMidpoint: numeric("max_slippage_from_midpoint", { precision: 5, scale: 4 }).notNull(),
    legTimeoutMs: integer("leg_timeout_ms").notNull(),
    autoCashOut: boolean("auto_cash_out").notNull().default(true),

    // Next scheduled run
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("strategies_user_id_idx").on(table.userId),
    userIdEnabledIdx: index("strategies_user_enabled_idx").on(table.userId, table.enabled),
    nextRunAtIdx: index("strategies_next_run_at_idx").on(table.nextRunAt),
  })
);

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
