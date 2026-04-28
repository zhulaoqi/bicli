import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartViewCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { name, sourceId, script, orgId, description } = cleanArgs;
    const resolvedOrgId = (orgId as string) || context.orgId;

    if (!name) return formatError("INVALID_ARGS", "name is required");
    if (!sourceId) return formatError("INVALID_ARGS", "sourceId is required — 先获取数据源列表");
    if (!script) return formatError("INVALID_ARGS", "script (SQL) is required");
    if (!resolvedOrgId) return formatError("INVALID_ARGS", "orgId is required");

    type View = { id: string; name: string; sourceId?: string };
    const view = await datartRequest<View>("/api/v1/views", context, {
      method: "POST",
      body: {
        name,
        orgId: resolvedOrgId,
        sourceId,
        script,
        type: "SQL",
        description: description || "",
        model: "{}",
        config: "{}",
      },
    });

    return formatSuccess({
      success: true,
      viewId: view.id,
      name: view.name,
      message: `✅ 视图「${view.name}」创建成功，ID: ${view.id}`,
    });
  });
}

export const datartViewCreateDef = {
  name: "dataeye_view_create",
  description: "创建 DataEye 数据视图（SQL 视图），建议先测试执行 SQL 再创建",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "视图名称" },
      sourceId: { type: "string", description: "数据源 ID，从数据源列表工具获取" },
      script: { type: "string", description: "SQL 查询语句（仅支持 SELECT）" },
      orgId: { type: "string", description: "组织 ID（不填则使用当前用户组织）" },
      description: { type: "string", description: "视图说明（可选）" },
    },
    required: ["name", "sourceId", "script"],
  },
};
