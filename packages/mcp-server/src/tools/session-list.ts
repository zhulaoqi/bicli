import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { sessions, sessionMessages } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const sessionListSchema = z.object({
  page: z.number().default(1).describe("页码"),
  pageSize: z.number().default(20).describe("每页条数"),
  _context: z.any().optional(),
});

export async function sessionList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (db, cleanArgs, context) => {
    const { page = 1, pageSize = 20 } = cleanArgs as any;
    const offset = (Number(page) - 1) * Number(pageSize);

    const items = await db.select({
      id: sessions.id,
      title: sessions.title,
      status: sessions.status,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      messageCount: sql<number>`(SELECT COUNT(*) FROM session_messages WHERE session_id = ${sessions.id})`,
    }).from(sessions)
      .where(eq(sessions.userId, String(context.userId)))
      .orderBy(desc(sessions.updatedAt))
      .limit(Number(pageSize))
      .offset(offset);

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(eq(sessions.userId, String(context.userId)));

    return formatSuccess({
      items,
      total: countResult?.count || 0,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  });
}
