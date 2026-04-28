import { generateText, type LanguageModel, type Tool } from "ai";

/**
 * 修复指令 — 拼接到 systemPrompt 末尾，告知模型上一轮违反了幻觉规则。
 * 不使用独立的 message，避免污染对话角色结构。
 */
export const REPAIR_PROMPT_SUFFIX = `

⛔ [系统自动纠偏]
上一轮模型回复在未调用任何工具的情况下，输出了包含大量列表/实体数据的内容，
这违反了【禁止幻觉】规则，相关内容已被系统拦截。

本轮强制要求：
1. 必须先调用相关工具，获取实时/真实数据；
2. 只能基于工具返回值作答，严禁直接从记忆/历史复述。
`;

export interface RepairOutcome {
  text: string;
  toolCount: number;
  /** 来自 generateText result.steps 的原始步骤数组，供调用方发送 SSE tool_start / tool_result 事件 */
  steps: RepairStep[];
}

export interface RepairStep {
  toolCalls: RepairToolCall[];
  toolResults: RepairToolResult[];
}

export interface RepairToolCall {
  toolCallId: string;
  toolName: string;
  /** AI SDK 不同版本字段名可能为 input 或 args */
  input: unknown;
}

export interface RepairToolResult {
  toolCallId: string;
  toolName: string;
  /** AI SDK 不同版本字段名可能为 output 或 result */
  output: unknown;
}

/**
 * 执行一轮修复调用。
 *
 * 使用 generateText（非流式）+ toolChoice: "required" 强制模型调用工具，
 * 并从 result.steps 中提取 toolCall/toolResult 信息，由调用方负责发送 SSE 事件。
 *
 * 返回 null 的情形：
 *   - 无可用工具
 *   - 修复调用仍未产生工具调用
 *   - 超时
 *   - 抛出异常
 */
export async function runRepairRound(params: {
  llm: LanguageModel;
  systemPrompt: string;
  /** 与主轮相同的 messages 数组（不含失败的 assistant 回复） */
  messages: unknown[];
  aiTools: Record<string, Tool<any, any>>;
  timeoutMs?: number;
  maxSteps?: number;
}): Promise<RepairOutcome | null> {
  const {
    llm,
    systemPrompt,
    messages,
    aiTools,
    timeoutMs = 25000,
    maxSteps = 5,
  } = params;

  if (Object.keys(aiTools).length === 0) {
    console.warn("[repair] no tools available, skipping repair round");
    return null;
  }

  const repairSystem = systemPrompt + REPAIR_PROMPT_SUFFIX;

  const doRepair = async (): Promise<RepairOutcome | null> => {
    const result = await (generateText as any)({
      model: llm,
      system: repairSystem,
      messages: messages as any,
      tools: aiTools,
      toolChoice: "required",
      maxSteps,
    }) as Awaited<ReturnType<typeof generateText>>;

    // result.toolCalls 汇总了所有 steps 的工具调用
    const toolCount = ((result as any).toolCalls?.length ?? 0) as number;
    if (toolCount === 0) {
      console.warn("[repair] generateText completed but no tool calls were made");
      return null;
    }

    // 提取 steps 用于 SSE 事件发送
    const rawSteps: any[] = (result as any).steps ?? [];
    const steps: RepairStep[] = rawSteps.map((s) => ({
      toolCalls: (s.toolCalls ?? []).map((c: any) => ({
        toolCallId: c.toolCallId ?? c.id ?? "",
        toolName: c.toolName ?? c.name ?? "",
        input: c.input ?? c.args ?? {},
      })),
      toolResults: (s.toolResults ?? []).map((r: any) => ({
        toolCallId: r.toolCallId ?? r.id ?? "",
        toolName: r.toolName ?? r.name ?? "",
        output: r.output ?? r.result ?? "",
      })),
    }));

    return {
      text: result.text ?? "",
      toolCount,
      steps,
    };
  };

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.warn(`[repair] round timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs)
  );

  try {
    return await Promise.race([doRepair(), timeoutPromise]);
  } catch (e) {
    console.warn("[repair] round threw:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
