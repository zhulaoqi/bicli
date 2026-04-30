import type { SubAgent } from "./sub-agent.js";

const TOOL_PREFIXES = [
  "dataeye_user_",
  "dataeye_role_",
  "dataeye_org_",
  "dataeye_permission_",
];

const KNOWLEDGE_TOOLS = new Set(["dataeye_knowledge_search", "dataeye_concept_explain"]);

export const userRunner: SubAgent = {
  name: "user",
  domains: ["user", "role"],
  toolFilter(name: string) {
    if (KNOWLEDGE_TOOLS.has(name)) return true;
    return TOOL_PREFIXES.some((p) => name.startsWith(p));
  },
  systemPromptSuffix: `【用户与权限专项 SubAgent】
1. 用户的问题与账号 / 角色 / 权限 / 组织相关。优先调用 dataeye_user_* / dataeye_role_* / dataeye_org_* / dataeye_permission_* 工具。
2. 创建/删除用户、绑定/解绑角色、修改权限均为高风险写操作：必须先 dryRun，输出影响面，再向用户确认。
3. 如用户提到"邮箱 / 手机号"等敏感字段，输出时优先脱敏（保留前 3 / 后 4 位）。
4. 若问题是"角色和权限的区别 / RBAC 概念"等知识，请走 dataeye_concept_explain。`,
};
