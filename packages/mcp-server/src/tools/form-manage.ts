import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { forms, formFields } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const formManageSchema = z.object({
  action: z.enum(["update", "delete"]),
  formId: z.number(),
  data: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  }).optional(),
});

export async function formManage(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["form:write"], async (db, cleanArgs) => {
    const input = formManageSchema.parse(cleanArgs);

    switch (input.action) {
      case "update": {
        const updateData: Record<string, unknown> = {};
        if (input.data?.name) updateData.name = input.data.name;
        if (input.data?.description) updateData.description = input.data.description;
        if (input.data?.status) updateData.status = input.data.status;
        await db.update(forms).set(updateData).where(eq(forms.id, input.formId));
        const updated = await db.query.forms.findFirst({ where: eq(forms.id, input.formId) });
        return formatSuccess(updated);
      }
      case "delete": {
        await db.delete(formFields).where(eq(formFields.formId, input.formId));
        await db.delete(forms).where(eq(forms.id, input.formId));
        return formatSuccess({ deleted: true, formId: input.formId });
      }
    }
  });
}
