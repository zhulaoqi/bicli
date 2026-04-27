import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件分组列表
 * GET /api/biEventGroup/eventGroup/list?productId=xxx
 */
export async function dateyeEventGroupList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId } = cleanArgs;
    if (!productId) return formatError("INVALID_ARGS", "productId is required");

    const data = await dateyeRequest<Array<{
      id: number;
      name: string;
      productId: number;
    }>>("/api/biEventGroup/eventGroup/list", context, {
      params: { productId: Number(productId) },
    });

    return formatSuccess(Array.isArray(data) ? data : []);
  });
}

export const dateyeEventGroupListDef = {
  name: "dataeye_event_group_list",
  description: "获取指定产品下的事件分组列表，创建事件时用于选择所属分组",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      _context: { type: "object" },
    },
    required: ["productId", "_context"],
  },
};
