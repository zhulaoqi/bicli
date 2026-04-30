import { formatError, formatSuccess, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartDownloadSubmit(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const {
      downloadParams,
      fileName,
      downloadType = "EXCEL",
      imageWidth,
    } = cleanArgs;

    if (!Array.isArray(downloadParams) || downloadParams.length === 0) {
      return formatError("INVALID_ARGS", "downloadParams is required and must be a non-empty array");
    }
    if (!fileName) return formatError("INVALID_ARGS", "fileName is required");

    const task = await datartRequest("/api/v1/download/submit/task", context, {
      method: "POST",
      body: {
        downloadParams,
        fileName: String(fileName),
        downloadType: String(downloadType),
        ...(imageWidth ? { imageWidth: Number(imageWidth) } : {}),
      },
    });

    return formatSuccess({
      task,
      message: "下载任务已提交，请调用 dataeye_download_task_list 查询进度",
    });
  });
}

export const datartDownloadSubmitDef = {
  name: "dataeye_download_submit",
  description: "提交 DataEye 数据看板或高级图表下载任务。写入/异步任务操作，调用前必须向用户确认下载范围、文件名和格式。",
  inputSchema: {
    type: "object",
    properties: {
      downloadParams: { type: "array", items: { type: "object" }, description: "前端图表下载参数数组，通常来自看板/图表配置" },
      fileName: { type: "string", description: "下载文件名" },
      downloadType: { type: "string", enum: ["EXCEL", "CSV", "IMAGE", "PDF"], description: "下载类型，默认 EXCEL", default: "EXCEL" },
      imageWidth: { type: "number", description: "图片导出宽度，仅图片导出时需要" },
    },
    required: ["downloadParams", "fileName"],
  },
};
