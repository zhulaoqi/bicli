import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleExecute(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { scheduleId, action = "execute" } = cleanArgs;
    if (!scheduleId) return formatError("INVALID_ARGS", "scheduleId is required — 先调 datart_schedule_list 获取");

    let path: string;
    let method: "POST" | "PUT" = "POST";

    switch (action) {
      case "start":
        path = `/api/v1/schedules/start/${scheduleId}`;
        method = "PUT";
        break;
      case "stop":
        path = `/api/v1/schedules/stop/${scheduleId}`;
        method = "PUT";
        break;
      default:
        path = `/api/v1/schedules/execute/${scheduleId}`;
    }

    const result = await datartRequest<boolean>(path, context, { method });

    const actionLabel = action === "start" ? "启动" : action === "stop" ? "停止" : "立即执行";
    return formatSuccess({
      success: true,
      scheduleId,
      action,
      message: `✅ 定时任务 ${actionLabel}成功（ID: ${scheduleId}）`,
    });
  });
}

export const datartScheduleExecuteDef = {
  name: "datart_schedule_execute",
  description: "操作 Datart 定时任务：立即执行(execute)、启动(start)、停止(stop)",
  inputSchema: {
    type: "object",
    properties: {
      scheduleId: { type: "string", description: "任务 ID，从 datart_schedule_list 获取" },
      action: {
        type: "string",
        enum: ["execute", "start", "stop"],
        description: "execute=立即触发一次，start=启动任务，stop=停止任务",
        default: "execute",
      },
    },
    required: ["scheduleId"],
  },
};
