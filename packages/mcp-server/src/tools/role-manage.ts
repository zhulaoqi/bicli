import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { roles, rolePermissions } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const roleManageSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  roleId: z.number().optional(),
  data: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }).optional(),
});

export async function roleManage(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["role:write"], async (db, cleanArgs) => {
    const input = roleManageSchema.parse(cleanArgs);

    switch (input.action) {
      case "create": {
        if (!input.data?.name) return formatError("VALIDATION_ERROR", "创建角色需要 name");
        const [result] = await db.insert(roles).values({
          name: input.data.name,
          description: input.data.description,
        }).$returningId();

        if (input.data.permissions?.length) {
          await db.insert(rolePermissions).values(
            input.data.permissions.map((perm) => ({
              roleId: result.id,
              permission: perm,
              resource: perm.split(":")[0],
            }))
          );
        }
        const created = await db.query.roles.findFirst({ where: eq(roles.id, result.id) });
        return formatSuccess({ ...created, permissions: input.data.permissions || [] });
      }
      case "update": {
        if (!input.roleId) return formatError("VALIDATION_ERROR", "更新角色需要 roleId");
        if (input.data?.name || input.data?.description) {
          const updateData: Record<string, unknown> = {};
          if (input.data.name) updateData.name = input.data.name;
          if (input.data.description) updateData.description = input.data.description;
          await db.update(roles).set(updateData).where(eq(roles.id, input.roleId));
        }
        if (input.data?.permissions) {
          await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
          if (input.data.permissions.length > 0) {
            await db.insert(rolePermissions).values(
              input.data.permissions.map((perm) => ({
                roleId: input.roleId!,
                permission: perm,
                resource: perm.split(":")[0],
              }))
            );
          }
        }
        const updated = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
        return formatSuccess(updated);
      }
      case "delete": {
        if (!input.roleId) return formatError("VALIDATION_ERROR", "删除角色需要 roleId");
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
        await db.delete(roles).where(eq(roles.id, input.roleId));
        return formatSuccess({ deleted: true, roleId: input.roleId });
      }
    }
  });
}
