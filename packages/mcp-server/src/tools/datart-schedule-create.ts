import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import {
  buildScheduleConfig,
  normalizeJobType,
  parseScheduleConfig,
  redactScheduleConfig,
  stringifyScheduleConfig,
} from "./datart-schedule-config.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const {
      name,
      type = "EMAIL",
      cronExpression,
      vizId,
      orgId,
      timezone = "Asia/Shanghai",
      config,
      startDate,
      endDate,
      parentId,
      index,
    } = cleanArgs;
    const resolvedOrgId = (orgId as string) || context.orgId;

    if (!name) return formatError("INVALID_ARGS", "name is required");
    if (!cronExpression) return formatError("INVALID_ARGS", "cronExpression is required (Quartz 6位格式，如 '0 0 9 * * ?')");
    if (!resolvedOrgId) return formatError("INVALID_ARGS", "orgId is required");

    const scheduleType = normalizeJobType(type as string);
    const configObject = config
      ? parseScheduleConfig(config)
      : buildScheduleConfig({
          type: scheduleType,
          vizId: vizId as string | undefined,
          vizType: cleanArgs.vizType as string | undefined,
          recipients: cleanArgs.recipients as string[] | string | undefined,
          to: cleanArgs.to as string[] | string | undefined,
          cc: cleanArgs.cc as string[] | string | undefined,
          subject: cleanArgs.subject as string | undefined,
          textContent: cleanArgs.textContent as string | undefined,
          attachments: cleanArgs.attachments as string[] | undefined,
          pushMode: cleanArgs.pushMode as string | undefined,
          webHookUrl: cleanArgs.webHookUrl as string | undefined,
          imageWidth: Number(cleanArgs.imageWidth ?? 1200),
          vizContents: cleanArgs.vizContents as any,
          appId: cleanArgs.appId as string | undefined,
          appSecrete: cleanArgs.appSecrete as string | undefined,
          imgGenerateTime: cleanArgs.imgGenerateTime as boolean | undefined,
          sendDate: cleanArgs.sendDate as boolean | undefined,
        });

    if (!config && !configObject.vizContents?.length) return formatError("INVALID_ARGS", "vizContents or vizId is required");
    if (!config && !configObject.attachments?.length) return formatError("INVALID_ARGS", "attachments is required, e.g. ['IMAGE']");

    type Schedule = { id: string; name: string; type: string; cronExpression?: string };
    const schedule = await datartRequest<Schedule>("/api/v1/schedules", context, {
      method: "POST",
      body: {
        name,
        orgId: resolvedOrgId,
        type: scheduleType,
        cronExpression,
        timezone,
        startDate,
        endDate,
        parentId,
        index,
        isFolder: false,
        config: stringifyScheduleConfig(configObject),
      },
    });

    return formatSuccess({
      success: true,
      scheduleId: schedule.id,
      name: schedule.name,
      cronExpression: schedule.cronExpression,
      config: redactScheduleConfig(configObject),
      message: `✅ 定时任务「${schedule.name}」创建成功，ID: ${schedule.id}`,
    });
  });
}

export const datartScheduleCreateDef = {
  name: "dataeye_schedule_create",
  description: "创建 DataEye 定时推送任务（EMAIL/WECHART/FEISHU），支持定时发送数据看板截图或报表。写入前应先向用户展示摘要并确认",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "任务名称，如'每日看板报表'" },
      type: { type: "string", enum: ["EMAIL", "WECHART", "FEISHU"], description: "推送类型：EMAIL / WECHART / FEISHU", default: "EMAIL" },
      cronExpression: { type: "string", description: "Quartz 6位 Cron 表达式，如 '0 0 9 * * ?' 表示每天9:00" },
      vizId: { type: "string", description: "Datart Folder ID，可与 vizType 一起简化生成 vizContents" },
      vizType: { type: "string", description: "资源类型，默认 DASHBOARD", default: "DASHBOARD" },
      vizContents: { type: "array", description: "Datart ScheduleJobConfig.vizContents，元素包含 vizType/vizId" },
      attachments: { type: "array", items: { type: "string", enum: ["IMAGE", "EXCEL", "PDF", "URL"] }, description: "附件类型，至少一个，如 IMAGE" },
      recipients: { type: "array", items: { type: "string" }, description: "收件人，工具会转成后端要求的分号分隔字符串" },
      cc: { type: "array", items: { type: "string" }, description: "邮件抄送人" },
      subject: { type: "string", description: "推送主题" },
      textContent: { type: "string", description: "正文/说明" },
      webHookUrl: { type: "string", description: "企业微信或飞书 webhook" },
      pushMode: { type: "string", enum: ["webhook", "selfApplication"], description: "飞书推送方式" },
      appId: { type: "string", description: "飞书应用 appId" },
      appSecrete: { type: "string", description: "飞书应用 secret，返回时会脱敏" },
      config: { type: "string", description: "完整的推送配置 JSON 字符串（高级，与 vizId 二选一）" },
      orgId: { type: "string", description: "组织 ID" },
      timezone: { type: "string", description: "时区，默认 Asia/Shanghai", default: "Asia/Shanghai" },
      startDate: { type: "string", description: "生效开始时间，ISO 字符串" },
      endDate: { type: "string", description: "生效结束时间，ISO 字符串" },
      parentId: { type: "string", description: "父目录 ID" },
      index: { type: "number", description: "排序值" },
    },
    required: ["name", "cronExpression"],
  },
};
