import type { ModelMessage } from "ai";
import type { SessionPersister, PersistedMessage } from "../storage/session-persister.js";

export class Session {
  private messages: ModelMessage[] = [];
  private maxTurns: number;
  private persister?: SessionPersister;

  constructor(maxTurns: number = 20, persister?: SessionPersister) {
    this.maxTurns = maxTurns;
    this.persister = persister;
  }

  setPersister(persister: SessionPersister) {
    this.persister = persister;
  }

  addMessage(message: ModelMessage) {
    this.messages.push(message);
    this.trim();
    if (this.persister && typeof message.content === "string") {
      this.persister.append({
        role: message.role as PersistedMessage["role"],
        content: message.content,
        timestamp: Date.now(),
      });
    }
  }

  recordToolCall(toolName: string, args: unknown) {
    this.persister?.append({
      role: "tool_call",
      content: JSON.stringify(args),
      toolName,
      timestamp: Date.now(),
    });
  }

  recordToolResult(toolName: string, result: unknown, duration: number) {
    this.persister?.append({
      role: "tool_result",
      content: typeof result === "string" ? result : JSON.stringify(result),
      toolName,
      duration,
      timestamp: Date.now(),
    });
  }

  getMessages(): ModelMessage[] {
    return [...this.messages];
  }

  clear() {
    this.messages = [];
  }

  private trim() {
    const maxMessages = this.maxTurns * 2;
    if (this.messages.length > maxMessages) {
      const keep = 10;
      this.messages = this.messages.slice(-keep);
    }
  }
}
