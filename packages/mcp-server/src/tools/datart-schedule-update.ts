import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import {
  mergeScheduleConfig,
  parseScheduleConfig,
  redactScheduleConfig,
  stringifyScheduleConfig,
  normalizeJobType,
} from "./datart-schedule-config.js";
import type { DatartSchedule } from "./datart-schedule-detail.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleUpdate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId } = cleanArgs;
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required");

    const current = await datartRequest<DatartSchedule>(`/api/v1/schedules/${scheduleId}`, context);
    const type = normalizeJobType(String(cleanArgs.type ?? current.type ?? "EMAIL"));
    const mergedConfig = mergeScheduleConfig(parseScheduleConfig(current.config), {
      type,
      recipients: cleanArgs.recipients as string[] | string | undefined,
      to: cleanArgs.to as string[] | string | undefined,
      cc: cleanArgs.cc as string[] | string | undefined,
      subject: cleanArgs.subject as string | undefined,
      textContent: cleanArgs.textContent as string | undefined,
      attachments: cleanArgs.attachments as string[] | undefined,
      pushMode: cleanArgs.pushMode as string | undefined,
      webHookUrl: cleanArgs.webHookUrl as string | undefined,
      imageWidth: cleanArgs.imageWidth === undefined ? undefined : Number(cleanArgs.imageWidth),
      vizContents: cleanArgs.vizContents as any,
      vizId: cleanArgs.vizId as string | undefined,
      vizType: cleanArgs.vizType as string | undefined,
      appId: cleanArgs.appId as string | undefined,
      appSecrete: cleanArgs.appSecrete as string | undefined,
      imgGenerateTime: cleanArgs.imgGenerateTime as boolean | undefined,
      sendDate: cleanArgs.sendDate as boolean | undefined,
    });

    const body = {
      name: cleanArgs.name ?? current.name,
      type,
      cronExpression: cleanArgs.cronExpression ?? current.cronExpression,
      startDate: cleanArgs.startDate ?? current.startDate,
      endDate: cleanArgs.endDate ?? current.endDate,
      parentId: cleanArgs.parentId ?? current.parentId,
      timezone: cleanArgs.timezone ?? current.timezone ?? "Asia/Shanghai",
      isFolder: cleanArgs.isFolder ?? current.isFolder ?? false,
      index: cleanArgs.index ?? current.index,
      config: stringifyScheduleConfig(mergedConfig),
    };

    await datartRequest<boolean>(`/api/v1/schedules/${scheduleId}`, context, {
      method: "PUT",
      body,
    });

    return formatSuccess({
      success: true,
      scheduleId,
      updated: true,
      schedule: {
        ...current,
        ...body,
        active: current.active === true || current.active === 1,
        config: redactScheduleConfig(mergedConfig),
      },
      message: `✅ 定时任务「${body.name}」更新成功`,
    });
  });
}

export const datartScheduleUpdateDef = {
  name: "dataeye_schedule_update",
  description: "更新 DataEye 定时任务名称、Cron、时间窗口、收件人、主题、附件、Webhook、飞书配置等。写入前必须向用户展示变更摘要并确认",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "定时任务 ID" },
      name: { type: "string", description: "新任务名称" },
      type: { type: "string", enum: ["EMAIL", "WECHART", "FEISHU"], description: "推送类型" },
      cronExpression: { type: "string", description: "Quartz 6位 Cron 表达式" },
      startDate: { type: "string", description: "生效开始时间" },
      endDate: { type: "string", description: "生效结束时间" },
      timezone: { type: "string", description: "时区" },
      recipients: { type: "array", items: { type: "string" }, description: "收件人，写入时转成分号分隔" },
      cc: { type: "array", items: { type: "string" }, description: "邮件抄送人" },
      subject: { type: "string", description: "主题" },
      textContent: { type: "string", description: "正文/说明" },
      attachments: { type: "array", items: { type: "string", enum: ["IMAGE", "EXCEL", "PDF", "URL"] }, description: "附件类型" },
      vizId: { type: "string", description: "单个资源 Folder ID" },
      vizContents: { type: "array", description: "关联资源列表，元素包含 vizType/vizId" },
      webHookUrl: { type: "string", description: "Webhook URL" },
      pushMode: { type: "string", enum: ["webhook", "selfApplication"], description: "飞书推送方式" },
      appId: { type: "string", description: "飞书应用 appId" },
      appSecrete: { type: "string", description: "飞书应用 secret，返回时脱敏" },
      parentId: { type: "string", description: "父目录 ID" },
      index: { type: "number", description: "排序值" },
    },
    required: ["scheduleId"],
  },
};
