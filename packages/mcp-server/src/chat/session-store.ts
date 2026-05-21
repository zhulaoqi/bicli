import { eq, desc, and } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { sessions, sessionMessages } from "../db/schema.js";
import type { MessageBlock } from "./message-blocks.js";

export interface SessionRecord {
  id: number;
  userId: string;
  orgId: string | null;
  title: string | null;
  model: string | null;
  metadata?: Record<string, unknown> | null;
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
  blocks?: MessageBlock[];
  charts?: unknown[];
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
    return (rows as unknown as MessageRecord[]).map((row) => {
      const unpacked = unpackStructuredMessageContent(row.content);
      return {
        ...row,
        content: unpacked.content,
        blocks: unpacked.blocks,
        charts: unpacked.charts,
      };
    });
  }

  async addMessage(
    sessionId: number,
    msg: {
      role: MessageRecord["role"];
      content: string;
      toolName?: string | null;
      toolCalls?: ToolCallRecord[] | null;
      blocks?: MessageBlock[] | null;
      charts?: unknown[] | null;
      durationMs?: number | null;
    },
  ): Promise<void> {
    await this.db.insert(sessionMessages).values({
      sessionId,
      role: msg.role,
      content: packStructuredMessageContent(msg.content, {
        blocks: msg.blocks ?? undefined,
        charts: msg.charts ?? undefined,
      }),
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

  async updateMetadata(sessionId: number, metadata: Record<string, unknown>): Promise<void> {
    await this.db.update(sessions).set({ metadata }).where(eq(sessions.id, sessionId));
  }

  async delete(id: number, userId: string): Promise<void> {
    await this.db.delete(sessionMessages).where(eq(sessionMessages.sessionId, id));
    await this.db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  }
}

export function packStructuredMessageContent(
  content: string,
  metadata: { blocks?: MessageBlock[] | null; charts?: unknown[] | null },
): string {
  const blocks = metadata.blocks?.length ? metadata.blocks : undefined;
  const charts = metadata.charts?.length ? metadata.charts : undefined;
  if (!blocks && !charts) return content;

  const payload = Buffer.from(JSON.stringify({ blocks, charts }), "utf8").toString("base64");
  return `${content}\n<!--bicli_structured ${payload}-->`;
}

export function unpackStructuredMessageContent(content: string | null | undefined): {
  content: string;
  blocks?: MessageBlock[];
  charts?: unknown[];
} {
  if (content == null || content === "") {
    return { content: "", blocks: undefined, charts: undefined };
  }
  const match = content.match(/\n?<!--bicli_structured\s+([A-Za-z0-9+/=]+)-->\s*$/);
  if (!match) {
    return { content, blocks: undefined, charts: undefined };
  }

  const visibleContent = content.slice(0, match.index).trimEnd();
  try {
    const parsed = JSON.parse(Buffer.from(match[1], "base64").toString("utf8")) as {
      blocks?: MessageBlock[];
      charts?: unknown[];
    };
    return {
      content: visibleContent,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : undefined,
      charts: Array.isArray(parsed.charts) ? parsed.charts : undefined,
    };
  } catch {
    return { content: visibleContent, blocks: undefined, charts: undefined };
  }
}
