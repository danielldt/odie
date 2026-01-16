import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

let connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  connectionString = "postgresql://odie:odie_secret@localhost:5432/odie_polymarket";
}

// For query purposes - postgres.js handles connection pooling internally
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

// For migrations
export function createMigrationClient() {
  return postgres(connectionString!, { max: 1 });
}

export type Database = typeof db;
