import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 组织用户列表
 * POST /api/tenant/user/page (@RequestBody UserPageParam)
 * 用于权限诊断：查看组织内有哪些成员
 */
export async function dateyeUserList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { page = 1, pageSize = 20, keyword } = cleanArgs;

    const body: Record<string, unknown> = {
      page: Number(page),
      size: Number(pageSize),
    };
    if (keyword) body.keyword = String(keyword);

    const data = await dateyeRequest<any>("/api/tenant/user/page", context, {
      method: "POST",
      body,
    });

    // 裁剪返回字段，防止大量用户数据撑爆 LLM 上下文
    const slim = (list: any[]) =>
      list.map((u: any) => ({
        userId: u.userId ?? u.id,
        username: u.username ?? u.orgUserName ?? u.name,
        email: u.email,
        phone: u.phone,
        status: u.status ?? u.userStatus ?? u.state,
        enabled: u.enabled ?? u.enable,
        roles: Array.isArray(u.roleVoList)
          ? u.roleVoList.map((r: any) => ({ id: r.roleId ?? r.id, name: r.roleName ?? r.name }))
          : undefined,
      }));

    if (data && typeof data === "object" && Array.isArray((data as any).records)) {
      return formatSuccess({
        total: (data as any).total,
        page: Number(page),
        pageSize: Number(pageSize),
        records: slim((data as any).records),
      });
    }
    if (Array.isArray(data)) {
      return formatSuccess(slim(data));
    }
    return formatSuccess(data);
  });
}

export const dateyeUserListDef = {
  name: "dataeye_user_list",
  description: "查询当前组织的成员列表，用于权限诊断和了解组织结构",
  inputSchema: {
    type: "object" as const,
    properties: {
      keyword: { type: "string", description: "搜索关键词（姓名/邮箱）" },
      page: { type: "number", description: "页码", default: 1 },
      pageSize: { type: "number", description: "每页条数", default: 20 },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
