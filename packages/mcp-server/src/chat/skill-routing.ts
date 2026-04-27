import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllSkills, SkillMatcher, type Skill } from "@bicli/core";

type ToolLike = { name: string };

let helpMatcher: SkillMatcher | null | undefined;

const HELP_SKILL_PREFIX = "dataeye-help-";

const HELP_INTENT_RE =
  /(是什么|啥意思|什么意思|能干啥|做什么|怎么用|如何使用|在哪里|在哪|怎么配置|如何配置|说明|文档|FAQ|教程|口径|解释|含义|区别|支持吗|能不能)/i;

const LIVE_DATA_INTENT_RE =
  /(查一下|查询|列出|输出|有多少|多少个|多少条|执行|跑一下|结果|今天|昨天|近\d+|当前|最新|下载|创建|删除|修改|更新|分配)/i;

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
  const hasHelpIntent = HELP_INTENT_RE.test(userInput);
  const hasLiveDataIntent = LIVE_DATA_INTENT_RE.test(userInput);

  if (hasLiveDataIntent && !hasHelpIntent) {
    return { skill: null, tools };
  }

  const matcher = getHelpMatcher();
  const skill = matcher?.match(userInput, permissions) ?? null;
  if (!skill) return { skill: null, tools };

  const allowed = new Set(skill.requiredTools);
  const isMixedIntent = hasHelpIntent && hasLiveDataIntent;
  const routedTools = isMixedIntent
    ? tools
    : allowed.size > 0
      ? tools.filter((t) => allowed.has(t.name))
      : [];

  return {
    skill,
    tools: routedTools,
    skillPrompt: [
      "【当前请求命中 DataEye 帮助中心知识库】",
      isMixedIntent
        ? "本轮是混合意图：产品概念/用法基于以下知识库回答；用户数量、列表、创建/修改等实时或写操作必须调用工具，不能使用历史缓存或推断。"
        : "本轮是纯产品知识咨询：基于以下知识库回答。除非该 skill 显式列出 requiredTools，否则不要调用任何工具，也不要编造实时数据。",
      "",
      skill.content,
    ].join("\n"),
  };
}
