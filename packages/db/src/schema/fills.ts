import { pgTable, uuid, varchar, numeric, timestamp, index, unique } from "drizzle-orm/pg-core";
import { orders } from "./orders.js";

export const fills = pgTable(
  "fills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    
    // CLOB trade ID (from Polymarket)
    clobTradeId: varchar("clob_trade_id", { length: 100 }).notNull(),

    price: numeric("price", { precision: 10, scale: 6 }).notNull(),
    size: numeric("size", { precision: 18, scale: 6 }).notNull(),
    fee: numeric("fee", { precision: 18, scale: 6 }).notNull().default("0"),

    filledAt: timestamp("filled_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderIdIdx: index("fills_order_id_idx").on(table.orderId),
    filledAtIdx: index("fills_filled_at_idx").on(table.filledAt),
    clobTradeIdUnique: unique("fills_clob_trade_id_unique").on(table.clobTradeId),
  })
);

export type Fill = typeof fills.$inferSelect;
export type NewFill = typeof fills.$inferInsert;
