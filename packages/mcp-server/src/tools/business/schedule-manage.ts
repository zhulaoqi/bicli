import { formatSuccess, formatError, withAuth } from "../base.js";
import { datartRequest } from "../datart-proxy.js";
import {
  buildScheduleConfig,
  mergeScheduleConfig,
  normalizeJobType,
  parseScheduleConfig,
  redactScheduleConfig,
  stringifyScheduleConfig,
  splitRecipients,
} from "../datart-schedule-config.js";
import type { DatartSchedule } from "../datart-schedule-detail.js";
import type { Database } from "../../db/connection.js";
import type { PermissionAdapter } from "../../auth/adapter.js";

type ScheduleOperation =
  | "create"
  | "update"
  | "execute"
  | "start"
  | "stop"
  | "archive"
  | "delete"
  | "copy"
  | "unarchive";

export async function dataeyeScheduleManage(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const operation = String(cleanArgs.operation ?? "update") as ScheduleOperation;
    const dryRun = cleanArgs.dryRun !== false;

    if (dryRun) {
      return formatSuccess(await buildDryRun(cleanArgs, context, operation));
    }

    switch (operation) {
      case "create":
        return formatSuccess(await createSchedule(cleanArgs, context));
      case "update":
        return formatSuccess(await updateSchedule(cleanArgs, context));
      case "execute":
      case "start":
      case "stop":
        return formatSuccess(await controlSchedule(cleanArgs, context, operation));
      case "archive":
      case "delete":
        return formatSuccess(await deleteSchedule(cleanArgs, context, operation === "archive"));
      case "copy":
        return formatSuccess(await copySchedule(cleanArgs, context));
      case "unarchive":
        return formatSuccess(await unarchiveSchedule(cleanArgs, context));
      default:
        return formatError("INVALID_ARGS", `Unsupported operation: ${operation}`);
    }
  });
}

async function buildDryRun(args: Record<string, unknown>, context: any, operation: ScheduleOperation) {
  const current = args.scheduleId
    ? await datartRequest<DatartSchedule>(`/api/v1/schedules/${args.scheduleId}`, context)
    : undefined;
  const currentConfig = parseScheduleConfig(current?.config);
  const nextConfig = current
    ? mergeScheduleConfig(currentConfig, args as any)
    : buildScheduleConfig(args as any);

  return {
    dryRun: true,
    operation,
    scheduleId: args.scheduleId,
    target: current ? { id: current.id, name: current.name, active: current.active === true || current.active === 1 } : undefined,
    changes: describeChanges(current, currentConfig, args, nextConfig),
    preview: {
      name: args.name ?? current?.name,
      type: args.type ?? current?.type ?? "EMAIL",
      cronExpression: args.cronExpression ?? current?.cronExpression,
      timezone: args.timezone ?? current?.timezone ?? "Asia/Shanghai",
      config: redactScheduleConfig(nextConfig),
    },
    risks: buildRisks(operation, current),
    nextStep: "请向用户展示以上变更摘要；用户确认后再以 dryRun=false 调用本工具。",
  };
}

async function createSchedule(args: Record<string, unknown>, context: any) {
  if (!args.name) throw new Error("name is required");
  if (!args.cronExpression) throw new Error("cronExpression is required");
  const type = normalizeJobType(String(args.type ?? "EMAIL"));
  const config = buildScheduleConfig({ ...args, type } as any);
  const schedule = await datartRequest<DatartSchedule>("/api/v1/schedules", context, {
    method: "POST",
    body: {
      name: args.name,
      orgId: args.orgId ?? context.orgId,
      type,
      cronExpression: args.cronExpression,
      startDate: args.startDate,
      endDate: args.endDate,
      parentId: args.parentId,
      timezone: args.timezone ?? "Asia/Shanghai",
      isFolder: false,
      index: args.index,
      config: stringifyScheduleConfig(config),
    },
  });
  return { success: true, operation: "create", scheduleId: schedule.id, schedule };
}

