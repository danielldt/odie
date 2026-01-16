import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { Redis } from "ioredis";
import { config } from "../config.js";

const redis = new Redis(config.redisUrl);

interface RateLimitOptions {
  max: number;
  windowMs: number;
}

const defaultOptions: RateLimitOptions = {
  max: 100,
  windowMs: 60 * 1000, // 1 minute
};

async function rateLimitPlugin(
  fastify: FastifyInstance,
  options: Partial<RateLimitOptions> = {}
) {
  const opts = { ...defaultOptions, ...options };

  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip rate limiting for health checks
    if (request.url === "/health") return;

    const key = `ratelimit:${request.ip}`;
    
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.pexpire(key, opts.windowMs);
      }

      const ttl = await redis.pttl(key);
      
      reply.header("X-RateLimit-Limit", opts.max);
      reply.header("X-RateLimit-Remaining", Math.max(0, opts.max - current));
      reply.header("X-RateLimit-Reset", Math.ceil((Date.now() + ttl) / 1000));

      if (current > opts.max) {
        reply.status(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again in ${Math.ceil(ttl / 1000)} seconds.`,
        });
      }
    } catch (error) {
      // If Redis fails, allow the request (fail open)
      request.log.warn(error, "Rate limiting failed");
    }
  });
}

export default fp(rateLimitPlugin, {
  name: "rate-limit",
});
