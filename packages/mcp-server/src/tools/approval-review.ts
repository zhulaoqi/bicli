import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { approvals, approvalActions, users } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const approvalReviewSchema = z.object({
  approvalId: z.number().describe("审批单 ID"),
  action: z.enum(["approve", "reject", "reassign"]).describe("审批操作"),
  comment: z.string().optional().describe("审批意见"),
  reassignTo: z.number().optional().describe("转审目标用户 ID（action=reassign 时必填）"),
  _context: z.any().optional(),
});

export async function approvalReview(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["approval:review"], async (db, cleanArgs, context) => {
    const { approvalId, action, comment, reassignTo } = cleanArgs as any;

    if (!approvalId || !action) {
      return formatError("VALIDATION_ERROR", "approvalId 和 action 为必填");
    }

    const [approval] = await db.select().from(approvals).where(eq(approvals.id, Number(approvalId))).limit(1);
    if (!approval) return formatError("NOT_FOUND", "审批单不存在");
    if (approval.status !== "pending") return formatError("CONFLICT", "审批单已处理，当前状态: " + approval.status);

    if (action === "approve" || action === "reject") {
      if (approval.reviewerId !== context.userId) {
        return formatError("FORBIDDEN", "只有指定审批人可以审批");
      }
      if (approval.submittedBy === context.userId) {
        return formatError("FORBIDDEN", "不能审批自己提交的申请");
      }

      const [updateResult] = await db.update(approvals)
        .set({
          status: action === "approve" ? "approved" : "rejected",
          reviewedAt: sql`NOW()`,
          reviewComment: comment ? String(comment) : null,
        })
        .where(and(eq(approvals.id, Number(approvalId)), eq(approvals.status, "pending")));

      if ((updateResult as any)?.affectedRows === 0) {
        return formatError("CONFLICT", "审批单已被其他人处理");
      }
    } else if (action === "reassign") {
      if (!reassignTo) return formatError("VALIDATION_ERROR", "转审需要 reassignTo 参数");
      const [target] = await db.select().from(users).where(eq(users.id, Number(reassignTo))).limit(1);
      if (!target || target.status !== "active") return formatError("VALIDATION_ERROR", "目标用户不存在或已停用");

      await db.update(approvals).set({ reviewerId: Number(reassignTo) }).where(eq(approvals.id, Number(approvalId)));
    } else {
      return formatError("VALIDATION_ERROR", "无效的 action，可选: approve, reject, reassign");
    }

    await db.insert(approvalActions).values({
      approvalId: Number(approvalId),
      actorId: context.userId,
      action,
      comment: comment ? String(comment) : null,
    });

    return formatSuccess({
      approvalId: Number(approvalId),
      action,
      message: action === "approve" ? "已通过" : action === "reject" ? "已驳回" : "已转审",
    });
  });
}
