import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 更新数据表状态
 * GET /api/biDataSource/updateStatus (query params)
 * status: ACTIVE=启用, PAUSE=暂停, DELETE=删除（不可逆）
 */
export async function dateyeTableUpdateStatus(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { id, status, confirmed } = cleanArgs;

    if (!id) return formatError("INVALID_ARGS", "id is required");
    if (!status) return formatError("INVALID_ARGS", "status is required: ACTIVE/PAUSE/DELETE");

    const statusStr = String(status).toUpperCase();
    if (!["ACTIVE", "PAUSE", "DELETE"].includes(statusStr)) {
      return formatError("INVALID_ARGS", "status must be ACTIVE, PAUSE, or DELETE");
    }

    // DELETE 是不可逆操作，工具层额外要求传入 confirmed=true 作为二次保险
    if (statusStr === "DELETE" && confirmed !== true) {
      return formatError(
        "CONFIRM_REQUIRED",
        "⚠️ 删除操作不可逆，将同时删除该表的所有数据和结构定义。请在对话中明确确认，然后传入 confirmed=true 再次调用。"
      );
    }

    const data = await dateyeRequest("/api/biDataSource/updateStatus", context, {
      params: { id: Number(id), status: statusStr },
    });

    return formatSuccess(data);
  });
}

export const dateyeTableUpdateStatusDef = {
  name: "dataeye_table_update_status",
  description: "更新数据表状态：ACTIVE=启用, PAUSE=暂停, DELETE=永久删除（不可逆）。DELETE 操作必须在对话中得到用户明确确认，并传入 confirmed=true。",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "number", description: "数据表 ID（必填）" },
      status: { type: "string", enum: ["ACTIVE", "PAUSE", "DELETE"], description: "目标状态：ACTIVE=启用, PAUSE=暂停, DELETE=永久删除（必填）" },
      confirmed: { type: "boolean", description: "DELETE 操作专用：用户在对话中明确确认后传 true，其他操作无需传" },
      _context: { type: "object" },
    },
    required: ["id", "status", "_context"],
  },
};
