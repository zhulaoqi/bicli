import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { approvals, approvalActions, users } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const approvalSubmitSchema = z.object({
  title: z.string().describe("审批标题"),
  type: z.enum(["leave", "expense", "publish", "custom"]).describe("审批类型"),
  content: z.record(z.any()).describe("审批内容"),
  reviewerId: z.number().describe("审批人用户 ID"),
  relatedResourceType: z.string().optional().describe("关联资源类型"),
  relatedResourceId: z.number().optional().describe("关联资源 ID"),
  _context: z.any().optional(),
});

export async function approvalSubmit(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["approval:write"], async (db, cleanArgs, context) => {
    const { title, type, content, reviewerId, relatedResourceType, relatedResourceId } = cleanArgs as any;

    if (!title || !type || !content || !reviewerId) {
      return formatError("VALIDATION_ERROR", "title, type, content, reviewerId 均为必填");
    }

    if (Number(reviewerId) === Number(context.userId)) {
      return formatError("VALIDATION_ERROR", "不能指定自己为审批人");
    }

    const [reviewer] = await db.select().from(users).where(eq(users.id, Number(reviewerId))).limit(1);
    if (!reviewer || reviewer.status !== "active") {
      return formatError("VALIDATION_ERROR", "审批人不存在或已停用");
    }

    const [result] = await db.insert(approvals).values({
      title: String(title),
      type: String(type),
      content,
      submittedBy: Number(context.userId),
      reviewerId: Number(reviewerId),
      relatedResourceType: relatedResourceType ? String(relatedResourceType) : null,
      relatedResourceId: relatedResourceId ? Number(relatedResourceId) : null,
    }).$returningId();

    await db.insert(approvalActions).values({
      approvalId: result.id,
      actorId: Number(context.userId),
      action: "submit",
    });

    return formatSuccess({
      id: result.id,
      title,
      type,
      status: "pending",
      submittedBy: Number(context.userId),
      reviewerId: Number(reviewerId),
    });
  });
}
