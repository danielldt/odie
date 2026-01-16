import { pgTable, uuid, varchar, integer, timestamp, text, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { wallets } from "./wallets.js";

export const userCredentials = pgTable(
  "user_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull().default("polymarket_clob"),
    // Encrypted credentials blob (AES-256-GCM)
    encryptedBlob: text("encrypted_blob").notNull(),
    // Initialization vector for decryption
    iv: varchar("iv", { length: 32 }).notNull(),
    // Key version for rotation support
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("user_credentials_user_id_idx").on(table.userId),
    userIdRevokedIdx: index("user_credentials_user_revoked_idx").on(table.userId, table.revokedAt),
  })
);

export type UserCredential = typeof userCredentials.$inferSelect;
export type NewUserCredential = typeof userCredentials.$inferInsert;
