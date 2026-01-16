import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { WS_EVENTS } from "@odie/shared";

interface WsClient {
  socket: WebSocket;
  userId: string | null;
  subscriptions: Set<string>;
}

// In-memory client registry (use Redis pub/sub for multi-instance)
const clients = new Map<WebSocket, WsClient>();

export async function wsHandler(app: FastifyInstance) {
  app.get("/", { websocket: true }, (socket, request) => {
    const client: WsClient = {
      socket,
      userId: null,
      subscriptions: new Set(),
    };
    clients.set(socket, client);

    request.log.info("WebSocket client connected");

    socket.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(app, client, message, request);
      } catch (error) {
        sendError(socket, "Invalid message format");
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
      request.log.info("WebSocket client disconnected");
    });

    socket.on("error", (error) => {
      request.log.error(error, "WebSocket error");
      clients.delete(socket);
    });
  });
}

async function handleMessage(
  app: FastifyInstance,
  client: WsClient,
  message: { type: string; channel?: string; token?: string },
  request: any
) {
  switch (message.type) {
    case "auth": {
      // Authenticate with JWT
      if (!message.token) {
        sendError(client.socket, "Token required for auth");
        return;
      }

      try {
        const payload = app.jwt.verify<{ sub: string }>(message.token);
        client.userId = payload.sub;
        send(client.socket, { type: "auth_success", userId: client.userId });
        request.log.info({ userId: client.userId }, "WebSocket client authenticated");
      } catch {
        sendError(client.socket, "Invalid token");
      }
      break;
    }

    case WS_EVENTS.SUBSCRIBE: {
      if (!message.channel) {
        sendError(client.socket, "Channel required for subscribe");
        return;
      }

      // Some channels require auth
      const authRequiredChannels = ["run_update", "order_update", "fill", "position_update", "pnl_update"];
      if (authRequiredChannels.some((c) => message.channel!.startsWith(c)) && !client.userId) {
        sendError(client.socket, "Authentication required for this channel");
        return;
      }

      client.subscriptions.add(message.channel);
      send(client.socket, { type: "subscribed", channel: message.channel });
      break;
    }

    case WS_EVENTS.UNSUBSCRIBE: {
      if (!message.channel) {
        sendError(client.socket, "Channel required for unsubscribe");
        return;
      }

      client.subscriptions.delete(message.channel);
      send(client.socket, { type: "unsubscribed", channel: message.channel });
      break;
    }

    default:
      sendError(client.socket, `Unknown message type: ${message.type}`);
  }
}

function send(socket: WebSocket, data: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function sendError(socket: WebSocket, message: string) {
  send(socket, { type: WS_EVENTS.ERROR, message });
}

// ============================================
// Broadcast functions (called from worker/other services)
// ============================================

export function broadcastToUser(userId: string, event: string, data: unknown) {
  for (const [, client] of clients) {
    if (client.userId === userId && client.subscriptions.has(event)) {
      send(client.socket, { type: event, data });
    }
  }
}

export function broadcastToChannel(channel: string, data: unknown) {
  for (const [, client] of clients) {
    if (client.subscriptions.has(channel)) {
      send(client.socket, { type: channel, data });
    }
  }
}

export function broadcastRunUpdate(userId: string, run: unknown) {
  broadcastToUser(userId, `run_update`, run);
}

export function broadcastOrderUpdate(userId: string, order: unknown) {
  broadcastToUser(userId, `order_update`, order);
}

export function broadcastFill(userId: string, fill: unknown) {
  broadcastToUser(userId, `fill`, fill);
}

export function broadcastPositionUpdate(userId: string, position: unknown) {
  broadcastToUser(userId, `position_update`, position);
}

export function broadcastPnlUpdate(userId: string, pnl: unknown) {
  broadcastToUser(userId, `pnl_update`, pnl);
}
