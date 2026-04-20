import { z } from "zod";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { auditLogs } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const auditQuerySchema = z.object({
  userId: z.number().optional().describe("按用户 ID 筛选"),
  toolName: z.string().optional().describe("按工具名筛选"),
  resourceType: z.string().optional().describe("按资源类型筛选"),
  action: z.string().optional().describe("按操作类型筛选"),
  startTime: z.string().optional().describe("起始时间 (ISO 8601)"),
  endTime: z.string().optional().describe("结束时间 (ISO 8601)"),
  page: z.number().default(1).describe("页码"),
  pageSize: z.number().default(20).describe("每页条数，最大 100"),
  _context: z.any().optional(),
});

export async function auditQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["audit:read"], async (db, cleanArgs) => {
    const { userId, toolName, resourceType, action, startTime, endTime, page = 1, pageSize = 20 } = cleanArgs as any;

    const conditions = [];
    if (userId) conditions.push(eq(auditLogs.userId, Number(userId)));
    if (toolName) conditions.push(eq(auditLogs.toolName, String(toolName)));
    if (resourceType) conditions.push(eq(auditLogs.resourceType, String(resourceType)));
    if (action) conditions.push(eq(auditLogs.action, String(action)));
    if (startTime) conditions.push(gte(auditLogs.createdAt, new Date(startTime)));
    if (endTime) conditions.push(lte(auditLogs.createdAt, new Date(endTime)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Math.min(Number(pageSize), 100);
    const limit = Math.min(Number(pageSize), 100);

    const [items, countResult] = await Promise.all([
      db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
    ]);

    return formatSuccess({
      items,
      total: countResult[0]?.count || 0,
      page: Number(page),
      pageSize: limit,
    });
  });
}
