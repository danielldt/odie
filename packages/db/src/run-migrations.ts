import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(connectionString: string) {
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  console.log("Running database migrations...");
  
  try {
    await migrate(db, { 
      migrationsFolder: path.join(__dirname, "../drizzle") 
    });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await sql.end();
  }
}
