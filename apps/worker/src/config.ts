import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  CREDENTIALS_MASTER_KEY: z.string().min(32),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  POLYMARKET_CLOB_URL: z.string().default("https://clob.polymarket.com"),
  POLYMARKET_CLOB_WS_URL: z.string().default("wss://ws-subscriptions-clob.polymarket.com/ws/"),
  POLYMARKET_DATA_API_URL: z.string().default("https://data-api.polymarket.com"),
});

let env: z.infer<typeof envSchema>;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Invalid environment variables:");
    error.errors.forEach((err) => {
      console.error(`  - ${err.path.join(".")}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export const config = {
  env: env.NODE_ENV,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  credentialsMasterKey: env.CREDENTIALS_MASTER_KEY,
  concurrency: env.WORKER_CONCURRENCY,
  polymarket: {
    clobUrl: env.POLYMARKET_CLOB_URL,
    clobWsUrl: env.POLYMARKET_CLOB_WS_URL,
    dataApiUrl: env.POLYMARKET_DATA_API_URL,
  },
};
