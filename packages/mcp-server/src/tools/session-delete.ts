import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { sessions, sessionMessages } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const sessionDeleteSchema = z.object({
  sessionId: z.number().describe("要删除的会话 ID"),
  _context: z.any().optional(),
});

export async function sessionDelete(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (db, cleanArgs, context) => {
    const { sessionId } = cleanArgs as any;

    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.id, Number(sessionId)), eq(sessions.userId, context.userId)))
      .limit(1);
    if (!session) return formatError("NOT_FOUND", "会话不存在或无权访问");

    await db.delete(sessionMessages).where(eq(sessionMessages.sessionId, Number(sessionId)));
    await db.delete(sessions).where(eq(sessions.id, Number(sessionId)));

    return formatSuccess({ deleted: true, sessionId: Number(sessionId) });
  });
}
