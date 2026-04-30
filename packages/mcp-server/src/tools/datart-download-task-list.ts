import { formatSuccess, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartDownloadTaskList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const tasks = await datartRequest("/api/v1/download/tasks", context, {
      params: {
        status: typeof cleanArgs.status === "string" ? cleanArgs.status : undefined,
        vizId: typeof cleanArgs.vizId === "string" ? cleanArgs.vizId : undefined,
      },
    });

    return formatSuccess({
      tasks,
      message: "已获取下载任务列表",
    });
  });
}

export const datartDownloadTaskListDef = {
  name: "dataeye_download_task_list",
  description: "查询 DataEye 看板或图表下载任务列表，用于查看异步导出是否完成",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", description: "任务状态过滤，如 CREATED、DONE、FAILED" },
      vizId: { type: "string", description: "可选，看板或图表 ID" },
    },
  },
};
