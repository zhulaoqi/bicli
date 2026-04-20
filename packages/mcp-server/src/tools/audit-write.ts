import { z } from "zod";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { writeAuditLog } from "../middleware/audit.js";
import { formatSuccess } from "./base.js";

export const auditWriteSchema = z.object({
  userId: z.number(),
  userRole: z.string(),
  toolName: z.string(),
  action: z.string(),
  status: z.enum(["denied"]),
  summary: z.string().optional(),
});

export async function auditWrite(db: Database, _adapter: PermissionAdapter, args: Record<string, unknown>) {
  const { userId, userRole, toolName, action, status, summary } = args as any;
  await writeAuditLog(db, {
    userId: Number(userId),
    userRole: String(userRole),
    toolName: String(toolName),
    action: String(action),
    resourceType: null,
    resourceId: null,
    inputSummary: summary ? { summary } : null,
    outputSummary: null,
    status: status || "denied",
    sessionId: null,
    ipAddress: null,
    durationMs: 0,
  });
  return formatSuccess({ written: true });
}
