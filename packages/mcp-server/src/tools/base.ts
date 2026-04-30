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

function normalizeToolError(message: string): { code: string; message: string } {
  if (/resource\.dashboard\s+不存在|dashboard\s+不存在|ENTITY_NOT_FOUND|50024/.test(message)) {
    return {
      code: "NOT_FOUND",
      message:
        "看板资源不存在或当前用户无权访问。可能传入了 folderId、短 ID、已删除/归档资源，或当前组织/权限不匹配；请通过看板列表解析真实 relId 后重试。"
        + ` 原始错误：${message}`,
    };
  }
  return { code: "INTERNAL_ERROR", message };
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
    const normalized = normalizeToolError(message);
    return formatError(normalized.code, normalized.message);
  }
}
