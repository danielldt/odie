import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db } from "../client.js";
import { pnlRecords, type NewPnlRecord } from "../schema/pnl.js";

export async function upsertPnlRecord(data: NewPnlRecord) {
  const [record] = await db
    .insert(pnlRecords)
    .values(data)
    .onConflictDoUpdate({
      target: [pnlRecords.userId, pnlRecords.marketId, pnlRecords.date],
      set: {
        pnl: sql`${pnlRecords.pnl} + ${data.pnl}`,
        volume: sql`${pnlRecords.volume} + ${data.volume}`,
        fees: sql`${pnlRecords.fees} + ${data.fees}`,
        tradesCount: sql`${pnlRecords.tradesCount} + ${data.tradesCount}`,
      },
    })
    .returning();
  return record;
}

export async function getDailyPnl(userId: string, params: {
  marketId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const conditions = [eq(pnlRecords.userId, userId)];

  if (params.marketId) {
    conditions.push(eq(pnlRecords.marketId, params.marketId));
  }

  if (params.startDate) {
    conditions.push(gte(pnlRecords.date, params.startDate.toISOString().split("T")[0]!));
  }

  if (params.endDate) {
    conditions.push(lte(pnlRecords.date, params.endDate.toISOString().split("T")[0]!));
  }

  return db.query.pnlRecords.findMany({
    where: and(...conditions),
    orderBy: [desc(pnlRecords.date)],
  });
}

export async function getAggregatedPnl(userId: string, params: {
  marketId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const conditions = [eq(pnlRecords.userId, userId)];

  if (params.marketId) {
    conditions.push(eq(pnlRecords.marketId, params.marketId));
  }

  if (params.startDate) {
    conditions.push(gte(pnlRecords.date, params.startDate.toISOString().split("T")[0]!));
  }

  if (params.endDate) {
    conditions.push(lte(pnlRecords.date, params.endDate.toISOString().split("T")[0]!));
  }

  const result = await db
    .select({
      totalPnl: sql<number>`COALESCE(SUM(${pnlRecords.pnl}), 0)`,
      totalVolume: sql<number>`COALESCE(SUM(${pnlRecords.volume}), 0)`,
      totalFees: sql<number>`COALESCE(SUM(${pnlRecords.fees}), 0)`,
      totalTrades: sql<number>`COALESCE(SUM(${pnlRecords.tradesCount}), 0)`,
    })
    .from(pnlRecords)
    .where(and(...conditions));

  return result[0] ?? { totalPnl: 0, totalVolume: 0, totalFees: 0, totalTrades: 0 };
}
