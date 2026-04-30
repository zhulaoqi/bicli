import type { AgentRunState, RouteName } from "./agent-state.js";
import type { AgentDeps } from "./agent-deps.js";
import { emitSse } from "./agent-deps.js";
import { summarizeToolCallsForPrompt } from "./agent-runner.js";
import { buildToolResultFallback } from "./reflector.js";

/**
 * 路由相关的 finalize prompt 增量片段。
 * Finalize 阶段的核心约束：以工具结果为唯一证据，避免幻觉。
 */
const FINALIZE_PROMPT_BY_ROUTE: Record<RouteName, string> = {
  knowledge: `
【Finalize 阶段提示】
1. 这是一个概念/流程/最佳实践类问题，请直接基于产品知识回答。
2. 如果工具结果中有补充事实，把工具结果与你的产品知识结合作答；否则忽略工具结果。
3. 适当使用要点列表或编号步骤。
`,
  realtime_query: `
【Finalize 阶段提示】
1. 严格基于工具返回的数据作答。
2. 不允许引入工具未返回的字段、ID 或数值。
3. 如果工具未返回某字段，明确告诉用户"工具未返回该信息"。
`,
  write_action: `
【Finalize 阶段提示】
1. 这是一个写操作。如果工具未真正执行（dryRun），用"待确认"语气描述将要执行的动作。
2. 突出展示需要用户确认的关键点（受影响对象、变更摘要、潜在风险）。
3. 如果工具失败，明确说明失败原因，不要伪装成功。
`,
  diagnosis: `
【Finalize 阶段提示】
1. 这是一个诊断问题。回答只能引用工具结果中真实存在的事实。
2. 不要在没有证据的情况下推断"事件未上报""SDK 未接入"等根因。
3. 如果工具结果不足以下结论，列出"为了进一步诊断我们还需要查询的内容"。
`,
  visual_explain: `
【Finalize 阶段提示】
1. 用户希望可视化解释。请优先使用 Mermaid 图（flowchart / stateDiagram / sequenceDiagram）。
2. 配合简短文字补充（≤ 5 行）即可，避免长段说明。
3. 不要使用大型 Markdown 表格。
`,
};

/**
 * Finalize 阶段：基于工具结果重新询问模型，生成最终自然语言回答。
 *
 * 行为：
 * - toolChoice="none"，禁止再调用工具
 * - 输入消息：history + 用户问题 + 工具结果摘要
 * - 流式 SSE 发送 text_delta
 * - 输出 state.finalText
 *
 * 空输出兜底：
 * 如果模型仍然返回空字符串，调用 buildToolResultFallback() 给出确定性摘要。
 */
export async function runFinalize(state: AgentRunState, deps: AgentDeps): Promise<void> {
  const start = Date.now();
  const route = state.route.route;

  const toolSummary = state.toolCalls.length > 0
    ? `工具结果摘要（仅供你回答时引用，不允许再调用工具）：\n${summarizeToolCallsForPrompt(state.toolCalls)}`
    : "(本轮未调用任何工具，请直接基于知识或拒答)";

  const finalizeMessages = [
    ...state.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: state.userMessage },
    { role: "user" as const, content: toolSummary },
  ];

  const finalizeSystem = deps.systemPrompt + (FINALIZE_PROMPT_BY_ROUTE[route] ?? "");

  const streamTextFn = deps.streamTextImpl ?? (await import("ai")).streamText;

  let finalText = "";
  let errored = false;

  try {
    const result = streamTextFn({
      model: deps.llm,
      system: finalizeSystem,
      messages: finalizeMessages as any,
      // 显式禁止再次调用工具：
      // 不传 tools；ai SDK 会忽略 toolChoice="none" 缺少 tools 的警告，但安全起见我们都不传。
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          finalText += part.text;
          emitSse(deps.res, "text_delta", { content: part.text });
          break;
        }
        case "error":
          errored = true;
          emitSse(deps.res, "error", { message: String(part.error) });
          break;
      }
    }
  } catch (err) {
    errored = true;
    console.warn("[agent.finalize] streamText threw:", err instanceof Error ? err.message : String(err));
  }

  if (!finalText.trim() && !errored) {
    const fallback = state.toolCalls.length > 0
      ? buildToolResultFallback(state.toolCalls)
      : `⚠️ 模型未返回任何内容。\n\n可能原因：上下文过长被截断、模型服务返回空流，或当前请求被模型侧安全/格式策略中止。请缩小问题范围后重试。`;
    finalText = fallback;
    emitSse(deps.res, "text_delta", { content: fallback });
    state.telemetry.finalizeRan = false;
  } else {
    state.telemetry.finalizeRan = true;
  }

  state.finalText = finalText;
  state.telemetry.finalizeMs = Date.now() - start;
}
