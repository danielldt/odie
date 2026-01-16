import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { orders, type NewOrder } from "../schema/orders.js";

export async function createOrder(data: NewOrder) {
  const [order] = await db.insert(orders).values(data).returning();
  return order;
}

export async function createOrders(data: NewOrder[]) {
  return db.insert(orders).values(data).returning();
}

export async function getOrderById(id: string) {
  return db.query.orders.findFirst({
    where: eq(orders.id, id),
    with: {
      fills: true,
    },
  });
}

export async function getOrderByClobOrderId(clobOrderId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.clobOrderId, clobOrderId),
    with: {
      fills: true,
    },
  });
}

export async function getOrderByClientOrderId(clientOrderId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.clientOrderId, clientOrderId),
    with: {
      fills: true,
    },
  });
}

export async function getOrdersForRun(runId: string) {
  return db.query.orders.findMany({
    where: eq(orders.tradeRunId, runId),
    with: {
      fills: true,
    },
  });
}

export async function updateOrder(id: string, data: Partial<NewOrder>) {
  const [order] = await db
    .update(orders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();
  return order;
}

export async function updateOrderByClobId(clobOrderId: string, data: Partial<NewOrder>) {
  const [order] = await db
    .update(orders)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(orders.clobOrderId, clobOrderId))
    .returning();
  return order;
}

export async function getOpenOrdersForRun(runId: string) {
  return db.query.orders.findMany({
    where: and(
      eq(orders.tradeRunId, runId),
      inArray(orders.status, ["pending", "open", "partially_filled"])
    ),
  });
}

export async function queryOrders(params: {
  runId?: string;
  status?: string;
  limit: number;
  offset: number;
}) {
  const conditions = [];
  
  if (params.runId) {
    conditions.push(eq(orders.tradeRunId, params.runId));
  }
  
  if (params.status) {
    conditions.push(eq(orders.status, params.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db.query.orders.findMany({
    where,
    limit: params.limit,
    offset: params.offset,
    with: {
      fills: true,
    },
  });

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(where);

  return {
    orders: results,
    total: Number(countResult[0]?.count ?? 0),
  };
}
