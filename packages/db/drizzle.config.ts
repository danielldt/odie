import type { Config } from "drizzle-kit";

export default {
  schema: "./dist/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://odie:odie_secret@localhost:5432/odie_polymarket",
  },
} satisfies Config;
