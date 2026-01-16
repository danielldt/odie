import { pgTable, uuid, varchar, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 42 }).notNull(),
    chainId: integer("chain_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("wallets_user_id_idx").on(table.userId),
    addressUnique: unique("wallets_address_unique").on(table.address),
  })
);

export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
