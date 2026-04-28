import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllSkills, SkillMatcher, type Skill } from "@bicli/core";

type ToolLike = { name: string };

let helpMatcher: SkillMatcher | null | undefined;

const HELP_SKILL_PREFIX = "dataeye-help-";

function resolveSkillsDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.BICLI_SKILLS_DIR,
    resolve(process.cwd(), "packages/skills/definitions"),
    resolve(process.cwd(), "../skills/definitions"),
    resolve(here, "../../../skills/definitions"),
  ].filter(Boolean) as string[];

  return candidates.find((p) => existsSync(p)) ?? null;
}

function getHelpMatcher(): SkillMatcher | null {
  if (helpMatcher !== undefined) return helpMatcher;

  const skillsDir = resolveSkillsDir();
  if (!skillsDir) {
    console.warn("[chat] DataEye help skills directory not found");
    helpMatcher = null;
    return helpMatcher;
  }

  const helpSkills = loadAllSkills(skillsDir).filter((s) => s.name.startsWith(HELP_SKILL_PREFIX));
  helpMatcher = helpSkills.length > 0 ? new SkillMatcher(helpSkills) : null;
  console.error(`[chat] Loaded ${helpSkills.length} DataEye help skills from ${skillsDir}`);
  return helpMatcher;
}

export function routeDataEyeHelpSkill<T extends ToolLike>(
  userInput: string,
  permissions: string[],
  tools: T[],
): { skill: Skill | null; tools: T[]; skillPrompt?: string } {
  const matcher = getHelpMatcher();
  const skill = matcher?.match(userInput, permissions) ?? null;
  if (!skill) return { skill: null, tools };

  // 不再基于关键词做“知识/实时”硬分流，避免口语表达导致误判。
  // 命中帮助技能后仅注入知识上下文，工具集合保持完整，交由模型按需选择。
  const preferredTools = (skill.requiredTools ?? []).filter(Boolean);

  return {
    skill,
    tools,
    skillPrompt: [
      "【当前请求命中 DataEye 帮助中心知识库】",
      "请优先使用以下知识解释概念与操作路径；若用户要求实时数据/列表/执行结果，必须改为真实工具调用，不得复述历史或推断。",
      preferredTools.length > 0
        ? `优先候选工具：${preferredTools.join(", ")}`
        : "该技能未指定候选工具，是否调用工具由当前任务决定。",
      "",
      skill.content,
    ].join("\n"),
  };
}
