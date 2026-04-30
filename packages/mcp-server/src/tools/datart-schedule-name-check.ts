import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartScheduleNameCheck(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const orgId = (cleanArgs.orgId as string) || context.orgId;
    const { name, parentId } = cleanArgs;
    if (!orgId) return formatError("INVALID_ARGS", "orgId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required");

    const unique = await datartRequest<boolean>("/api/v1/schedules/check/name", context, {
      method: "POST",
      body: { orgId, parentId, name },
    });

    return formatSuccess({ orgId, parentId, name, unique });
  });
}

export const datartScheduleNameCheckDef = {
  name: "dataeye_schedule_name_check",
  description: "校验 DataEye 定时任务同级目录名称是否可用，创建、复制、重命名前使用",
  inputSchema: {
    type: "object",
    properties: {
      orgId: { type: "string", description: "组织 ID" },
      parentId: { type: "string", description: "父目录 ID" },
      name: { type: "string", description: "任务名称" },
    },
    required: ["name"],
  },
};
