import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件列表 — 按产品查询事件定义
 * 代理 POST /api/eventManage/event/page
 * 参数格式: EventManageQueryDto (@RequestBody)
 */
export async function dateyeEventList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, keyword, type, status, page = 1, pageSize = 20, groupId, orderBy = "updateTime desc" } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");

    const body: Record<string, unknown> = {
      productId: Number(productId),
      page: Number(page),
      size: Number(pageSize),
      orderBy: String(orderBy),
    };
    if (keyword) body.keyword = String(keyword);
    if (type !== undefined) body.type = Number(type);
    if (status !== undefined) body.status = Number(status);
    if (groupId) body.eventGroupId = Number(groupId);

    const data = await dateyeRequest<{
      records: Array<{
        id: number;
        eventName: string;
        eventAlias: string;
        description: string;
        type: string;
        status: number;
      }>;
      total: number;
    }>("/api/eventManage/event/page", context, { body });

    return formatSuccess(data.records || data, {
      total: (data as any).total ?? 0,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  });
}

export const dateyeEventListDef = {
  name: "dataeye_event_list",
  description: "查询 dataeye 事件列表（按产品），包含事件名称、别名、类型和状态",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      keyword: { type: "string", description: "事件名/别名搜索关键词" },
      type: { type: "number", description: "事件类型过滤" },
      status: { type: "number", description: "状态: 1=启用, 0=停用" },
      groupId: { type: "number", description: "事件分组 ID" },
      page: { type: "number", description: "页码", default: 1 },
      pageSize: { type: "number", description: "每页条数", default: 20 },
      orderBy: { type: "string", description: "排序规则，默认 'updateTime desc'（按更新时间倒序）" },
      _context: { type: "object" },
    },
    required: ["productId", "_context"],
  },
};
