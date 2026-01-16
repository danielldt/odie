import { eq, and } from "drizzle-orm";
import { db } from "../client.js";
import { positions, type NewPosition } from "../schema/positions.js";

export async function upsertPosition(data: NewPosition) {
  const [position] = await db
    .insert(positions)
    .values(data)
    .onConflictDoUpdate({
      target: [positions.userId, positions.tokenId],
      set: {
        size: data.size,
        avgEntryPrice: data.avgEntryPrice,
        updatedAt: new Date(),
      },
    })
    .returning();
  return position;
}

export async function getPositionByUserAndToken(userId: string, tokenId: string) {
  return db.query.positions.findFirst({
    where: and(eq(positions.userId, userId), eq(positions.tokenId, tokenId)),
  });
}

export async function getUserPositions(userId: string) {
  return db.query.positions.findMany({
    where: eq(positions.userId, userId),
    with: {
      market: true,
    },
  });
}

export async function getPositionsByMarket(userId: string, marketId: string) {
  return db.query.positions.findMany({
    where: and(eq(positions.userId, userId), eq(positions.marketId, marketId)),
  });
}

export async function deletePosition(userId: string, tokenId: string) {
  await db
    .delete(positions)
    .where(and(eq(positions.userId, userId), eq(positions.tokenId, tokenId)));
}
