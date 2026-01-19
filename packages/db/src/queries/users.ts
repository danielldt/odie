import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "../client.js";
import { users, refreshTokens, type NewUser, type NewRefreshToken } from "../schema/users.js";

export async function createUser(data: NewUser) {
  const result = await db.insert(users).values(data).returning();
  return result[0];
}

export async function getUserByEmail(email: string) {
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0] ?? null;
}

export async function getUserById(id: string) {
  if (!id) return null;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createRefreshToken(data: NewRefreshToken) {
  const result = await db.insert(refreshTokens).values(data).returning();
  return result[0];
}

export async function getValidRefreshToken(tokenHash: string) {
  const result = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function revokeRefreshToken(id: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}

export async function revokeAllUserRefreshTokens(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
