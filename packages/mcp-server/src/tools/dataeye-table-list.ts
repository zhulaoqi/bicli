import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 数据表列表
 * GET /api/biDataSource/pageByBiDataSource
 * 参数: BiDataSourceDto 通过 query string 绑定（page, size, projectId, tableName, status）
 */
export async function dateyeTableList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { projectId, keyword, status, page = 1, pageSize = 20, orderBy = "updateTime desc" } = cleanArgs;

    const params: Record<string, string | number | undefined> = {
      page: Number(page),
      size: Number(pageSize),
      orderBy: String(orderBy),
    };
    if (projectId) params.projectId = String(projectId);
    if (keyword) params.tableName = String(keyword);
    if (status !== undefined) params.status = String(status);

    const data = await dateyeRequest<{
      records: Array<{
        id: number;
        tableName: string;
        remark: string;
        projectId: string;
        orgId: string;
        status: string;
        ctType: number;
        createBy: string;
        createTime: string;
      }>;
      total: number;
    }>("/api/biDataSource/pageByBiDataSource", context, { params });

    return formatSuccess(data.records || data, {
      total: (data as any).total ?? 0,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  });
}

export const dateyeTableListDef = {
  name: "dataeye_table_list",
  description: "查询 dataeye 数据表列表（bi_data_source），含表名、描述、项目关联、状态",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "string", description: "项目 ID" },
      keyword: { type: "string", description: "表名/描述搜索关键词" },
      status: { type: "string", description: "状态过滤" },
      page: { type: "number", description: "页码", default: 1 },
      pageSize: { type: "number", description: "每页条数", default: 20 },
      orderBy: { type: "string", description: "排序规则，默认 'updateTime desc'（按更新时间倒序）" },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
