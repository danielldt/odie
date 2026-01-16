import { pgTable, uuid, varchar, numeric, timestamp, text, index, unique } from "drizzle-orm/pg-core";
import { strategies } from "./strategies.js";
import { users } from "./users.js";

export const tradeRuns = pgTable(
  "trade_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    strategyId: uuid("strategy_id")
      .notNull()
      .references(() => strategies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    // pending | running | filled | cancelled | failed | hedged
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    
    // Idempotency key: hash(userId, strategyId, scheduledTimeRounded)
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),

    // Entry costs (after fill)
    entryYesCost: numeric("entry_yes_cost", { precision: 18, scale: 6 }),
    entryNoCost: numeric("entry_no_cost", { precision: 18, scale: 6 }),

    // Exit proceeds (if auto cash-out)
    exitYesProceeds: numeric("exit_yes_proceeds", { precision: 18, scale: 6 }),
    exitNoProceeds: numeric("exit_no_proceeds", { precision: 18, scale: 6 }),
    feesTotal: numeric("fees_total", { precision: 18, scale: 6 }),

    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    strategyIdIdx: index("trade_runs_strategy_id_idx").on(table.strategyId),
    userIdIdx: index("trade_runs_user_id_idx").on(table.userId),
    userScheduledIdx: index("trade_runs_user_scheduled_idx").on(table.userId, table.scheduledFor),
    statusIdx: index("trade_runs_status_idx").on(table.status),
    idempotencyKeyUnique: unique("trade_runs_idempotency_key_unique").on(table.idempotencyKey),
  })
);

export type TradeRun = typeof tradeRuns.$inferSelect;
export type NewTradeRun = typeof tradeRuns.$inferInsert;
