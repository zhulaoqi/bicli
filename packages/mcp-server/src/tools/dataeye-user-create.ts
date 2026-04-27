import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * 创建组织用户
 * POST /api/tenant/user/create  (@RequestBody UserCreateParam)

 */
export async function dateyeUserCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { email, username, phone, roleIdList, groupIdList, orgAuthFlag } = cleanArgs;

    if (!email) return formatError("INVALID_ARGS", "email 为必填项");
    if (!username) return formatError("INVALID_ARGS", "username 为必填项");

    // 邮箱简单格式校验
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return formatError("INVALID_ARGS", "email 格式不正确");
    }

    const body: Record<string, unknown> = {
      email: String(email),
      username: String(username),
      orgAuthFlag: Boolean(orgAuthFlag ?? false),
    };
    if (phone) body.phone = String(phone);
    if (Array.isArray(roleIdList) && roleIdList.length > 0) body.roleIdList = roleIdList;
    if (Array.isArray(groupIdList) && groupIdList.length > 0) body.groupIdList = groupIdList;

    const data = await dateyeRequest("/api/tenant/user/create", context, {
      method: "POST",
      body,
    });

    return formatSuccess({ created: data, message: `用户「${username}」(${email}) 已创建成功` });
  });
}

export const dateyeUserCreateDef = {
  name: "dataeye_user_create",
  description: "在当前组织中创建新用户，可同时分配角色和用户组。调用前必须在对话中得到用户明确确认。",
  inputSchema: {
    type: "object" as const,
    properties: {
      email: {
        type: "string",
        description: "用户邮箱（必填，必须是有效邮箱格式）",
      },
      username: {
        type: "string",
        description: "用户显示名称（必填）",
      },
      phone: {
        type: "string",
        description: "手机号（可选）",
      },
      orgAuthFlag: {
        type: "boolean",
        description: "是否为组织管理员，默认 false",
        default: false,
      },
      roleIdList: {
        type: "array",
        items: { type: "string" },
        description: "分配的角色 ID 列表，可通过 dataeye_role_list 获取角色 ID",
      },
      groupIdList: {
        type: "array",
        items: { type: "number" },
        description: "分配的用户组 ID 列表（可选）",
      },
      _context: { type: "object" },
    },
    required: ["email", "username", "_context"],
  },
};
