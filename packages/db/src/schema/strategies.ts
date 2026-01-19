import { pgTable, uuid, varchar, numeric, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),

    // NEW: Series-based strategy (e.g., "btc-updown-15m")
    // If set, the worker will auto-find the current active market in this series
    seriesSlug: varchar("series_slug", { length: 200 }),

    // LEGACY: Specific market (for backward compatibility)
    // If seriesSlug is set, these are ignored and resolved at runtime
    marketId: varchar("market_id", { length: 100 }),
    yesTokenId: varchar("yes_token_id", { length: 100 }),
    noTokenId: varchar("no_token_id", { length: 100 }),

    // NEW: Simplified pricing (same limit price for YES and NO)
    // This is the max price you'll pay for each side
    limitPrice: numeric("limit_price", { precision: 10, scale: 6 }).notNull().default("0.49"),
    
    // NEW: Position size in USDC (total amount to spend on both legs)
    positionSizeUsdc: numeric("position_size_usdc", { precision: 18, scale: 2 }).notNull().default("50"),

    // LEGACY: Separate prices and sizes (for backward compatibility)
    yesLimitPrice: numeric("yes_limit_price", { precision: 10, scale: 6 }),
    noLimitPrice: numeric("no_limit_price", { precision: 10, scale: 6 }),
    yesSize: numeric("yes_size", { precision: 18, scale: 6 }),
    noSize: numeric("no_size", { precision: 18, scale: 6 }),

    // Scheduling
    frequencySeconds: integer("frequency_seconds").notNull().default(60),
    maxRuns: integer("max_runs"), // null = unlimited
    runsCompleted: integer("runs_completed").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),

    // Safety parameters
    minLiquidityUsdc: numeric("min_liquidity_usdc", { precision: 18, scale: 2 }).notNull().default("10"),
    maxSlippageFromMidpoint: numeric("max_slippage_from_midpoint", { precision: 5, scale: 4 }).notNull().default("0.02"),
    legTimeoutMs: integer("leg_timeout_ms").notNull().default(30000),
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
    seriesSlugIdx: index("strategies_series_slug_idx").on(table.seriesSlug),
  })
);

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
