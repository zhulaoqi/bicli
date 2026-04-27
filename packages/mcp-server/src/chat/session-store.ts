import { eq, desc, and } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { sessions, sessionMessages } from "../db/schema.js";

export interface SessionRecord {
  id: number;
  userId: string;
  orgId: string | null;
  title: string | null;
  model: string | null;
  status: "active" | "archived";
  createdAt: Date;
  updatedAt: Date;
}

export interface ToolCallRecord {
  id?: string;
  name: string;
  args: unknown;
  result?: unknown;
  duration?: number;
  status: "running" | "done" | "error";
}

export interface MessageRecord {
  id: number;
  sessionId: number;
  role: "user" | "assistant" | "system" | "tool_call" | "tool_result";
  content: string;
  toolName: string | null;
  toolCalls: ToolCallRecord[] | null;
  durationMs: number | null;
  createdAt: Date;
}

export class SessionStore {
  constructor(private db: Database) {}

  async create(userId: string, orgId: string | undefined, model: string, title?: string): Promise<SessionRecord> {
    const [inserted] = await this.db
      .insert(sessions)
      .values({
        userId,
        orgId: orgId ?? null,
        model,
        title: title ?? "新对话",
      })
      .$returningId();
    const row = await this.get(inserted.id);
    if (!row) throw new Error("failed to create session");
    return row;
  }

  async list(userId: string, limit = 50): Promise<SessionRecord[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, "active")))
      .orderBy(desc(sessions.updatedAt))
      .limit(limit);
    return rows as SessionRecord[];
  }

  async get(id: number): Promise<SessionRecord | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return (rows[0] as SessionRecord) ?? null;
  }

  async getMessages(sessionId: number): Promise<MessageRecord[]> {
    const rows = await this.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(sessionMessages.id);
    return rows as unknown as MessageRecord[];
  }

  async addMessage(
    sessionId: number,
    msg: {
      role: MessageRecord["role"];
      content: string;
      toolName?: string | null;
      toolCalls?: ToolCallRecord[] | null;
      durationMs?: number | null;
    },
  ): Promise<void> {
    await this.db.insert(sessionMessages).values({
      sessionId,
      role: msg.role,
      content: msg.content,
      toolName: msg.toolName ?? null,
      toolCalls: msg.toolCalls ?? null,
      durationMs: msg.durationMs ?? null,
    });
    await this.db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async updateTitle(sessionId: number, title: string): Promise<void> {
    await this.db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
  }

  async updateModel(sessionId: number, model: string): Promise<void> {
    await this.db.update(sessions).set({ model }).where(eq(sessions.id, sessionId));
  }

  async delete(id: number, userId: string): Promise<void> {
    await this.db.delete(sessionMessages).where(eq(sessionMessages.sessionId, id));
    await this.db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  }
}
