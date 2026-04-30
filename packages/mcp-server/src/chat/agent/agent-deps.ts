import type { LanguageModel } from "ai";
import type { Response } from "express";
import type { CustomModelConfig } from "@bicli/core";
import type { StreamToolSpec } from "../stream.js";

/**
 * Agent 各阶段共享的依赖。
 * 设计目标：
 * 1. 把 LLM 调用、SSE 输出、工具规格集中在一个对象上，便于测试 mock。
 * 2. 不直接持有 SSE 文本缓冲（stream-level state 仍由 stream.ts 管理）。
 * 3. 允许测试注入替代版的 streamText / generateText。
 */
export interface AgentDeps {
  llm: LanguageModel;
  /** 主体 system prompt（已经包含 page context、skills 等注入项） */
  systemPrompt: string;
  /** Express response，用于 SSE */
  res: Response;
  /** Closure 已注入身份 / token 的工具集合 */
  toolSpecs: StreamToolSpec[];
  customConfig?: CustomModelConfig;
  /** 默认 8 步 */
  maxSteps: number;
  /** 默认 6000 字符；超过则截断 */
  maxToolResultChars?: number;
  /** 测试时可注入 mock streamText（默认从 ai SDK 加载） */
  streamTextImpl?: any;
  /** 测试时可注入 mock generateText（默认从 ai SDK 加载） */
  generateTextImpl?: any;
}

/** SSE 输出辅助 */
export function emitSse(res: Response | null, event: string, data: unknown) {
  if (!res) return;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.warn(`[agent] failed to send ${event} SSE`, err);
  }
}
