import { formatError, formatSuccess, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartShareList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { vizId } = cleanArgs;
    if (!vizId) return formatError("INVALID_ARGS", "vizId is required");

    const shares = await datartRequest(`/api/v1/shares/${vizId}`, context);
    return formatSuccess({
      vizId: String(vizId),
      shares,
      message: "已获取分享链接列表",
    });
  });
}

export const datartShareListDef = {
  name: "dataeye_share_list",
  description: "查询指定 DataEye 数据看板或高级图表已有的分享链接列表",
  inputSchema: {
    type: "object",
    properties: {
      vizId: { type: "string", description: "看板或图表 ID" },
    },
    required: ["vizId"],
  },
};
