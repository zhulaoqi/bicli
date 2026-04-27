import { formatSuccess, formatError, withAuth } from "./base.js";
import { datartRequest } from "./datart-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

export async function datartShareCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const {
      vizId,
      vizType = "DASHBOARD",
      authenticationMode = "FREE",
      authenticationCode,
      expiryDays = 7,
    } = cleanArgs;

    if (!vizId) return formatError("INVALID_ARGS", "vizId is required — 先调 datart_dashboard_list 获取看板 ID");

    const expiryDate = new Date(Date.now() + Number(expiryDays) * 86400_000).toISOString();

    type ShareToken = { id?: string; authorizedToken?: string; authenticationMode?: string; authenticationCode?: string };
    const shareToken = await datartRequest<ShareToken>("/api/v1/shares", context, {
      method: "POST",
      body: {
        vizType,
        vizId,
        authenticationMode,
        expiryDate,
        rowPermissionBy: "CREATOR",
        roles: [],
        users: [],
        ...(authenticationCode ? { authenticationCode } : {}),
      },
    });

    const frontendBase = process.env.DATART_FRONTEND_URL || process.env.DATART_API_URL?.replace("/api/v1", "") || "";
    const shareUrl = shareToken.authorizedToken
      ? `${frontendBase}/shareDashboard/${shareToken.authorizedToken}`
      : "(URL 需手动拼接：{DATART_FRONTEND_URL}/shareDashboard/{authorizedToken})";

    return formatSuccess({
      success: true,
      shareId: shareToken.id,
      authorizedToken: shareToken.authorizedToken,
      shareUrl,
      authenticationMode,
      expiryDate,
      ...(authenticationMode === "CODE" && authenticationCode ? { password: authenticationCode } : {}),
      message: `✅ 分享链接创建成功，有效期至 ${expiryDate.slice(0, 10)}`,
    });
  });
}

export const datartShareCreateDef = {
  name: "datart_share_create",
  description: "为 Datart 看板或图表创建分享链接，支持免密（FREE）、密码（CODE）、登录（LOGIN）三种访问模式",
  inputSchema: {
    type: "object",
    properties: {
      vizId: { type: "string", description: "看板或图表 ID" },
      vizType: { type: "string", description: "DASHBOARD 或 DATACHART", default: "DASHBOARD" },
      authenticationMode: { type: "string", enum: ["FREE", "CODE", "LOGIN"], description: "访问模式：FREE=无需登录，CODE=需要密码，LOGIN=需要登录", default: "FREE" },
      authenticationCode: { type: "string", description: "访问密码（仅 authenticationMode=CODE 时需要）" },
      expiryDays: { type: "number", description: "有效天数，默认 7 天", default: 7 },
    },
    required: ["vizId"],
  },
};
