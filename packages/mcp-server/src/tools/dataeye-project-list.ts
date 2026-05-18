import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 项目/产品列表
 *
 * 项目: GET /api/tenant/project/list/user?key=xxx
 *   → ProjectControllerNew，@RequestParam key (optional)
 *
 * 产品: GET /api/tenant/product/list/user?projectIdList=xxx
 *   → ProductControllerNew, 参数名 projectIdList (逗号分隔多项目)
 */
export async function dateyeProjectList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { type = "project" } = cleanArgs;

    if (type === "product") {
      const { projectId } = cleanArgs;
      const params: Record<string, string | number | undefined> = {};
      if (projectId) params.projectIdList = String(projectId);

      const data = await dateyeRequest<Array<{
        id: number;
        name: string;
        projectId: number;
        orgId: string;
      }>>("/api/tenant/product/list/user", context, { params });

      return formatSuccess(data);
    }

    const { keyword } = cleanArgs;
    const params: Record<string, string | number | undefined> = {};
    if (keyword) params.key = String(keyword);

    const data = await dateyeRequest<Array<{
      id: number;
      name: string;
      orgId: string;
      description: string;
    }>>("/api/tenant/project/list/user", context, { params });

    return formatSuccess(data);
  });
}

export const dateyeProjectListDef = {
  name: "dataeye_project_list",
  description:
    "获取当前用户有权访问的 dataeye 项目和产品列表（返回数字 id）。" +
    "用于事件分析/数据表等需 projectId 的场景；SQL 的 sourceId 请用 dataeye_datasource_list，勿用本项目 id。",
  inputSchema: {
    type: "object" as const,
    properties: {
      type: { type: "string", enum: ["project", "product"], description: "查询类型: project=项目列表, product=产品列表", default: "project" },
      projectId: { type: "number", description: "项目 ID（type=product 时指定，查该项目下的产品）" },
      keyword: { type: "string", description: "搜索关键词（type=project 时有效）" },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
