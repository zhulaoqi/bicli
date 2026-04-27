import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建事件分组
 * POST /api/biEventGroup/eventGroup/add
 * 约束：分组名最长 10 字符；不可使用 "未分组" 或 "Ungrouped"
 */
export async function dateyeEventGroupAdd(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, name } = cleanArgs;
    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required");

    const nameStr = String(name).trim();
    if (nameStr.length > 10) return formatError("INVALID_ARGS", "分组名最长 10 字符");
    if (nameStr === "未分组" || nameStr === "Ungrouped") {
      return formatError("INVALID_ARGS", `"${nameStr}" 是系统保留名称，请使用其他名称`);
    }

    const data = await dateyeRequest("/api/biEventGroup/eventGroup/add", context, {
      method: "POST",
      body: { productId: Number(productId), name: nameStr },
    });

    return formatSuccess(data);
  });
}

export const dateyeEventGroupAddDef = {
  name: "dataeye_event_group_add",
  description: "在指定产品下创建事件分组（分组名最长10字符）",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      name: { type: "string", description: "分组名称（最长10字符，不可使用'未分组'）" },
      _context: { type: "object" },
    },
    required: ["productId", "name", "_context"],
  },
};
