import { pgTable, uuid, varchar, numeric, timestamp, index, unique } from "drizzle-orm/pg-core";
import { tradeRuns } from "./trade-runs.js";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tradeRunId: uuid("trade_run_id")
      .notNull()
      .references(() => tradeRuns.id, { onDelete: "cascade" }),

    // CLOB order ID (assigned by Polymarket)
    clobOrderId: varchar("clob_order_id", { length: 100 }),
    // Our client order ID (for idempotency)
    clientOrderId: varchar("client_order_id", { length: 100 }).notNull(),

    tokenId: varchar("token_id", { length: 100 }).notNull(),
    side: varchar("side", { length: 10 }).notNull(), // BUY | SELL
    price: numeric("price", { precision: 10, scale: 6 }).notNull(),
    size: numeric("size", { precision: 18, scale: 6 }).notNull(),
    filledSize: numeric("filled_size", { precision: 18, scale: 6 }).notNull().default("0"),

    // pending | open | filled | partially_filled | cancelled | failed
    status: varchar("status", { length: 20 }).notNull().default("pending"),

    placedAt: timestamp("placed_at", { withTimezone: true }),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tradeRunIdIdx: index("orders_trade_run_id_idx").on(table.tradeRunId),
    statusIdx: index("orders_status_idx").on(table.status),
    clobOrderIdUnique: unique("orders_clob_order_id_unique").on(table.clobOrderId),
    clientOrderIdUnique: unique("orders_client_order_id_unique").on(table.clientOrderId),
  })
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
