import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 组织角色列表
 * GET /api/tenant/role/list/all
 * 用于权限诊断：查看组织内有哪些角色
 */
export async function dateyeRoleList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const keyword = String(cleanArgs.keyword ?? "").trim().toLowerCase();
    const raw = await dateyeRequest<any>("/api/tenant/role/list/all", context);
    const list = Array.isArray(raw) ? raw : [];
    // 裁剪返回字段，防止全量角色数据撑爆 LLM 上下文
    const slim = list
      .map((r: any) => ({
        id: r.roleId ?? r.id,
        name: r.roleName ?? r.name,
        description: r.description ?? r.remark,
        type: r.type,
      }))
      .filter((r) => {
        if (!keyword) return true;
        return [r.name, r.description, r.id].some((v) => String(v ?? "").toLowerCase().includes(keyword));
      });
    return formatSuccess(slim);
  });
}

export const dateyeRoleListDef = {
  name: "dataeye_role_list",
  description: "查询当前组织的角色列表，用于权限诊断和了解角色配置",
  inputSchema: {
    type: "object" as const,
    properties: {
      keyword: { type: "string", description: "本地模糊搜索关键词（角色名/描述/ID）" },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
