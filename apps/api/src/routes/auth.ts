import type { FastifyInstance } from "fastify";
import * as argon2 from "argon2";
import { registerSchema, loginSchema, refreshTokenSchema } from "@odie/shared/schemas";
import {
  createUser,
  getUserByEmail,
  createRefreshToken,
  getValidRefreshToken,
  revokeRefreshToken,
} from "@odie/db";
import { generateTokens, type JwtPayload } from "../lib/auth.js";
import { hashToken, generateToken } from "../lib/crypto.js";
import { BadRequestError, UnauthorizedError } from "../lib/error-handler.js";

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post("/register", async (request, reply) => {
    const { email, password } = registerSchema.parse(request.body);

    // Check if user exists
    const existing = await getUserByEmail(email);
    if (existing) {
      throw new BadRequestError("Email already registered");
    }

    // Hash password
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Create user
    const user = await createUser({
      email,
      passwordHash,
    });

    if (!user) {
      throw new BadRequestError("Failed to create user");
    }

    // Generate tokens
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const tokens = await generateTokens(app, payload);

    // Store refresh token hash
    const refreshTokenHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await createRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    });

    return reply.status(201).send({
      user: { id: user.id, email: user.email },
      ...tokens,
    });
  });

  // Login
  app.post("/login", async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    // Find user
    const user = await getUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Verify password
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Generate tokens
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const tokens = await generateTokens(app, payload);

    // Store refresh token hash
    const refreshTokenHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createRefreshToken({
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
    });

    return {
      user: { id: user.id, email: user.email },
      ...tokens,
    };
  });

  // Refresh token
  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body);

    // Find valid refresh token
    const tokenHash = hashToken(refreshToken);
    const storedToken = await getValidRefreshToken(tokenHash);
    
    if (!storedToken) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Revoke old token (rotation)
    await revokeRefreshToken(storedToken.id);

    // Verify JWT and get payload
    let payload: JwtPayload;
    try {
      payload = app.jwt.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedError("Invalid refresh token");
    }

    // Generate new tokens
    const newPayload: JwtPayload = { sub: payload.sub, email: payload.email };
    const tokens = await generateTokens(app, newPayload);

    // Store new refresh token
    const newTokenHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createRefreshToken({
      userId: payload.sub,
      tokenHash: newTokenHash,
      expiresAt,
    });

    return tokens;
  });

  // Logout (revoke refresh token)
  app.post("/logout", async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body);
    
    const tokenHash = hashToken(refreshToken);
    const storedToken = await getValidRefreshToken(tokenHash);
    
    if (storedToken) {
      await revokeRefreshToken(storedToken.id);
    }

    return { success: true };
  });
}
