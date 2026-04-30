import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleArchivedList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const orgId = (cleanArgs.orgId as string) || context.orgId;
    if (!orgId) return formatError("INVALID_ARGS", "orgId is required");

    const schedules = await datartRequest<Array<Record<string, unknown>>>("/api/v1/schedules/archived", context, {
      params: { orgId },
    });
    return formatSuccess({ total: schedules?.length ?? 0, schedules: schedules ?? [] });
  });
}

export async function datartScheduleUnarchive(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId, name } = cleanArgs;
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required");

    await datartRequest<boolean>(`/api/v1/schedules/unarchive/${scheduleId}`, context, {
      method: "PUT",
      params: {
        name: String(name),
        parentId: cleanArgs.parentId as string | undefined,
        index: Number(cleanArgs.index ?? 0),
      },
    });

    return formatSuccess({
      success: true,
      scheduleId,
      name,
      message: `✅ 定时任务「${name}」已取消归档`,
    });
  });
}

export const datartScheduleArchivedListDef = {
  name: "dataeye_schedule_archived_list",
  description: "获取 DataEye 已归档定时任务列表",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID" },
    },
  },
};

export const datartScheduleUnarchiveDef = {
  name: "dataeye_schedule_unarchive",
  description: "从归档恢复 DataEye 定时任务。恢复前应校验新名称可用",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "归档任务 ID" },
      name: { type: "string", description: "恢复后的任务名称" },
      parentId: { type: "string", description: "恢复目标父目录 ID" },
      index: { type: "number", description: "恢复后的排序值", default: 0 },
    },
    required: ["scheduleId", "name"],
  },
};
