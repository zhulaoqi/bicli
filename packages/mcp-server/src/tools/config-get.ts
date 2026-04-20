import { z } from "zod";
import { eq, like, or } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { configs } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";
import { applyFieldScopeWithRules } from "../auth/data-scope.js";

export const configGetSchema = z.object({
  key: z.string().optional(),
  keyword: z.string().optional(),
});

export async function configGet(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["config:read"], async (db, cleanArgs, context, adapter) => {
    const input = configGetSchema.parse(cleanArgs);
    const fieldRules = await adapter.getFieldScopeRules(context.role, "configs");

    if (input.key) {
      const config = await db.query.configs.findFirst({ where: eq(configs.key, input.key) });
      if (!config) return formatSuccess(null);
      const [filtered] = applyFieldScopeWithRules(fieldRules, [config]);
      return formatSuccess(filtered);
    }

    if (input.keyword) {
      const results = await db.select().from(configs).where(
        or(
          like(configs.key, `%${input.keyword}%`),
          like(configs.description, `%${input.keyword}%`)
        )
      );
      return formatSuccess(applyFieldScopeWithRules(fieldRules, results));
    }

    const all = await db.select().from(configs);
    return formatSuccess(applyFieldScopeWithRules(fieldRules, all));
  });
}
