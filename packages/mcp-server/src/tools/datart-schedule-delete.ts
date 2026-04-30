import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleDelete(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId } = cleanArgs;
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required");
    const archive = cleanArgs.archive !== false;

    await datartRequest<boolean>(`/api/v1/schedules/${scheduleId}`, context, {
      method: "DELETE",
      params: { archive: archive ? "true" : "false" },
    });

    return formatSuccess({
      success: true,
      scheduleId,
      archive,
      message: archive ? "✅ 定时任务已归档" : "✅ 定时任务已永久删除",
    });
  });
}

export const datartScheduleDeleteDef = {
  name: "dataeye_schedule_delete",
  description: "归档或永久删除 DataEye 定时任务。删除前必须确认；active=true 的任务需先停止",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "定时任务 ID" },
      archive: { type: "boolean", description: "true=归档，false=永久删除；默认 true", default: true },
    },
    required: ["scheduleId"],
  },
};
