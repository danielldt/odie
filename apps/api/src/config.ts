import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Railway provides PORT, fallback to API_PORT for local dev
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  CREDENTIALS_MASTER_KEY: z.string().min(32),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
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
  // Use PORT (Railway) if available, otherwise API_PORT
  port: env.PORT || env.API_PORT,
  host: env.API_HOST,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwt: {
    secret: env.JWT_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
  credentialsMasterKey: env.CREDENTIALS_MASTER_KEY,
  frontendUrl: env.FRONTEND_URL,
};
