import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { db } from "../client.js";
import { markets, type NewMarket } from "../schema/markets.js";

export async function upsertMarket(data: NewMarket) {
  const [market] = await db
    .insert(markets)
    .values(data)
    .onConflictDoUpdate({
      target: markets.id,
      set: {
        slug: data.slug,
        question: data.question,
        description: data.description,
        active: data.active,
        closed: data.closed,
        metadataJson: data.metadataJson,
        endDate: data.endDate,
        updatedAt: new Date(),
      },
    })
    .returning();
  return market;
}

export async function getMarketById(id: string) {
  return db.query.markets.findFirst({
    where: eq(markets.id, id),
  });
}

export async function searchMarkets(params: {
  search?: string;
  active?: boolean;
  limit: number;
  offset: number;
}) {
  const conditions = [];
  
  if (params.active !== undefined) {
    conditions.push(eq(markets.active, params.active));
  }
  
  if (params.search) {
    conditions.push(ilike(markets.question, `%${params.search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.query.markets.findMany({
    where,
    limit: params.limit,
    offset: params.offset,
    orderBy: [desc(markets.updatedAt)],
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(markets)
    .where(where);
  
  return {
    markets: results,
    total: Number(countResult[0]?.count ?? 0),
  };
}
