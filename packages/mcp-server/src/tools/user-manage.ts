import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { users } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const userManageSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  userId: z.number().optional(),
  data: z.object({
    username: z.string().optional(),
    email: z.string().optional(),
    role_id: z.number().optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }).optional(),
});

export async function userManage(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["user:write"], async (db, cleanArgs) => {
    const input = userManageSchema.parse(cleanArgs);

    switch (input.action) {
      case "create": {
        if (!input.data?.username || !input.data?.email || !input.data?.role_id) {
          return formatError("VALIDATION_ERROR", "创建用户需要 username, email, role_id");
        }
        const [result] = await db.insert(users).values({
          username: input.data.username,
          email: input.data.email,
          roleId: input.data.role_id,
          status: input.data.status || "active",
        }).$returningId();
        const created = await db.query.users.findFirst({ where: eq(users.id, result.id) });
        return formatSuccess(created);
      }
      case "update": {
        if (!input.userId) return formatError("VALIDATION_ERROR", "更新用户需要 userId");
        const updateData: Record<string, unknown> = {};
        if (input.data?.username) updateData.username = input.data.username;
        if (input.data?.email) updateData.email = input.data.email;
        if (input.data?.role_id) updateData.roleId = input.data.role_id;
        if (input.data?.status) updateData.status = input.data.status;
        await db.update(users).set(updateData).where(eq(users.id, input.userId));
        const updated = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
        return formatSuccess(updated);
      }
      case "delete": {
        if (!input.userId) return formatError("VALIDATION_ERROR", "删除用户需要 userId");
        await db.delete(users).where(eq(users.id, input.userId));
        return formatSuccess({ deleted: true, userId: input.userId });
      }
    }
  });
}
