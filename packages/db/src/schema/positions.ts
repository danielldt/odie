import { pgTable, uuid, varchar, numeric, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { markets } from "./markets.js";

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenId: varchar("token_id", { length: 100 }).notNull(),
    marketId: varchar("market_id", { length: 100 })
      .notNull()
      .references(() => markets.id),

    size: numeric("size", { precision: 18, scale: 6 }).notNull().default("0"),
    avgEntryPrice: numeric("avg_entry_price", { precision: 10, scale: 6 }).notNull().default("0"),

    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("positions_user_id_idx").on(table.userId),
    userTokenUnique: unique("positions_user_token_unique").on(table.userId, table.tokenId),
  })
);

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
