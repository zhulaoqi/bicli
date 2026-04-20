import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { roles, rolePermissions } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const roleListSchema = z.object({
  roleId: z.number().optional(),
});

export async function roleList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["role:read"], async (db, cleanArgs) => {
    const input = roleListSchema.parse(cleanArgs);

    if (input.roleId) {
      const role = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
      if (!role) return formatSuccess(null);
      const perms = await db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, input.roleId),
      });
      return formatSuccess({ ...role, permissions: perms.map((p) => p.permission) });
    }

    const allRoles = await db.select().from(roles);
    const result = await Promise.all(
      allRoles.map(async (role) => {
        const perms = await db.query.rolePermissions.findMany({
          where: eq(rolePermissions.roleId, role.id),
        });
        return { ...role, permissions: perms.map((p) => p.permission) };
      })
    );
    return formatSuccess(result);
  });
}
