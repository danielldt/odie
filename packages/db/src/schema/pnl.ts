import { pgTable, uuid, varchar, numeric, date, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { markets } from "./markets.js";

export const pnlRecords = pgTable(
  "pnl_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    marketId: varchar("market_id", { length: 100 })
      .notNull()
      .references(() => markets.id),
    
    date: date("date").notNull(),

    pnl: numeric("pnl", { precision: 18, scale: 6 }).notNull().default("0"),
    volume: numeric("volume", { precision: 18, scale: 6 }).notNull().default("0"),
    fees: numeric("fees", { precision: 18, scale: 6 }).notNull().default("0"),
    tradesCount: integer("trades_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("pnl_records_user_id_idx").on(table.userId),
    userMarketDateUnique: unique("pnl_records_user_market_date_unique").on(
      table.userId,
      table.marketId,
      table.date
    ),
    dateIdx: index("pnl_records_date_idx").on(table.date),
  })
);

export type PnlRecord = typeof pnlRecords.$inferSelect;
export type NewPnlRecord = typeof pnlRecords.$inferInsert;
