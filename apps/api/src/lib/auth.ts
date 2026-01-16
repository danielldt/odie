import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError } from "./error-handler.js";

export interface JwtPayload {
  sub: string;
  email: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch (err) {
    throw new UnauthorizedError("Invalid or expired token");
  }
}

export function getUserId(request: FastifyRequest): string {
  const user = request.user;
  if (!user?.sub) {
    throw new UnauthorizedError("User not authenticated");
  }
  return user.sub;
}

export async function generateTokens(
  app: FastifyInstance,
  payload: JwtPayload
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = app.jwt.sign(payload, { expiresIn: "15m" });
  const refreshToken = app.jwt.sign(payload, { expiresIn: "7d" });
  
  return { accessToken, refreshToken };
}
