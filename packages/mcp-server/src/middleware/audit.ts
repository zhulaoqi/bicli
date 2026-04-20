import type { Database } from "../db/connection.js";
import { auditLogs } from "../db/schema.js";
import {
  sanitize,
  truncate,
  extractAction,
  extractResourceType,
  extractResourceId,
} from "../utils/sanitize.js";

export interface AuditEntry {
  userId: number;
  userRole: string;
  toolName: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  inputSummary: unknown;
  outputSummary: unknown;
  status: "success" | "failed" | "denied" | "confirmed";
  sessionId: number | null;
  ipAddress: string | null;
  durationMs: number;
}

export async function writeAuditLog(
  db: Database,
  entry: AuditEntry,
): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId,
    userRole: entry.userRole,
    toolName: entry.toolName,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    inputSummary: entry.inputSummary,
    outputSummary: entry.outputSummary,
    status: entry.status,
    sessionId: entry.sessionId,
    ipAddress: entry.ipAddress,
    durationMs: entry.durationMs,
  });
}

export function buildAuditEntry(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  status: AuditEntry["status"],
  durationMs: number,
): AuditEntry {
  const ctx = ((args?._context as Record<string, unknown>) || {}) as Record<
    string,
    unknown
  >;
  return {
    userId: (ctx.userId as number) || 0,
    userRole: (ctx.role as string) || "unknown",
    toolName,
    action: extractAction(toolName, args),
    resourceType: extractResourceType(toolName),
    resourceId: extractResourceId(args, result),
    inputSummary: sanitize(args),
    outputSummary: truncate(result, 500),
    status,
    sessionId: (ctx.sessionId as number) || null,
    ipAddress: (ctx.ip as string) || null,
    durationMs,
  };
}
