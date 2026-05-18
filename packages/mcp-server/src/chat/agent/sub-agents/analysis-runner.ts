import type { SubAgent } from "./sub-agent.js";

const TOOL_PREFIXES = [
  "dataeye_event_",
  "dataeye_analysis_",
  "dataeye_funnel_",
  "dataeye_retention_",
  "dataeye_project_",
  "dataeye_table_",
  "dataeye_view_",
  "dataeye_dashboard_",
  "dataeye_chart_",
  "dataeye_sql_",
  "dataeye_dws_",
  "dataeye_datasource_",
];

const KNOWLEDGE_TOOLS = new Set(["dataeye_knowledge_search", "dataeye_concept_explain"]);

export const analysisRunner: SubAgent = {
  name: "analysis",
  domains: ["analysis", "event", "project", "chart", "table", "view", "dashboard"],
  toolFilter(name: string) {
    if (KNOWLEDGE_TOOLS.has(name)) return true;
    return TOOL_PREFIXES.some((p) => name.startsWith(p));
  },
  systemPromptSuffix: `【事件分析专项 SubAgent】
1. 用户的问题与事件 / 漏斗 / 留存等行为分析相关。优先调用 dataeye_event_* / dataeye_funnel_* / dataeye_retention_* 工具。
2. 必须先确认 projectId / productId / 时间区间，再调用分析工具；缺失时主动追问而不是猜测。
3. 数据为空时，请基于工具返回值如实告知"该时间段无数据"，不要凭印象给"可能"。
4. 概念解释请走 dataeye_concept_explain，不要把分析工具当百科调用。`,
};