async function updateSchedule(args: Record<string, unknown>, context: any) {
  if (!args.scheduleId) throw new Error("scheduleId is required");
  const current = await datartRequest<DatartSchedule>(`/api/v1/schedules/${args.scheduleId}`, context);
  const type = normalizeJobType(String(args.type ?? current.type ?? "EMAIL"));
  const config = mergeScheduleConfig(parseScheduleConfig(current.config), { ...args, type } as any);
  const body = {
    name: args.name ?? current.name,
    type,
    cronExpression: args.cronExpression ?? current.cronExpression,
    startDate: args.startDate ?? current.startDate,
    endDate: args.endDate ?? current.endDate,
    parentId: args.parentId ?? current.parentId,
    timezone: args.timezone ?? current.timezone ?? "Asia/Shanghai",
    isFolder: args.isFolder ?? current.isFolder ?? false,
    index: args.index ?? current.index,
    config: stringifyScheduleConfig(config),
  };
  await datartRequest<boolean>(`/api/v1/schedules/${args.scheduleId}`, context, { method: "PUT", body });
  const verified = await datartRequest<DatartSchedule>(`/api/v1/schedules/${args.scheduleId}`, context);
  return { success: true, operation: "update", scheduleId: args.scheduleId, verified };
}

async function controlSchedule(args: Record<string, unknown>, context: any, operation: "execute" | "start" | "stop") {
  if (!args.scheduleId) throw new Error("scheduleId is required");
  const path = operation === "execute"
    ? `/api/v1/schedules/execute/${args.scheduleId}`
    : `/api/v1/schedules/${operation}/${args.scheduleId}`;
  await datartRequest<boolean>(path, context, { method: operation === "execute" ? "POST" : "PUT" });
  return { success: true, operation, scheduleId: args.scheduleId };
}

async function deleteSchedule(args: Record<string, unknown>, context: any, archive: boolean) {
  if (!args.scheduleId) throw new Error("scheduleId is required");
  await datartRequest<boolean>(`/api/v1/schedules/${args.scheduleId}`, context, {
    method: "DELETE",
    params: { archive: archive ? "true" : "false" },
  });
  return { success: true, operation: archive ? "archive" : "delete", scheduleId: args.scheduleId };
}

async function copySchedule(args: Record<string, unknown>, context: any) {
  if (!args.scheduleId) throw new Error("scheduleId is required");
  if (!args.name) throw new Error("name is required");
  const current = await datartRequest<DatartSchedule>(`/api/v1/schedules/${args.scheduleId}`, context);
  const copied = await datartRequest<DatartSchedule>("/api/v1/schedules/copy", context, {
    method: "PUT",
    body: { ...current, id: args.scheduleId, name: args.name, parentId: args.parentId ?? current.parentId },
  });
  return { success: true, operation: "copy", sourceScheduleId: args.scheduleId, scheduleId: copied.id, schedule: copied };
}

async function unarchiveSchedule(args: Record<string, unknown>, context: any) {
  if (!args.scheduleId) throw new Error("scheduleId is required");
  if (!args.name) throw new Error("name is required");
  await datartRequest<boolean>(`/api/v1/schedules/unarchive/${args.scheduleId}`, context, {
    method: "PUT",
    params: { name: String(args.name), parentId: args.parentId as string | undefined, index: Number(args.index ?? 0) },
  });
  return { success: true, operation: "unarchive", scheduleId: args.scheduleId, name: args.name };
}

