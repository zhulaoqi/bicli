import type { SubAgent } from "./sub-agent.js";

const TOOL_PREFIXES = ["dataeye_schedule_", "datart_schedule_"];
const KNOWLEDGE_TOOLS = new Set(["dataeye_knowledge_search", "dataeye_concept_explain"]);

export const scheduleRunner: SubAgent = {
  name: "schedule",
  domains: ["schedule"],
  toolFilter(name: string) {
    if (KNOWLEDGE_TOOLS.has(name)) return true;
    return TOOL_PREFIXES.some((p) => name.startsWith(p));
  },
  systemPromptSuffix: `【定时任务专项 SubAgent】
1. 用户的问题与 Datart/DataEye 定时任务相关。优先调用 dataeye_schedule_* / datart_schedule_* 工具。
2. 写操作（启停、修改 cron / 收件人、删除、立即执行）必须先 dryRun，再向用户确认；不要"先改后说"。
3. cron 表达式以工具返回值为准，不要复读历史。
4. 若用户问"区别 / 概念 / 流程图"等知识问题，请改走 dataeye_concept_explain / dataeye_knowledge_search，不要硬调业务工具。`,
};
