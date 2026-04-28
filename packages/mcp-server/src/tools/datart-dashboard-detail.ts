import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartDashboardDetail(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { dashboardId } = cleanArgs;
    if (!dashboardId) return formatError("INVALID_ARGS", "dashboardId is required");

    type DatachartItem = { id: string; name: string; viewId?: string; config?: unknown };
    type ViewItem = { id: string; name: string; sourceId?: string };
    type DashboardDetail = {
      id: string;
      name: string;
      config?: unknown;
      datacharts?: DatachartItem[];
      views?: ViewItem[];
    };

    const detail = await datartRequest<DashboardDetail>(
      `/api/v1/viz/dashboards/${dashboardId}`,
      context,
    );

    if (!detail) return formatError("NOT_FOUND", `看板 ${dashboardId} 不存在或无权访问`);

    // 精简返回：只保留 LLM 需要的字段
    return formatSuccess({
      id: detail.id,
      name: detail.name,
      chartCount: detail.datacharts?.length ?? 0,
      charts: (detail.datacharts ?? []).slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        viewId: c.viewId,
      })),
      views: (detail.views ?? []).map((v) => ({ id: v.id, name: v.name, sourceId: v.sourceId })),
    });
  });
}

export const datartDashboardDetailDef = {
  name: "dataeye_dashboard_detail",
  description: "获取 DataEye 数据看板详情，包含看板中的高级图表和关联数据视图列表",
  inputSchema: {
    type: "object",
    properties: {
      dashboardId: { type: "string", description: "看板 ID，从数据看板列表工具获取" },
    },
    required: ["dashboardId"],
  },
};
