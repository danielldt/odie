import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../client.js";
import { fills, type NewFill } from "../schema/fills.js";
import { orders } from "../schema/orders.js";

export async function createFill(data: NewFill) {
  const [fill] = await db.insert(fills).values(data).returning();
  return fill;
}

export async function getFillById(id: string) {
  return db.query.fills.findFirst({
    where: eq(fills.id, id),
  });
}

export async function getFillByClobTradeId(clobTradeId: string) {
  return db.query.fills.findFirst({
    where: eq(fills.clobTradeId, clobTradeId),
  });
}

export async function getFillsForOrder(orderId: string) {
  return db.query.fills.findMany({
    where: eq(fills.orderId, orderId),
    orderBy: [desc(fills.filledAt)],
  });
}

export async function queryFills(params: {
  runId?: string;
  orderId?: string;
  limit: number;
  offset: number;
}) {
  // If runId is provided, we need to join with orders to filter
  if (params.runId && !params.orderId) {
    const orderIds = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.tradeRunId, params.runId));
    
    if (orderIds.length === 0) {
      return { fills: [], total: 0 };
    }

    const orderIdList = orderIds.map((o) => o.id);
    
    const results = await db.query.fills.findMany({
      where: sql`${fills.orderId} IN (${sql.join(orderIdList.map(id => sql`${id}`), sql`, `)})`,
      limit: params.limit,
      offset: params.offset,
      orderBy: [desc(fills.filledAt)],
    });

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(fills)
      .where(sql`${fills.orderId} IN (${sql.join(orderIdList.map(id => sql`${id}`), sql`, `)})`);

    return {
      fills: results,
      total: Number(countResult[0]?.count ?? 0),
    };
  }

  const conditions = [];
  
  if (params.orderId) {
    conditions.push(eq(fills.orderId, params.orderId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.query.fills.findMany({
    where,
    limit: params.limit,
    offset: params.offset,
    orderBy: [desc(fills.filledAt)],
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(fills)
    .where(where);

  return {
    fills: results,
    total: Number(countResult[0]?.count ?? 0),
  };
}
