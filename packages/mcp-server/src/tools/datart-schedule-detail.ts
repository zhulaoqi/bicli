import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import { parseScheduleConfig, redactScheduleConfig } from "./datart-schedule-config.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export type DatartSchedule = {
  id: string;
  name?: string;
  orgId?: string;
  type?: string;
  active?: boolean | number;
  cronExpression?: string;
  startDate?: string;
  endDate?: string;
  config?: string;
  parentId?: string;
  isFolder?: boolean;
  timezone?: string;
  index?: number;
  status?: number;
};

export async function datartScheduleDetail(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId } = cleanArgs;
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required");

    const schedule = await datartRequest<DatartSchedule>(`/api/v1/schedules/${scheduleId}`, context);
    return formatSuccess({
      schedule: {
        ...schedule,
        active: schedule.active === true || schedule.active === 1,
        config: redactScheduleConfig(parseScheduleConfig(schedule.config)),
      },
    });
  });
}

export const datartScheduleDetailDef = {
  name: "dataeye_schedule_detail",
  description: "获取 DataEye 定时任务详情，返回脱敏后的推送配置（不使用免登录接口）",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "定时任务 ID" },
    },
    required: ["scheduleId"],
  },
};
