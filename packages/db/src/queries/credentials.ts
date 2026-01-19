import { eq, and, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { userCredentials, type NewUserCredential } from "../schema/credentials.js";

export async function createCredential(data: NewUserCredential) {
  const result = await db.insert(userCredentials).values(data).returning();
  return result[0];
}

export async function getActiveCredentialForUser(userId: string) {
  if (!userId) return null;
  const result = await db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.userId, userId), isNull(userCredentials.revokedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function getActiveCredentialForWallet(walletId: string) {
  if (!walletId) return null;
  const result = await db
    .select()
    .from(userCredentials)
    .where(and(eq(userCredentials.walletId, walletId), isNull(userCredentials.revokedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function revokeCredential(id: string) {
  if (!id) return;
  await db
    .update(userCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(userCredentials.id, id));
}

export async function revokeAllUserCredentials(userId: string) {
  if (!userId) return;
  await db
    .update(userCredentials)
    .set({ revokedAt: new Date() })
    .where(and(eq(userCredentials.userId, userId), isNull(userCredentials.revokedAt)));
}
