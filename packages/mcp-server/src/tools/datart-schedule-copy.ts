import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { DatartSchedule } from "./datart-schedule-detail.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleCopy(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId, name } = cleanArgs;
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required for copied schedule");

    const current = await datartRequest<DatartSchedule>(`/api/v1/schedules/${scheduleId}`, context);
    const copied = await datartRequest<DatartSchedule>("/api/v1/schedules/copy", context, {
      method: "PUT",
      body: {
        id: scheduleId,
        name,
        orgId: cleanArgs.orgId ?? current.orgId,
        type: cleanArgs.type ?? current.type,
        cronExpression: cleanArgs.cronExpression ?? current.cronExpression,
        startDate: cleanArgs.startDate ?? current.startDate,
        endDate: cleanArgs.endDate ?? current.endDate,
        config: cleanArgs.config ?? current.config,
        parentId: cleanArgs.parentId ?? current.parentId,
        timezone: cleanArgs.timezone ?? current.timezone,
        isFolder: false,
        index: cleanArgs.index ?? current.index,
      },
    });

    return formatSuccess({
      success: true,
      sourceScheduleId: scheduleId,
      scheduleId: copied.id,
      name: copied.name,
      message: `✅ 定时任务已复制为「${copied.name ?? name}」`,
    });
  });
}

export const datartScheduleCopyDef = {
  name: "dataeye_schedule_copy",
  description: "复制 DataEye 定时任务为新任务。复制前应校验新名称并向用户确认",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "源定时任务 ID" },
      name: { type: "string", description: "复制后的新任务名称" },
      orgId: { type: "string", description: "组织 ID，默认沿用源任务" },
      parentId: { type: "string", description: "目标父目录 ID，默认沿用源任务" },
      cronExpression: { type: "string", description: "复制后可覆盖 Cron" },
      timezone: { type: "string", description: "复制后可覆盖时区" },
    },
    required: ["scheduleId", "name"],
  },
};
