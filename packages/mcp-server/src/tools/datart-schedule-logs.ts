import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleLogs(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId } = cleanArgs;
    const count = Math.max(1, Math.min(Number(cleanArgs.count ?? 20), 100));
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required");

    const logs = await datartRequest<Array<Record<string, unknown>>>(`/api/v1/schedules/logs/${scheduleId}`, context, {
      params: { count },
    });

    return formatSuccess({
      scheduleId,
      count,
      logs: logs ?? [],
      diagnostics: (logs ?? []).map((log) => ({
        status: log.status,
        message: log.message,
        suggestion: buildLogSuggestion(log.message),
      })),
    });
  });
}

function buildLogSuggestion(message: unknown) {
  const text = String(message ?? "");
  if (/cron/i.test(text)) return "检查 Cron 表达式和 timezone 是否正确。";
  if (/permission|denied|无权|权限/i.test(text)) return "检查任务创建人的资源读取权限；定时任务执行身份来自 createBy。";
  if (/mail|邮件|smtp/i.test(text)) return "检查邮件服务配置、收件人和抄送人格式。";
  if (/webhook|hook|飞书|微信|wechat|feishu/i.test(text)) return "检查 webhook、飞书 pushMode 或应用凭据是否有效。";
  if (!text || text === "SUCCESS") return "最近执行成功。";
  return "查看原始日志 message，并确认关联看板、附件类型和发送配置。";
}

export const datartScheduleLogsDef = {
  name: "dataeye_schedule_logs",
  description: "查看 DataEye 定时任务最近执行日志并给出诊断建议（不使用 logsV2 免登录接口）",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "定时任务 ID" },
      count: { type: "number", description: "返回日志条数，默认 20，最大 100", default: 20 },
    },
    required: ["scheduleId"],
  },
};
