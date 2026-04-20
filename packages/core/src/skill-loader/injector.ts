import type { Skill } from "@bicli/skills";

const BASE_SYSTEM_PROMPT = `你是 BiCLI 智能助手，可以通过工具帮用户完成用户管理、表单创建、数据查询、配置管理和权限管理等操作。
请根据用户请求选择合适的工具来完成任务。执行工具调用后，用简洁友好的语言向用户展示结果。`;

export function buildSystemPrompt(
  matchedSkill: Skill | null,
  role?: string,
  permissions?: string[]
): string {
  let prompt = BASE_SYSTEM_PROMPT;
  if (role && permissions) {
    prompt += `\n\n当前用户角色: ${role}\n可用权限: ${permissions.join(", ")}\n请不要尝试超出用户权限范围的操作。`;
  }
  if (matchedSkill) {
    prompt += `\n\n---\n\n${matchedSkill.content}`;
  }
  return prompt;
}

export function filterTools(
  allTools: Array<{ name: string; [key: string]: unknown }>,
  matchedSkill: Skill | null
): Array<{ name: string; [key: string]: unknown }> {
  if (!matchedSkill) return allTools;
  return allTools.filter((t) => matchedSkill.requiredTools.includes(t.name));
}
