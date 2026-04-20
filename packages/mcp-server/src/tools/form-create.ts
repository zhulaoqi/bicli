import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { forms, formFields } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const formCreateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(z.object({
    label: z.string(),
    type: z.enum(["text", "email", "number", "select", "date", "textarea"]),
    required: z.boolean().default(false),
    validation: z.record(z.unknown()).optional(),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  })),
});

export async function formCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["form:write"], async (db, cleanArgs, context) => {
    const input = formCreateSchema.parse(cleanArgs);

    const [result] = await db.insert(forms).values({
      name: input.name,
      description: input.description,
      createdBy: context.userId,
      status: "draft",
    }).$returningId();

    if (input.fields.length > 0) {
      await db.insert(formFields).values(
        input.fields.map((f, i) => ({
          formId: result.id,
          label: f.label,
          type: f.type,
          fieldOrder: i + 1,
          required: f.required,
          validation: f.validation || null,
          options: f.options || null,
        }))
      );
    }

    const form = await db.query.forms.findFirst({ where: eq(forms.id, result.id) });
    const fields = await db.query.formFields.findMany({ where: eq(formFields.formId, result.id) });

    return formatSuccess({ ...form, fields });
  });
}
