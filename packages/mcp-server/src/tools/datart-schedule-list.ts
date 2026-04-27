import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const orgId = (cleanArgs.orgId as string) || context.orgId;
    if (!orgId) return formatError("INVALID_ARGS", "orgId is required");

    type Schedule = { id: string; name: string; type: string; active: number; cronExpression?: string; isFolder?: boolean };
    const schedules = await datartRequest<Schedule[]>("/api/v1/schedules", context, {
      params: { orgId },
    });

    const activeSchedules = (schedules || []).filter((s) => !s.isFolder);
    return formatSuccess({
      total: activeSchedules.length,
      schedules: activeSchedules.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        active: s.active === 1,
        cronExpression: s.cronExpression,
      })),
    });
  });
}

export const datartScheduleListDef = {
  name: "datart_schedule_list",
  description: "获取 Datart 定时任务列表（含任务名称、类型、是否启用、Cron 表达式）",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID" },
    },
  },
};
