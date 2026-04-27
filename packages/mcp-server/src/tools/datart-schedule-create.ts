import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { name, type = "EMAIL", cronExpression, vizId, orgId, timezone = "Asia/Shanghai", config } = cleanArgs;
    const resolvedOrgId = (orgId as string) || context.orgId;

    if (!name) return formatError("INVALID_ARGS", "name is required");
    if (!cronExpression) return formatError("INVALID_ARGS", "cronExpression is required (Quartz 6位格式，如 '0 0 9 * * ?')");
    if (!vizId && !config) return formatError("INVALID_ARGS", "vizId or config is required");
    if (!resolvedOrgId) return formatError("INVALID_ARGS", "orgId is required");

    // 构造 config JSON（若未直接提供）
    let configJson = config as string;
    if (!configJson && vizId) {
      configJson = JSON.stringify({
        vizType: "DASHBOARD",
        vizId,
        contentType: "IMAGE",
        imageWidth: 1200,
      });
    }

    type Schedule = { id: string; name: string; type: string; cronExpression?: string };
    const schedule = await datartRequest<Schedule>("/api/v1/schedules", context, {
      method: "POST",
      body: {
        name,
        orgId: resolvedOrgId,
        type,
        cronExpression,
        timezone,
        isFolder: false,
        config: configJson,
      },
    });

    return formatSuccess({
      success: true,
      scheduleId: schedule.id,
      name: schedule.name,
      cronExpression: schedule.cronExpression,
      message: `✅ 定时任务「${schedule.name}」创建成功，ID: ${schedule.id}`,
    });
  });
}

export const datartScheduleCreateDef = {
  name: "datart_schedule_create",
  description: "在 Datart 中创建定时推送任务（EMAIL/WECHAT/DINGDING），支持定时发送看板截图/报表",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "任务名称，如'每日看板报表'" },
      type: { type: "string", description: "推送类型：EMAIL / WECHAT / DINGDING / HTTP", default: "EMAIL" },
      cronExpression: { type: "string", description: "Quartz 6位 Cron 表达式，如 '0 0 9 * * ?' 表示每天9:00" },
      vizId: { type: "string", description: "看板 ID（与 config 二选一）" },
      config: { type: "string", description: "完整的推送配置 JSON 字符串（高级，与 vizId 二选一）" },
      orgId: { type: "string", description: "组织 ID" },
      timezone: { type: "string", description: "时区，默认 Asia/Shanghai", default: "Asia/Shanghai" },
    },
    required: ["name", "cronExpression"],
  },
};
