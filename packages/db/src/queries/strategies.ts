import { eq, and, lte, desc, sql } from "drizzle-orm";
import { db } from "../client.js";
import { strategies, type NewStrategy } from "../schema/strategies.js";

export async function createStrategy(data: NewStrategy) {
  const [strategy] = await db.insert(strategies).values(data).returning();
  return strategy;
}

export async function getStrategyById(id: string) {
  return db.query.strategies.findFirst({
    where: eq(strategies.id, id),
    with: {
      market: true,
    },
  });
}

export async function getUserStrategies(userId: string) {
  return db.query.strategies.findMany({
    where: eq(strategies.userId, userId),
    with: {
      market: true,
    },
    orderBy: [desc(strategies.createdAt)],
  });
}

export async function updateStrategy(id: string, data: Partial<NewStrategy>) {
  const [strategy] = await db
    .update(strategies)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(strategies.id, id))
    .returning();
  return strategy;
}

export async function deleteStrategy(id: string) {
  await db.delete(strategies).where(eq(strategies.id, id));
}

export async function getStrategiesToRun(now: Date) {
  return db.query.strategies.findMany({
    where: and(
      eq(strategies.enabled, true),
      lte(strategies.nextRunAt, now)
    ),
    with: {
      market: true,
    },
  });
}

export async function incrementRunsCompleted(id: string, nextRunAt: Date | null) {
  const [strategy] = await db
    .update(strategies)
    .set({
      runsCompleted: sql`${strategies.runsCompleted} + 1`,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(strategies.id, id))
    .returning();
  return strategy;
}

