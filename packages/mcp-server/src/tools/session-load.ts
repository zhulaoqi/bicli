import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { sessions, sessionMessages } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const sessionLoadSchema = z.object({
  sessionId: z.number().describe("要加载的会话 ID"),
  page: z.number().default(1).describe("页码"),
  pageSize: z.number().default(50).describe("每页消息数"),
  _context: z.any().optional(),
});

export async function sessionLoad(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (db, cleanArgs, context) => {
    const { sessionId, page = 1, pageSize = 50 } = cleanArgs as any;

    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, Number(sessionId)), eq(sessions.userId, context.userId)))
      .limit(1);
    if (!session) return formatError("NOT_FOUND", "会话不存在或无权访问");

    const offset = (Number(page) - 1) * Number(pageSize);
    const messages = await db.select().from(sessionMessages)
      .where(eq(sessionMessages.sessionId, Number(sessionId)))
      .orderBy(sessionMessages.createdAt)
      .limit(Number(pageSize))
      .offset(offset);

    return formatSuccess({
      session: { id: session.id, title: session.title, createdAt: session.createdAt, updatedAt: session.updatedAt },
      messages,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  });
}
