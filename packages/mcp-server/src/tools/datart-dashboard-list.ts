import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

// 可视化目录实体实际字段（rel_type: "DASHBOARD"|"DATACHART"|"FOLDER"）
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
    // 可视化资产与 DataEye 共用同一套 orgId（org 表是 DataEye 的视图）
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
  name: "dataeye_dashboard_list",
  description: "获取 DataEye 可视化资源列表。返回的 id 是可执行 relId；folderId 只是目录节点 ID，严禁用于执行。执行真实数据优先把用户原始名称/引用传给 dataeye_dashboard_execute",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID，不填则自动使用当前用户的 orgId" },
    },
  },
};

