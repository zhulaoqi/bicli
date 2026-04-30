import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * 给用户分配角色/用户组
 * POST /api/tenant/user/auth  (@RequestBody UserAuthParam)

 */
export async function dateyeUserAssignRole(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { userId, orgId, roleIdList, groupIdList } = cleanArgs;

    if (!userId) return formatError("INVALID_ARGS", "userId 为必填项，可通过 dataeye_user_list 获取");
    if (!Array.isArray(roleIdList) && !Array.isArray(groupIdList)) {
      return formatError("INVALID_ARGS", "roleIdList 和 groupIdList 至少填写一个");
    }

    const resolvedOrgId = orgId ? String(orgId) : context.orgId;
    if (!resolvedOrgId) return formatError("INVALID_ARGS", "无法获取 orgId，请手动传入");

    const body: Record<string, unknown> = {
      userInfoList: [{ userId: String(userId), orgId: resolvedOrgId }],
    };
    if (Array.isArray(roleIdList) && roleIdList.length > 0) body.roleIdList = roleIdList.map(String);
    if (Array.isArray(groupIdList) && groupIdList.length > 0) body.groupIdList = groupIdList.map(Number);

    const data = await dateyeRequest("/api/tenant/user/auth", context, {
      method: "POST",
      body,
    });

    return formatSuccess({ result: data, message: `已成功为用户 ${userId} 分配角色` });
  });
}

export const dateyeUserAssignRoleDef = {
  name: "dataeye_user_assign_role",
  description: "单步为已有用户分配角色或用户组，会覆盖已有分配。新增成员完整流程请优先使用 dataeye_user_onboard；本工具属于写操作，调用前必须得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      userId: {
        type: "string",
        description: "用户 ID（必填），通过 dataeye_user_list 获取",
      },
      orgId: {
        type: "string",
        description: "组织 ID，默认使用当前登录用户的组织",
      },
      roleIdList: {
        type: "array",
        items: { type: "string" },
        description: "角色 ID 列表，通过 dataeye_role_list 获取",
      },
      groupIdList: {
        type: "array",
        items: { type: "number" },
        description: "用户组 ID 列表（可选）",
      },
      _context: { type: "object" },
    },
    required: ["userId", "_context"],
  },
};
