import type { AgentRunState, RouteName } from "./agent-state.js";
import type { AgentDeps } from "./agent-deps.js";
import { summarizeToolCallsForPrompt } from "./agent-runner.js";

export interface CritiqueResult {
  passed: boolean;
  issues: string[];
  /** 当 passed=false 且模型给出建议改写时填写 */
  suggestion?: string;
  /** 模型本身的简短解释 */
  reasoning?: string;
}

const DEFAULT_TIMEOUT_MS = 4000;

/** 哪些路由默认触发 critique（写/诊断风险高），其它 route 仅在 AGENT_CRITIQUE_ALL=1 时触发 */
const CRITIQUE_ROUTES: RouteName[] = ["diagnosis", "write_action"];

const CRITIQUE_PROMPT = `你是 BiCLI 的回答质量审查员。下面给出：
- 用户问题
- 路由分类
- 工具调用结果摘要
- AI 当前的最终回答

请按 JSON 输出审查结论：
{
  "passed": true | false,
  "issues": ["列出存在的问题"],
  "suggestion": "（可选）当 passed=false 时给出更安全的改写文本",
  "reasoning": "简短说明"
}

判分标准：
1. **以工具结果为唯一证据**：回答中的事实/字段/数字必须出现在工具结果摘要里。
2. **诊断不臆测根因**：没有日志/事件配置等证据时，不允许直接断言"事件未上报""SDK 没接入"等结论。
3. **写动作明确**：写操作必须说明影响对象、变更摘要、需要用户确认的关键点。
4. **失败必须承认**：如有工具失败或返回错误，回答应反映该错误。
5. **不允许空答**：如果没有任何证据，应说明"工具未返回相关数据"，而不是凭空回答。

注意：只输出 JSON，不要任何额外文字。`;

export async function runCritique(state: AgentRunState, deps: AgentDeps, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CritiqueResult | null> {
  const generateTextFn = deps.generateTextImpl ?? (await import("ai")).generateText;

  const userPrompt = [
    `# 用户问题`,
    state.userMessage,
    `# 路由分类`,
    JSON.stringify(state.route),
    `# 工具结果摘要`,
    summarizeToolCallsForPrompt(state.toolCalls, 3000),
    `# AI 当前回答`,
    state.finalText.slice(0, 3000),
  ].join("\n\n");

  const doRun = async (): Promise<CritiqueResult | null> => {
    const result: any = await generateTextFn({
      model: deps.llm,
      system: CRITIQUE_PROMPT,
      messages: [{ role: "user", content: userPrompt }] as any,
    });
    const text = typeof result.text === "string" ? result.text : "";
    const parsed = parseCritiqueJson(text);
    state.telemetry.critiqueCount += 1;
    return parsed;
  };

  try {
    return await Promise.race([
      doRun(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch (err) {
    console.warn("[critique] failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function parseCritiqueJson(text: string): CritiqueResult | null {
  if (!text) return null;
  // 提取第一个 {...} JSON 块
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    if (typeof obj.passed !== "boolean") return null;
    return {
      passed: obj.passed,
      issues: Array.isArray(obj.issues) ? obj.issues.filter((i: unknown): i is string => typeof i === "string") : [],
      suggestion: typeof obj.suggestion === "string" && obj.suggestion.length > 0 ? obj.suggestion : undefined,
      reasoning: typeof obj.reasoning === "string" ? obj.reasoning : undefined,
    };
  } catch {
    return null;
  }
}

export function shouldRunCritique(state: AgentRunState): boolean {
  if (process.env.AGENT_CRITIQUE === "0") return false;
  if (process.env.AGENT_CRITIQUE_ALL === "1") return true;
  return CRITIQUE_ROUTES.includes(state.route.route);
}
