import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { sessions, sessionMessages } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const sessionSaveSchema = z.object({
  sessionId: z.number().optional().describe("会话 ID（不传则创建新会话）"),
  title: z.string().optional().describe("会话标题（创建时可选）"),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system", "tool_call", "tool_result"]),
    content: z.string(),
    toolName: z.string().optional(),
    durationMs: z.number().optional(),
  })).describe("要追加的消息列表"),
  _context: z.any().optional(),
});

export async function sessionSave(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (db, cleanArgs, context) => {
    const { sessionId, title, messages } = cleanArgs as any;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return formatError("VALIDATION_ERROR", "messages 不能为空");
    }

    let sid: number;

    if (sessionId) {
      const [existing] = await db.select().from(sessions)
        .where(and(eq(sessions.id, Number(sessionId)), eq(sessions.userId, context.userId)))
        .limit(1);
      if (!existing) return formatError("NOT_FOUND", "会话不存在或无权访问");
      sid = existing.id;
      if (title) {
        await db.update(sessions).set({ title }).where(eq(sessions.id, sid));
      }
    } else {
      const [result] = await db.insert(sessions).values({
        userId: context.userId,
        title: title || messages[0]?.content?.slice(0, 100) || "新会话",
      }).$returningId();
      sid = result.id;
    }

    for (const msg of messages) {
      await db.insert(sessionMessages).values({
        sessionId: sid,
        role: msg.role,
        content: msg.content,
        toolName: msg.toolName || null,
        durationMs: msg.durationMs || null,
      });
    }

    return formatSuccess({ sessionId: sid, messagesAdded: messages.length });
  });
}
