import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../client.js";
import { tradeRuns, type NewTradeRun } from "../schema/trade-runs.js";

export async function createTradeRun(data: NewTradeRun) {
  const [run] = await db.insert(tradeRuns).values(data).returning();
  return run;
}

export async function getTradeRunById(id: string) {
  return db.query.tradeRuns.findFirst({
    where: eq(tradeRuns.id, id),
    with: {
      orders: {
        with: {
          fills: true,
        },
      },
    },
  });
}

export async function getTradeRunByIdempotencyKey(key: string) {
  return db.query.tradeRuns.findFirst({
    where: eq(tradeRuns.idempotencyKey, key),
  });
}

export async function getUserTradeRuns(userId: string, params: {
  strategyId?: string;
  status?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [eq(tradeRuns.userId, userId)];
  
  if (params.strategyId) {
    conditions.push(eq(tradeRuns.strategyId, params.strategyId));
  }
  
  if (params.status) {
    conditions.push(eq(tradeRuns.status, params.status));
  }

  const where = and(...conditions);

  const results = await db.query.tradeRuns.findMany({
    where,
    limit: params.limit,
    offset: params.offset,
    orderBy: [desc(tradeRuns.scheduledFor)],
    with: {
      orders: true,
    },
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tradeRuns)
    .where(where);

  return {
    runs: results,
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function updateTradeRun(id: string, data: Partial<NewTradeRun>) {
  const [run] = await db
    .update(tradeRuns)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tradeRuns.id, id))
    .returning();
  return run;
}

export async function getActiveRunsForStrategy(strategyId: string) {
  return db.query.tradeRuns.findMany({
    where: and(
      eq(tradeRuns.strategyId, strategyId),
      eq(tradeRuns.status, "running")
    ),
  });
}
