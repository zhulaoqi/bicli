import { streamText, tool as defineTool, jsonSchema, stepCountIs, type LanguageModel, type Tool } from "ai";
import { createModel, type ExtendedProvider } from "@bicli/core";
import type { CustomModelConfig } from "@bicli/core";
import type { Response } from "express";
import type { SessionStore, ToolCallRecord } from "./session-store.js";
import { extractFollowUps } from "./system-prompt.js";

export interface StreamToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Execute the tool. Should already have identity / token injected via closure by the caller.
   * Must return a plain string (the LLM-facing payload). The http-server layer is responsible
   * for unwrapping MCP { content: [{ type: 'text', text }] } into plain JSON strings.
   */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface StreamChatParams {
  res: Response;
  sessionId: number;
  userMessage: string;
  model: string;
  provider: ExtendedProvider;
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tools: StreamToolSpec[];
  store: SessionStore;
  maxSteps?: number;
  customConfig?: CustomModelConfig;
}

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function handleChatStream(params: StreamChatParams): Promise<void> {
  const {
    res,
    sessionId,
    userMessage,
    model,
    provider,
    systemPrompt,
    history,
    tools,
    store,
    maxSteps = 8,
    customConfig,
  } = params;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();

  // 持久化当前 user 消息
  await store.addMessage(sessionId, { role: "user", content: userMessage });

  let llm: LanguageModel;
  try {
    llm = createModel(provider, model, customConfig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sseSend(res, "error", { message: `模型创建失败: ${msg}` });
    res.end();
    return;
  }

  const toolStartTimes: Record<string, number> = {};
  const recordedCalls: ToolCallRecord[] = [];

  const aiTools: Record<string, Tool<any, any>> = {};
  for (const t of tools) {
    aiTools[t.name] = defineTool<any, string>({
      description: t.description,
      inputSchema: jsonSchema<any>(t.inputSchema ?? { type: "object" }),
      execute: async (args: any) => {
        try {
          const raw = await t.execute(args ?? {});

          // 拦截 __chart__ 字段：通过单独的 chart_data SSE 发给前端，不进入 LLM 上下文
          let resultForLLM = raw;
          if (typeof raw === "string") {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.data?.__chart__) {
                sseSend(res, "chart_data", {
                  toolCallId: t.name + "_" + Date.now(),
                  toolName: t.name,
                  ...parsed.data.__chart__,
                });
                delete parsed.data.__chart__;
                resultForLLM = JSON.stringify(parsed);
              }
            } catch { /* JSON 解析失败则原样传给 LLM */ }
          }

          // 全局工具结果大小保护：超过 6000 字符截断，防止单个工具结果撑爆 LLM 上下文
          const MAX_TOOL_RESULT = 6000;
          if (typeof resultForLLM === "string" && resultForLLM.length > MAX_TOOL_RESULT) {
            console.warn(`[stream] tool ${t.name} result truncated: ${resultForLLM.length} → ${MAX_TOOL_RESULT} chars`);
            return resultForLLM.slice(0, MAX_TOOL_RESULT) + `\n... [结果已截断，共 ${resultForLLM.length} 字符，仅保留前 ${MAX_TOOL_RESULT}]`;
          }
          return resultForLLM;
        } catch (err) {
          return JSON.stringify({
            success: false,
            error: { message: err instanceof Error ? err.message : String(err) },
          });
        }
      },
    });
  }

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  let fullText = "";
  let errored = false;

  // ── 流式 tool_history 注释过滤器 ──────────────────────────────────────────
  // LLM 有时会把历史消息里注入的 <!--tool_history:...--> 原样输出到回复中。
  // 这里用状态机在 text-delta 层面把它过滤掉，不让它到达前端。
  let commentBuf = "";     // 正在缓冲中的潜在注释
  let inComment = false;   // 是否处于 <!-- 内部

  function flushTextDelta(text: string) {
    if (!text) return;
    fullText += text;
    sseSend(res, "text_delta", { content: text });
  }

  function processTextDelta(chunk: string) {
    let i = 0;
    while (i < chunk.length) {
      const ch = chunk[i];
      if (!inComment) {
        // 检测 <!-- 起始
        commentBuf += ch;
        if ("<!--".startsWith(commentBuf)) {
          if (commentBuf === "<!--") {
            inComment = true;
            commentBuf = "<!--";
          }
          // 继续缓冲等待 <!-- 完整
        } else {
          // 非注释起始，把缓冲区 flush 出去再继续
          const flush = commentBuf.slice(0, -1); // 除了最后一个字符（已加过）
          // 实际上 commentBuf 末尾是 ch，把 commentBuf 整体 flush
          flushTextDelta(commentBuf);
          commentBuf = "";
        }
      } else {
        // 在 <!-- 内部，等待 -->
        commentBuf += ch;
        if (commentBuf.endsWith("-->")) {
          // 判断是否是 tool_history 注释
          if (/<!--[\s\S]*?tool_history:[\s\S]*?-->/.test(commentBuf)) {
            // 丢弃，同时跳过紧跟的 \n
            commentBuf = "";
            inComment = false;
            // 如果下一个字符是换行也一起吞掉
            if (i + 1 < chunk.length && chunk[i + 1] === "\n") i++;
          } else {
            // 非 tool_history 注释，原样输出
            flushTextDelta(commentBuf);
            commentBuf = "";
            inComment = false;
          }
        }
      }
      i++;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const result = streamText({
      model: llm,
      system: systemPrompt,
      messages: messages as any,
      tools: aiTools,
      toolChoice: "auto",
      stopWhen: stepCountIs(maxSteps),
      onStepFinish: ({ toolCalls, text, finishReason, usage, warnings }: any) => {
        console.log(
          `[stream] finishReason=${finishReason} ` +
          `toolCalls=${toolCalls?.length ?? 0} textLen=${text?.length ?? 0} ` +
          `usage=${JSON.stringify(usage)} warnings=${JSON.stringify(warnings)}`,
        );
      },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          processTextDelta(part.text);
          break;
        case "tool-call": {
          toolStartTimes[part.toolCallId] = Date.now();
          recordedCalls.push({
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
            status: "running",
          });
          sseSend(res, "tool_start", {
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          });
          break;
        }
        case "tool-result": {
          const duration = Date.now() - (toolStartTimes[part.toolCallId] || Date.now());
          const rec = recordedCalls.find((r) => r.id === part.toolCallId);
          // 解析工具返回值，判断成功/失败并打印可追溯日志
          let toolSuccess = true;
          try {
            const parsed = typeof part.output === "string" ? JSON.parse(part.output) : part.output;
            toolSuccess = parsed?.success !== false;
          } catch { /* ignore parse error */ }
          console.log(
            `[tool] ${part.toolName} ${toolSuccess ? "✓" : "✗"} duration=${duration}ms` +
            (toolSuccess ? "" : ` result=${String(part.output).slice(0, 200)}`)
          );
          if (rec) {
            rec.result = part.output;
            rec.duration = duration;
            rec.status = toolSuccess ? "done" : "error";
          }
          sseSend(res, "tool_result", {
            id: part.toolCallId,
            name: part.toolName,
            result: part.output,
            duration,
          });
          break;
        }
        case "error":
          errored = true;
          sseSend(res, "error", { message: String(part.error) });
          break;
      }
    }

    // 流结束后把过滤器缓冲区剩余内容 flush（非 tool_history 的残留注释原样输出）
    if (commentBuf && !(/<!--[\s\S]*?tool_history:/.test(commentBuf))) {
      flushTextDelta(commentBuf);
    }

    // 检测模型是否把工具调用以文本形式输出（而非真正调用）
    // 典型特征：输出 <tool_code>...</tool_code> 或 ```json {"name": "tool"...} ``` 
    const FAKE_TOOL_CALL_PATTERNS = [
      /<tool_code>/i,
      /```\s*json\s*\{[\s\S]*?"name"\s*:/,
      /<tool_use>/i,
      /<function_calls>/i,
    ];
    const hasFakeToolCall = FAKE_TOOL_CALL_PATTERNS.some((p) => p.test(fullText));
    if (hasFakeToolCall && recordedCalls.length === 0) {
      const warning =
        `⚠️ 当前模型将工具调用以文本形式输出，而非通过 function calling 真正执行。\n\n` +
        `这意味着工具未被调用，操作未执行。请切换到支持 function calling 的模型（如 qwen-plus / qwen-max）后重试。`;
      console.warn(`[stream] model=${model} output fake tool_code in text, no real tool was called`);
      sseSend(res, "text_replace", { content: warning });
      fullText = warning;
    }

    // ── 幻觉列表探测 ─────────────────────────────────────────────────────────
    // 当本轮没有任何工具调用，但输出了大量列表项（>8条），判定为从历史记忆中复读数据。
    // 用 text_replace 事件完整替换前端已显示的内容，而不是追加警告——
    // 这样用户看不到任何幻觉数据，体验更干净。
    if (recordedCalls.length === 0 && !hasFakeToolCall) {
      const listItemCount = (fullText.match(/^\s*[-•*◆▸◇]\s+.+|^\s*\d+[.)、]\s+.+/gm) || []).length;
      if (listItemCount > 8) {
        const replacement =
          `⚠️ 检测到本次回复包含大量列表内容，但本轮并未执行任何工具调用。\n\n` +
          `这意味着数据来自历史记录或模型推断，**不是真实查询结果**，已阻止显示以避免误导。\n\n` +
          `请告诉我你想查什么，我会立即重新调用工具获取最新数据。`;
        console.warn(`[stream] hallucination detected: ${listItemCount} list items with no tool calls — replacing content`);
        // text_replace 通知前端丢弃已渲染的所有文本，显示替换内容
        sseSend(res, "text_replace", { content: replacement });
        fullText = replacement;
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!fullText.trim() && !errored) {
      let fallback: string;
      if (recordedCalls.length > 0) {
        const toolNames = recordedCalls.map((r) => r.name).join(", ");
        fallback = `（已调用工具：${toolNames}，但模型未生成文字回复，请尝试换个问法）`;
      } else {
        // 模型返回空响应（finishReason=other），通常是不支持工具格式或系统提示词过长
        fallback = `⚠️ 模型未返回任何内容（可能原因：当前模型不支持工具调用格式，或上下文过长被截断）。\n\n建议切换回 qwen-plus / qwen-max 等支持工具调用的模型。`;
        console.warn(`[stream] empty response from model=${model}, provider=${provider}`);
      }
      fullText = fallback;
      sseSend(res, "text_delta", { content: fallback });
    }
  } catch (e) {
    errored = true;
    sseSend(res, "error", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const { clean, followUps } = extractFollowUps(fullText);

  if (clean || recordedCalls.length > 0) {
    // ── 历史消息截断：防止大量工具数据存入 history 被 LLM 复读 ──────────────
    // 当本轮有工具调用且回复内容很长时，截取前 400 字符作为摘要存入历史，
    // 让 LLM 知道"发生了什么"但拿不到完整数据，从而强制其下轮重新调用工具。
    const MAX_HISTORY_CONTENT = 400;
    let contentForHistory = clean;
    if (recordedCalls.length > 0 && clean.length > MAX_HISTORY_CONTENT) {
      contentForHistory = clean.slice(0, MAX_HISTORY_CONTENT) +
        `\n\n…[回复已截断，共 ${clean.length} 字符。如需再次查看完整数据，请重新查询。]`;
    }
    // ─────────────────────────────────────────────────────────────────────────
    await store.addMessage(sessionId, {
      role: "assistant",
      content: contentForHistory,
      toolCalls: recordedCalls.length > 0 ? recordedCalls : null,
    });
  }

  if (followUps.length > 0) {
    sseSend(res, "follow_ups", { questions: followUps });
  }

  if (!errored) {
    sseSend(res, "done", { sessionId });
  }

  res.end();
}
