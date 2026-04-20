import { z } from "zod";
import { eq, like, and, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { users } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";
import { applyDataScope, applyFieldScopeWithRules } from "../auth/data-scope.js";

export const userListSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  role_id: z.number().optional(),
  keyword: z.string().optional(),
  page: z.number().default(1),
  pageSize: z.number().default(20),
});

export async function userList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["user:read"], async (db, cleanArgs, context, adapter) => {
    const input = userListSchema.parse(cleanArgs);
    const conditions: SQL[] = [];

    if (input.status) conditions.push(eq(users.status, input.status));
    if (input.role_id) conditions.push(eq(users.roleId, input.role_id));
    if (input.keyword) {
      conditions.push(like(users.username, `%${input.keyword}%`));
    }

    const scopeRules = await adapter.getDataScopeRules(context.role, "users");
    applyDataScope(scopeRules, context, users, conditions);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [data, countResult] = await Promise.all([
      db.select().from(users).where(where).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(users).where(where),
    ]);

    const fieldRules = await adapter.getFieldScopeRules(context.role, "users");
    const filtered = applyFieldScopeWithRules(fieldRules, data);
    return formatSuccess(filtered, {
      total: countResult[0].count,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
}
