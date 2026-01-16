import Fastify, { type FastifyBaseLogger } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { authRoutes } from "./routes/auth.js";
import { walletRoutes } from "./routes/wallets.js";
import { credentialRoutes } from "./routes/credentials.js";
import { marketRoutes } from "./routes/markets.js";
import { strategyRoutes } from "./routes/strategies.js";
import { runRoutes } from "./routes/runs.js";
import { orderRoutes } from "./routes/orders.js";
import { fillRoutes } from "./routes/fills.js";
import { pnlRoutes } from "./routes/pnl.js";
import { wsHandler } from "./ws/handler.js";
import { errorHandler } from "./lib/error-handler.js";

export async function createApp() {
  const app = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });

  // Plugins
  await app.register(cors, {
    origin: [config.frontendUrl],
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
  });

  await app.register(websocket);

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // API routes
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(walletRoutes, { prefix: "/v1/wallets" });
  await app.register(credentialRoutes, { prefix: "/v1/credentials" });
  await app.register(marketRoutes, { prefix: "/v1/markets" });
  await app.register(strategyRoutes, { prefix: "/v1/strategies" });
  await app.register(runRoutes, { prefix: "/v1/runs" });
  await app.register(orderRoutes, { prefix: "/v1/orders" });
  await app.register(fillRoutes, { prefix: "/v1/fills" });
  await app.register(pnlRoutes, { prefix: "/v1/pnl" });

  // WebSocket
  await app.register(wsHandler, { prefix: "/ws" });

  return app;
}
