import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { wallets, type NewWallet } from "../schema/wallets.js";

export async function createWallet(data: NewWallet) {
  const result = await db.insert(wallets).values(data).returning();
  return result[0];
}

export async function getWalletByAddress(address: string) {
  const result = await db.select().from(wallets).where(eq(wallets.address, address.toLowerCase())).limit(1);
  return result[0] ?? null;
}

export async function getWalletById(id: string) {
  if (!id) return null;
  const result = await db.select().from(wallets).where(eq(wallets.id, id)).limit(1);
  return result[0] ?? null;
}

export async function getUserWallets(userId: string) {
  if (!userId) return [];
  return db.select().from(wallets).where(eq(wallets.userId, userId));
}

export async function deleteWallet(id: string, userId: string) {
  if (!id || !userId) return null;
  
  // First verify the wallet belongs to this user
  const existing = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, id))
    .limit(1);
  
  if (!existing[0] || existing[0].userId !== userId) {
    return null;
  }
  
  // Delete only if ownership is verified
  const result = await db
    .delete(wallets)
    .where(eq(wallets.id, id))
    .returning();
  
  return result[0] ?? null;
}
