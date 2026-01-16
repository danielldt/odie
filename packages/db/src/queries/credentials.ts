import { eq, and, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { userCredentials, type NewUserCredential } from "../schema/credentials.js";

export async function createCredential(data: NewUserCredential) {
  const [credential] = await db.insert(userCredentials).values(data).returning();
  return credential;
}

export async function getActiveCredentialForUser(userId: string) {
  return db.query.userCredentials.findFirst({
    where: and(
      eq(userCredentials.userId, userId),
      isNull(userCredentials.revokedAt)
    ),
  });
}

export async function getActiveCredentialForWallet(walletId: string) {
  return db.query.userCredentials.findFirst({
    where: and(
      eq(userCredentials.walletId, walletId),
      isNull(userCredentials.revokedAt)
    ),
  });
}

export async function revokeCredential(id: string) {
  await db
    .update(userCredentials)
    .set({ revokedAt: new Date() })
    .where(eq(userCredentials.id, id));
}

export async function revokeAllUserCredentials(userId: string) {
  await db
    .update(userCredentials)
    .set({ revokedAt: new Date() })
    .where(and(eq(userCredentials.userId, userId), isNull(userCredentials.revokedAt)));
}
