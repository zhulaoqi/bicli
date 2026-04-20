import { z } from "zod";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { forms, formFields } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";
import { applyDataScope, applyFieldScopeWithRules } from "../auth/data-scope.js";

export const formQuerySchema = z.object({
  formId: z.number().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  page: z.number().default(1),
  pageSize: z.number().default(20),
});

export async function formQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["form:read"], async (db, cleanArgs, context, adapter) => {
    const input = formQuerySchema.parse(cleanArgs);

    if (input.formId) {
      const scopeConditions: SQL[] = [eq(forms.id, input.formId)];
      const scopeRulesForForm = await adapter.getDataScopeRules(context.role, "forms");
      applyDataScope(scopeRulesForForm, context, forms, scopeConditions);
      const form = await db.query.forms.findFirst({ where: and(...scopeConditions) });
      if (!form) return formatSuccess(null);
      const formFieldRules = await adapter.getFieldScopeRules(context.role, "forms");
      const [filteredForm] = applyFieldScopeWithRules(formFieldRules, [form]);
      const fields = await db.query.formFields.findMany({
        where: eq(formFields.formId, input.formId),
        orderBy: (f, { asc }) => [asc(f.fieldOrder)],
      });
      const fieldFieldRules = await adapter.getFieldScopeRules(context.role, "form_fields");
      const filteredFields = applyFieldScopeWithRules(fieldFieldRules, fields as any);
      return formatSuccess({ ...filteredForm, fields: filteredFields });
    }

    const conditions: SQL[] = [];
    if (input.status) conditions.push(eq(forms.status, input.status));

    const scopeRules = await adapter.getDataScopeRules(context.role, "forms");
    applyDataScope(scopeRules, context, forms, conditions);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [data, countResult] = await Promise.all([
      db.select().from(forms).where(where).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(forms).where(where),
    ]);

    const fieldRules = await adapter.getFieldScopeRules(context.role, "forms");
    const filtered = applyFieldScopeWithRules(fieldRules, data);
    return formatSuccess(filtered, {
      total: countResult[0].count,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
}