function describeChanges(
  current: DatartSchedule | undefined,
  currentConfig: ReturnType<typeof parseScheduleConfig>,
  args: Record<string, unknown>,
  nextConfig: ReturnType<typeof parseScheduleConfig>,
) {
  const changes: string[] = [];
  if (!current) {
    changes.push("将创建新的定时任务");
  }
  if (args.name && args.name !== current?.name) changes.push(`名称：${current?.name ?? "(新建)"} -> ${args.name}`);
  if (args.cronExpression && args.cronExpression !== current?.cronExpression) changes.push(`Cron：${current?.cronExpression ?? "(未设置)"} -> ${args.cronExpression}`);
  if (args.timezone && args.timezone !== current?.timezone) changes.push(`时区：${current?.timezone ?? "(未设置)"} -> ${args.timezone}`);
  const oldRecipients = splitRecipients(currentConfig.to).join(",");
  const newRecipients = splitRecipients(nextConfig.to).join(",");
  if (newRecipients && newRecipients !== oldRecipients) changes.push(`收件人：${oldRecipients || "(无)"} -> ${newRecipients}`);
  if (nextConfig.subject && nextConfig.subject !== currentConfig.subject) changes.push(`主题：${currentConfig.subject ?? "(无)"} -> ${nextConfig.subject}`);
  if (args.webHookUrl && args.webHookUrl !== currentConfig.webHookUrl) changes.push("Webhook：将更新为新的地址（已脱敏展示）");
  if (args.appSecrete) changes.push("飞书 AppSecret：将更新为新的密钥（不会明文返回）");
  return changes.length ? changes : ["未检测到字段变化"];
}

function buildRisks(operation: ScheduleOperation, current?: DatartSchedule) {
  const risks: string[] = [];
  if (["delete", "archive"].includes(operation)) risks.push("删除/归档会改变任务可见性；active=true 的任务需要先停止。");
  if (operation === "update" && (current?.active === true || current?.active === 1)) {
    risks.push("任务当前处于运行中，修改名称、Cron 或时间窗口后建议停止并重新启动。");
  }
  risks.push("任务执行身份来自 Datart createBy；本工具不会修改运行身份或全局邮件发件人。");
  return risks;
}

export const dataeyeScheduleManageDef = {
  name: "dataeye_schedule_manage",
  description: "业务动作：创建、编辑、复制、归档/删除、启停或执行 DataEye 定时任务。默认 dryRun 预览并要求用户确认，dryRun=false 才真实写入",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["create", "update", "execute", "start", "stop", "archive", "delete", "copy", "unarchive"], description: "业务操作类型" },
      dryRun: { type: "boolean", description: "true=只预览变更并返回确认摘要；false=真实执行", default: true },
      scheduleId: { type: "string", description: "已有任务 ID，更新/启停/删除/复制等操作需要" },
      name: { type: "string", description: "任务名称或复制/恢复后的新名称" },
      type: { type: "string", enum: ["EMAIL", "WECHART", "FEISHU"], description: "推送类型" },
      cronExpression: { type: "string", description: "Quartz 6位 Cron 表达式" },
      timezone: { type: "string", description: "时区，默认 Asia/Shanghai" },
      startDate: { type: "string", description: "生效开始时间" },
      endDate: { type: "string", description: "生效结束时间" },
      recipients: { type: "array", items: { type: "string" }, description: "收件人" },
      cc: { type: "array", items: { type: "string" }, description: "抄送人" },
      subject: { type: "string", description: "主题" },
      textContent: { type: "string", description: "正文/说明" },
      attachments: { type: "array", items: { type: "string", enum: ["IMAGE", "EXCEL", "PDF", "URL"] }, description: "附件类型" },
      vizId: { type: "string", description: "单个关联资源 Folder ID" },
      vizContents: { type: "array", description: "关联资源列表，元素包含 vizType/vizId" },
      webHookUrl: { type: "string", description: "企微/飞书 webhook" },
      pushMode: { type: "string", enum: ["webhook", "selfApplication"], description: "飞书推送方式" },
      appId: { type: "string", description: "飞书应用 appId" },
      appSecrete: { type: "string", description: "飞书应用 secret" },
      parentId: { type: "string", description: "父目录 ID" },
      index: { type: "number", description: "排序值" },
    },
    required: ["operation"],
  },
};
