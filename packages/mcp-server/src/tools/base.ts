import type { ToolResponse, ToolContext } from "../types/index.js";
import { extractContext, checkPermissions } from "../auth/rbac.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter, IdentityCredential } from "../auth/adapter.js";

export function formatSuccess<T>(data: T, meta?: ToolResponse["meta"]) {
  const response: ToolResponse<T> = { success: true, data };
  if (meta) response.meta = meta;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response) }],
  };
}

export function formatError(code: string, message: string) {
  const response: ToolResponse = { success: false, error: { code, message } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response) }],
    isError: true,
  };
}

export async function withAuth(
  db: Database,
  adapter: PermissionAdapter,
  args: Record<string, unknown>,
  requiredPermissions: string[],
  handler: (db: Database, cleanArgs: Record<string, unknown>, context: ToolContext, adapter: PermissionAdapter) => Promise<ReturnType<typeof formatSuccess>>
) {
  try {
    const { context, cleanArgs } = extractContext(args);
    const credential: IdentityCredential = context.token
      ? { type: "token", token: context.token }
      : { type: "direct", userId: context.userId, role: context.role };
    const identity = await adapter.resolveIdentity(credential);
    const resolvedContext: ToolContext = {
      ...context,
      userId: identity.userId,
      role: identity.role,
      orgId: identity.orgId || context.orgId,
    };
    const userPerms = await adapter.getPermissions(identity.role);
    if (!checkPermissions(userPerms, requiredPermissions)) {
      return formatError(
        "PERMISSION_DENIED",
        `需要权限: ${requiredPermissions.join(", ")}，当前角色 ${resolvedContext.role} 不具备`
      );
    }
    return await handler(db, cleanArgs, resolvedContext, adapter);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return formatError("INTERNAL_ERROR", message);
  }
}
