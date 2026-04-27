import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

// Datart Folder 实体实际字段（rel_type: "DASHBOARD"|"DATACHART"|"FOLDER"）
type FolderItem = {
  id: string;
  name: string;
  relType: string;    // "DASHBOARD" | "DATACHART" | "FOLDER"
  relId?: string;     // 关联的 dashboard/datachart id
  subType?: string;
  parentId?: string;
  index?: number;
  orgId?: string;
  status?: number;
};

export async function datartDashboardList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, _args, context) => {
    // Datart 与 DataEye 共用同一套 orgId（org 表是 DataEye 的视图）
    const orgId = (_args.orgId as string) || context.orgId;
    if (!orgId) return formatError("INVALID_ARGS", "orgId is required");

    // 直接按类型查，只返回 DASHBOARD 条目，避免客户端过滤 relType 字段名不一致的问题
    const items = await datartRequest<FolderItem[]>("/api/v1/viz/folders/type", context, {
      params: { orgId, vizType: "DASHBOARD" },
    });

    const dashboards = (items || []).filter((d) => {
      // relId 是真正的 dashboard id，必须存在；否则是孤立 folder 条目，跳过
      const dashboardId = d.relId || (d as any).rel_id;
      return !!dashboardId;
    });

    if (!dashboards.length) {
      return formatSuccess({ total: 0, dashboards: [], message: "当前组织暂无可见看板" });
    }

    return formatSuccess({
      total: dashboards.length,
      dashboards: dashboards.map((d) => ({
        id: d.relId || (d as any).rel_id,  // 真正的 dashboard id
        folderId: d.id,
        name: d.name,
        parentId: d.parentId,
      })),
    });
  });
}

export const datartDashboardListDef = {
  name: "datart_dashboard_list",
  description: "获取 Datart 组织下的看板列表（Datart 与 DataEye 共用 orgId，不需要单独传）",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID，不填则自动使用当前用户的 orgId" },
    },
  },
};

