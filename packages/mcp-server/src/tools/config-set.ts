import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { configs } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const configSetSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string().optional(),
});

export async function configSet(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["config:write"], async (db, cleanArgs, context) => {
    const input = configSetSchema.parse(cleanArgs);

    const existing = await db.query.configs.findFirst({ where: eq(configs.key, input.key) });

    if (existing) {
      await db.update(configs).set({
        value: input.value,
        description: input.description ?? existing.description,
        updatedBy: context.userId,
      }).where(eq(configs.id, existing.id));
    } else {
      await db.insert(configs).values({
        key: input.key,
        value: input.value,
        description: input.description,
        updatedBy: context.userId,
      });
    }

    const result = await db.query.configs.findFirst({ where: eq(configs.key, input.key) });
    return formatSuccess(result);
  });
}
