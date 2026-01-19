import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  logger.info("Running database migrations...");
  
  const sql = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(sql);
  
  try {
    // In Docker: /app/apps/api/dist/index.js -> /app/packages/db/drizzle
    // __dirname is /app/apps/api/dist, so go up to /app then to packages/db/drizzle
    const migrationsPath = join(__dirname, "../../../packages/db/drizzle");
    await migrate(db, { migrationsFolder: migrationsPath });
    logger.info("Migrations complete!");
  } catch (err) {
    logger.error(err, "Migration failed");
    throw err;
  } finally {
    await sql.end();
  }
}

async function main() {
  // Run migrations before starting server
  try {
    await runMigrations();
  } catch (err) {
    logger.error(err, "Failed to run migrations");
    // Don't continue if migrations fail - the DB schema is required
    process.exit(1);
  }

  const app = await createApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Server running at http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err, "Failed to start server");
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    
    try {
      await app.close();
      logger.info("Server closed");
      process.exit(0);
    } catch (err) {
      logger.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
