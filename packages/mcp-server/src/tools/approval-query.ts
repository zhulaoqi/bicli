import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { approvals, approvalActions, users } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";
import { applyDataScope, applyFieldScopeWithRules } from "../auth/data-scope.js";

export const approvalQuerySchema = z.object({
  approvalId: z.number().optional().describe("查询指定审批单详情"),
  status: z.string().optional().describe("按状态筛选"),
  submittedBy: z.number().optional().describe("按提交人筛选"),
  reviewerId: z.number().optional().describe("按审批人筛选"),
  type: z.string().optional().describe("按审批类型筛选"),
  page: z.number().default(1).describe("页码"),
  pageSize: z.number().default(20).describe("每页条数"),
  _context: z.any().optional(),
});

export async function approvalQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["approval:read"], async (db, cleanArgs, context, adapter) => {
    const { approvalId, status, submittedBy, reviewerId, type, page = 1, pageSize = 20 } = cleanArgs as any;

    if (approvalId) {
      const [approval] = await db.select().from(approvals).where(eq(approvals.id, Number(approvalId))).limit(1);
      if (!approval) return formatSuccess({ approval: null, message: "审批单不存在" });

      const actions = await db.select().from(approvalActions)
        .where(eq(approvalActions.approvalId, Number(approvalId)))
        .orderBy(desc(approvalActions.createdAt));

      const [submitter] = await db.select({ username: users.username }).from(users).where(eq(users.id, approval.submittedBy)).limit(1);
      const [reviewer] = await db.select({ username: users.username }).from(users).where(eq(users.id, approval.reviewerId)).limit(1);

      return formatSuccess({
        ...approval,
        submitterName: submitter?.username,
        reviewerName: reviewer?.username,
        actions,
      });
    }

    const scopeRules = await adapter.getDataScopeRules(context.role, "approval");
    const conditions: any[] = [];
    applyDataScope(scopeRules, context, approvals, conditions);

    if (status) conditions.push(eq(approvals.status, status));
    if (submittedBy) conditions.push(eq(approvals.submittedBy, Number(submittedBy)));
    if (reviewerId) conditions.push(eq(approvals.reviewerId, Number(reviewerId)));
    if (type) conditions.push(eq(approvals.type, type));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Number(pageSize);

    const [items, countResult] = await Promise.all([
      db.select().from(approvals).where(where).orderBy(desc(approvals.createdAt)).limit(Number(pageSize)).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(approvals).where(where),
    ]);

    const enriched = await Promise.all(items.map(async (item) => {
      const [submitter] = await db.select({ username: users.username }).from(users).where(eq(users.id, item.submittedBy)).limit(1);
      const [reviewer] = await db.select({ username: users.username }).from(users).where(eq(users.id, item.reviewerId)).limit(1);
      return { ...item, submitterName: submitter?.username, reviewerName: reviewer?.username };
    }));

    const fieldRules = await adapter.getFieldScopeRules(context.role, "approval");
    const filtered = applyFieldScopeWithRules(fieldRules, enriched as any);

    return formatSuccess({
      items: filtered,
      total: countResult[0]?.count || 0,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  });
}
