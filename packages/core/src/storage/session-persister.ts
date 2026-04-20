import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

export interface PersistedMessage {
  role: "user" | "assistant" | "system" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  duration?: number;
  timestamp: number;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export class SessionPersister {
  private dir: string;
  private currentId: string;
  private title: string;

  constructor(sessionId?: string) {
    this.dir = join(homedir(), ".bicli", "sessions");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    this.currentId = sessionId || this.generateId();
    this.title = `Session ${new Date().toLocaleString()}`;
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private getFilePath(id?: string): string {
    return join(this.dir, `${id || this.currentId}.jsonl`);
  }

  getCurrentId(): string {
    return this.currentId;
  }

  getTitle(): string {
    return this.title;
  }

  setTitle(title: string): void {
    this.title = title;
    const metaPath = join(this.dir, `${this.currentId}.meta.json`);
    const meta: SessionMeta = this.loadMeta() || {
      id: this.currentId,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };
    meta.title = title;
    meta.updatedAt = Date.now();
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  }

  private loadMeta(): SessionMeta | null {
    const metaPath = join(this.dir, `${this.currentId}.meta.json`);
    if (!existsSync(metaPath)) return null;
    try {
      return JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      return null;
    }
  }

  append(message: PersistedMessage): void {
    const line = JSON.stringify(message) + "\n";
    const filePath = this.getFilePath();
    try {
      const { appendFileSync } = require("node:fs");
      appendFileSync(filePath, line, "utf-8");
    } catch {
      writeFileSync(filePath, line, "utf-8");
    }
  }

  load(sessionId?: string): PersistedMessage[] {
    const filePath = this.getFilePath(sessionId);
    if (!existsSync(filePath)) return [];
    try {
      const data = readFileSync(filePath, "utf-8");
      return data.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }

  listSessions(): SessionMeta[] {
    const files = readdirSync(this.dir).filter((f) => f.endsWith(".jsonl"));
    return files.map((f) => {
      const id = basename(f, ".jsonl");
      const metaPath = join(this.dir, `${id}.meta.json`);
      if (existsSync(metaPath)) {
        try { return JSON.parse(readFileSync(metaPath, "utf-8")); } catch {}
      }
      const filePath = join(this.dir, f);
      const messages = this.load(id);
      return {
        id,
        title: messages.length > 0 && messages[0].role === "user"
          ? messages[0].content.slice(0, 50) + (messages[0].content.length > 50 ? "…" : "")
          : `Session ${id}`,
        createdAt: messages[0]?.timestamp || 0,
        updatedAt: messages[messages.length - 1]?.timestamp || 0,
        messageCount: messages.length,
      } as SessionMeta;
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteSession(sessionId: string): void {
    const filePath = this.getFilePath(sessionId);
    if (existsSync(filePath)) unlinkSync(filePath);
    const metaPath = join(this.dir, `${sessionId}.meta.json`);
    if (existsSync(metaPath)) unlinkSync(metaPath);
  }

  save(): void {
    this.setTitle(this.title);
  }
}
