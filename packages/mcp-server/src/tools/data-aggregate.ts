import { z } from "zod";
import { sql, and, eq, like, inArray, gte, lte, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { users, forms, formFields, configs } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";
import { TABLE_PERMISSION_MAP, ALLOWED_DATA_TABLES, type WhereClause } from "../types/index.js";
import { checkPermission } from "../auth/rbac.js";
import { applyDataScope, applyFieldScopeWithRules } from "../auth/data-scope.js";

const whereValueSchema = z.union([
  z.string(), z.number(), z.boolean(),
  z.object({ $in: z.array(z.union([z.string(), z.number()])) }),
  z.object({ $like: z.string() }),
  z.object({ $gte: z.union([z.string(), z.number()]).optional(), $lte: z.union([z.string(), z.number()]).optional() }),
]);

export const dataAggregateSchema = z.object({
  table: z.enum(ALLOWED_DATA_TABLES),
  metric: z.enum(["count", "sum", "avg"]),
  field: z.string().optional(),
  groupBy: z.string().optional(),
  where: z.record(whereValueSchema).optional(),
});

const tableMap = { users, forms, form_fields: formFields, configs } as const;

export async function dataAggregate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["data:read"], async (db, cleanArgs, context, adapter) => {
    const input = dataAggregateSchema.parse(cleanArgs);

    const extraPerm = TABLE_PERMISSION_MAP[input.table];
    if (extraPerm) {
      const perms = await adapter.getPermissions(context.role);
      if (!checkPermission(perms, extraPerm)) {
        return formatError("PERMISSION_DENIED", `聚合查询 ${input.table} 表还需要 ${extraPerm} 权限`);
      }
    }

    if ((input.metric === "sum" || input.metric === "avg") && !input.field) {
      return formatError("VALIDATION_ERROR", `${input.metric} 操作需要指定 field 参数`);
    }

    const table = tableMap[input.table];

    let metricSql: SQL;
    switch (input.metric) {
      case "count": metricSql = sql<number>`count(*)`; break;
      case "sum": metricSql = sql<number>`sum(${sql.raw(input.field!)})`; break;
      case "avg": metricSql = sql<number>`avg(${sql.raw(input.field!)})`; break;
    }

    const selectFields: Record<string, SQL> = { value: metricSql };
    if (input.groupBy) {
      selectFields.group = sql.raw(input.groupBy);
    }

    let query = db.select(selectFields).from(table);

    const conditions: SQL[] = [];
    if (input.where) {
      for (const [field, value] of Object.entries(input.where)) {
        const column = (table as any)[field];
        if (!column) continue;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          conditions.push(eq(column, value));
        } else if (typeof value === "object" && value !== null) {
          if ("$in" in value) conditions.push(inArray(column, (value as any).$in));
          if ("$like" in value) conditions.push(like(column, (value as any).$like));
          if ("$gte" in value && (value as any).$gte !== undefined) conditions.push(gte(column, (value as any).$gte));
          if ("$lte" in value && (value as any).$lte !== undefined) conditions.push(lte(column, (value as any).$lte));
        }
      }
    }

    const scopeRules = await adapter.getDataScopeRules(context.role, input.table);
    applyDataScope(scopeRules, context, table, conditions);

    if (conditions.length > 0) query = query.where(and(...conditions)) as any;

    if (input.groupBy) {
      query = (query as any).groupBy(sql.raw(input.groupBy));
    }

    const result = await query;
    const fieldRules = await adapter.getFieldScopeRules(context.role, input.table);
    const filtered = applyFieldScopeWithRules(fieldRules, result as any);
    return formatSuccess(filtered);
  });
}
