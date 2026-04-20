import { z } from "zod";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { extractContext } from "../auth/rbac.js";
import { formatSuccess, formatError } from "./base.js";
import type { IdentityCredential } from "../auth/adapter.js";

export const selfPermissionsSchema = z.object({
  _context: z.object({
    userId: z.number(),
    role: z.string(),
  }),
});

export async function selfPermissions(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  try {
    const { context } = extractContext(args);
    const credential: IdentityCredential = context.token
      ? { type: "token", token: context.token }
      : { type: "direct", userId: context.userId, role: context.role };
    const identity = await adapter.resolveIdentity(credential);
    const permissions = await adapter.getPermissions(identity.role);
    return formatSuccess({ role: identity.role, permissions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return formatError("INTERNAL_ERROR", message);
  }
}
