import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件启/停用
 * POST /api/eventManage/event/changeStatus
 * 调用方式：form 参数（接口无 @RequestBody）
 * status: 1=启用, 0=停用
 */
export async function dateyeEventStatus(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { id, status } = cleanArgs;

    if (!id) return formatError("INVALID_ARGS", "id is required");
    if (status === undefined || status === null) return formatError("INVALID_ARGS", "status is required (1=启用, 0=停用)");

    const statusNum = Number(status);
    if (statusNum !== 0 && statusNum !== 1) {
      return formatError("INVALID_ARGS", "status must be 0 (停用) or 1 (启用)");
    }

    // form 参数，非 JSON body
    const data = await dateyeRequest("/api/eventManage/event/changeStatus", context, {
      method: "POST",
      params: { id: Number(id), status: statusNum },
    });

    return formatSuccess(data);
  });
}

export const dateyeEventStatusDef = {
  name: "dataeye_event_status",
  description: "启用或停用事件（status: 1=启用, 0=停用）。停用后事件在分析报表中不可见。调用前必须在对话中得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "number", description: "事件关联 ID（必填）" },
      status: { type: "number", description: "目标状态：1=启用，0=停用（必填）" },
      _context: { type: "object" },
    },
    required: ["id", "status", "_context"],
  },
};
