import { z } from "zod";
import { eq, like, and, inArray, gte, lte, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { users, forms, formFields, configs } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";
import { TABLE_PERMISSION_MAP, ALLOWED_DATA_TABLES, type WhereClause } from "../types/index.js";
import { checkPermission } from "../auth/rbac.js";
import { applyDataScope, applyFieldScopeWithRules } from "../auth/data-scope.js";

const whereValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ $in: z.array(z.union([z.string(), z.number()])) }),
  z.object({ $like: z.string() }),
  z.object({ $gte: z.union([z.string(), z.number()]).optional(), $lte: z.union([z.string(), z.number()]).optional() }),
]);

export const dataQuerySchema = z.object({
  table: z.enum(ALLOWED_DATA_TABLES),
  where: z.record(whereValueSchema).optional(),
  orderBy: z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  page: z.number().default(1),
  pageSize: z.number().default(20),
});

const tableMap = { users, forms, form_fields: formFields, configs } as const;

function buildWhereConditions(table: any, where: WhereClause): SQL[] {
  const conditions: SQL[] = [];
  for (const [field, value] of Object.entries(where)) {
    const column = table[field];
    if (!column) continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      conditions.push(eq(column, value));
    } else if (typeof value === "object" && value !== null) {
      if ("$in" in value) conditions.push(inArray(column, value.$in));
      if ("$like" in value) conditions.push(like(column, value.$like));
      if ("$gte" in value && value.$gte !== undefined) conditions.push(gte(column, value.$gte));
      if ("$lte" in value && value.$lte !== undefined) conditions.push(lte(column, value.$lte));
    }
  }
  return conditions;
}

export async function dataQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["data:read"], async (db, cleanArgs, context, adapter) => {
    const input = dataQuerySchema.parse(cleanArgs);

    const extraPerm = TABLE_PERMISSION_MAP[input.table];
    if (extraPerm) {
      const perms = await adapter.getPermissions(context.role);
      if (!checkPermission(perms, extraPerm)) {
        return formatError("PERMISSION_DENIED", `查询 ${input.table} 表还需要 ${extraPerm} 权限`);
      }
    }

    const table = tableMap[input.table];
    const conditions = input.where ? buildWhereConditions(table, input.where as WhereClause) : [];

    const scopeRules = await adapter.getDataScopeRules(context.role, input.table);
    applyDataScope(scopeRules, context, table, conditions);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [data, countResult] = await Promise.all([
      db.select().from(table).where(where).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(table).where(where),
    ]);

    const fieldRules = await adapter.getFieldScopeRules(context.role, input.table);
    const filtered = applyFieldScopeWithRules(fieldRules, data);
    return formatSuccess(filtered, {
      total: countResult[0].count,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
}
