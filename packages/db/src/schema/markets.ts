import { pgTable, varchar, text, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const markets = pgTable(
  "markets",
  {
    id: varchar("id", { length: 100 }).primaryKey(), // Gamma market ID
    slug: varchar("slug", { length: 255 }).notNull(),
    question: text("question").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    closed: boolean("closed").notNull().default(false),
    // JSON: outcomes array, tokens with IDs, tick size, etc.
    metadataJson: jsonb("metadata_json"),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeIdx: index("markets_active_idx").on(table.active),
    updatedAtIdx: index("markets_updated_at_idx").on(table.updatedAt),
    slugIdx: index("markets_slug_idx").on(table.slug),
  })
);

export type Market = typeof markets.$inferSelect;
export type NewMarket = typeof markets.$inferInsert;
