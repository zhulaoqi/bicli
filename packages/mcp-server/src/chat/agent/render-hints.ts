import type { AgentRunState, RenderHints } from "./agent-state.js";

/**
 * 根据 state 计算 finalize 之后的渲染建议。
 * 这些建议通过 SSE `agent_render_hint` 事件传给前端，前端按 hint 调整渲染策略。
 *
 * 规则：
 * 1. visual_explain 路由：优先 Mermaid，禁用大型 Markdown 表格
 * 2. write_action 路由：高亮"待确认"动作
 * 3. diagnosis / knowledge 路由：偏好编号步骤
 * 4. realtime_query：默认无特殊 hint，依赖 message_block 渲染
 */
export function computeRenderHints(state: AgentRunState): RenderHints {
  const route = state.route.route;
  const hints: RenderHints = {};

  if (route === "visual_explain") {
    hints.preferMermaid = true;
    hints.suppressMarkdownTable = true;
  }

  if (route === "write_action") {
    hints.highlightConfirmation = true;
  }

  if (route === "diagnosis" || route === "knowledge") {
    hints.preferSteps = true;
  }

  // finalize 文本里已有 mermaid 时也强制 preferMermaid
  if (/```mermaid\b/i.test(state.finalText)) {
    hints.preferMermaid = true;
  }

  return hints;
}
