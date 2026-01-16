import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { wallets, type NewWallet } from "../schema/wallets.js";

export async function createWallet(data: NewWallet) {
  const [wallet] = await db.insert(wallets).values(data).returning();
  return wallet;
}

export async function getWalletByAddress(address: string) {
  return db.query.wallets.findFirst({
    where: eq(wallets.address, address.toLowerCase()),
  });
}

export async function getWalletById(id: string) {
  return db.query.wallets.findFirst({
    where: eq(wallets.id, id),
  });
}

export async function getUserWallets(userId: string) {
  return db.query.wallets.findMany({
    where: eq(wallets.userId, userId),
  });
}
