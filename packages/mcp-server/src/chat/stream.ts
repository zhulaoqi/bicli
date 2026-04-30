import { streamText, tool as defineTool, jsonSchema, stepCountIs, type LanguageModel, type Tool } from "ai";
import { createModel, type ExtendedProvider } from "@bicli/core";
import type { CustomModelConfig } from "@bicli/core";
import type { Response } from "express";
import type { SessionStore, ToolCallRecord } from "./session-store.js";
import { extractFollowUps } from "./system-prompt.js";
import { runRepairRound } from "./response-repair.js";
import { extractStructuredToolArtifacts, type MessageBlock } from "./message-blocks.js";
import {
  sanitizeEmptyAnalysisSpeculation as reflectorSanitizeEmptyAnalysisSpeculation,
  sanitizeVisibleHistoryArtifacts as reflectorSanitizeVisibleHistoryArtifacts,
  buildToolResultFallback as reflectorBuildToolResultFallback,
} from "./agent/reflector.js";

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
  skipNoToolListGuard?: boolean;
  hasPageContextEvidence?: boolean;
  maxSteps?: number;
  customConfig?: CustomModelConfig;
}

export function shouldRequireToolCall(userMessage: string): boolean {
  const text = userMessage.trim();
  const lower = text.toLowerCase();
  if (!text) return false;

  const concreteDataMarkers = [
    /\b(id|ID)\s*[=:：]?\s*\d+\b/,
    /\d{3,}/,
    /当前页面|当前图|这个图|这个看板|这个分析|该产品|该项目|这个事件/,
    /结果|数量|多少|列表|明细|raw\s*data/i,
  ];
  const realtimeActionMarkers = [
    /执行|跑一下|运行|查一下|查询|查看|帮我看|列出|有哪些|有多少|统计|分析.*结果/,
    /下载|导出|分享|生成.*链接/,
  ];
  const helpOnlyMarkers = [
    /是什么|什么意思|概念|原理|怎么配置|如何配置|怎么使用|如何使用|说明|文档|教程|解释一下|流程|步骤|区别|最佳实践|接入/,
  ];

  const hasRealtimeAction = realtimeActionMarkers.some((pattern) => pattern.test(text));
  const hasConcreteData = concreteDataMarkers.some((pattern) => pattern.test(text));
  const helpOnly = helpOnlyMarkers.some((pattern) => pattern.test(text));

  if (helpOnly && !hasConcreteData) return false;
  if (hasRealtimeAction) return true;
  if (hasConcreteData && /为什么|为何|原因|异常|为空|没有数据|没数据|不显示/.test(text)) return true;
  if (hasConcreteData && /看板|分析|图表|事件|产品|项目|用户|角色|数据表/.test(text)) return true;
  if (/\b(my_|cgt|event|analysis|dashboard|chart)\b/i.test(lower) && hasConcreteData) return true;
  return false;
}

// 已迁移到 chat/agent/reflector.ts，这里保留 thin re-export 以兼容现有测试。
// @deprecated 请改用 `chat/agent/reflector.ts` 中的版本。
export const sanitizeEmptyAnalysisSpeculation = reflectorSanitizeEmptyAnalysisSpeculation;
// @deprecated 请改用 `chat/agent/reflector.ts` 中的版本。
export const sanitizeVisibleHistoryArtifacts = reflectorSanitizeVisibleHistoryArtifacts;
// @deprecated 请改用 `chat/agent/reflector.ts` 中的版本。
export const buildToolResultFallback = reflectorBuildToolResultFallback;

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function safeSseSend(res: Response, event: string, data: unknown) {
  try {
    sseSend(res, event, data);
  } catch (err) {
    console.warn(`[stream] failed to send ${event} SSE`, err);
  }
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
    skipNoToolListGuard = false,
    hasPageContextEvidence = false,
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
  const collectedBlocks: MessageBlock[] = [];
  const collectedCharts: unknown[] = [];

  const aiTools: Record<string, Tool<any, any>> = {};
  for (const t of tools) {
    aiTools[t.name] = defineTool<any, string>({
      description: t.description,
      inputSchema: jsonSchema<any>(t.inputSchema ?? { type: "object" }),
      execute: async (args: any) => {
        try {
          const raw = await t.execute(args ?? {});

          // 拦截结构化展示字段：通过 SSE 发给前端，不进入 LLM 上下文
          let resultForLLM = raw;
          if (typeof raw === "string") {
            const { blocks, chart, resultForLLM: withoutArtifacts } = extractStructuredToolArtifacts(raw);
            if (blocks.length > 0) {
              for (const block of blocks) {
                const normalizedBlock = {
                  ...block,
                  sourceTool: block.sourceTool ?? t.name,
                };
                collectedBlocks.push(normalizedBlock);
                safeSseSend(res, "message_block", {
                  ...normalizedBlock,
                });
              }
            }
            if (chart && typeof chart === "object") {
              const chartPayload = {
                toolCallId: t.name + "_" + Date.now(),
                toolName: t.name,
                ...(chart as Record<string, unknown>),
              };
              collectedCharts.push(chartPayload);
              safeSseSend(res, "chart_data", chartPayload);
            }

            resultForLLM = String(withoutArtifacts);
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

  // ── 流式工具元数据注释过滤器 ────────────────────────────────────────────────
  // LLM 有时会把历史消息里注入的 <!--tool_history:...--> 等系统注释原样输出。
  // 这里用状态机在 text-delta 层面把它过滤掉，不让它到达前端。
  let commentBuf = "";     // 正在缓冲中的潜在注释
  let inComment = false;   // 是否处于 <!-- 内部
  let followupBuf = "";    // 正在缓冲中的 FOLLOWUPS 隐藏协议
  let inFollowups = false;

  function flushTextDelta(text: string) {
    if (!text) return;
    fullText += text;
    sseSend(res, "text_delta", { content: text });
  }

  function appendHiddenText(text: string) {
    if (!text) return;
    fullText += text;
  }

  function processVisibleDelta(text: string) {
    const prefixes = ["__FOLLOWUPS__", "FOLLOWUPS"];

    for (const ch of text) {
      if (inFollowups) {
        followupBuf += ch;
        const match = followupBuf.match(/(?:__)?FOLLOWUPS(?:__)?\s*\[[\s\S]*?\]\s*(?:__)?END(?:__)?/i);
        if (match) {
          appendHiddenText(match[0]);
          const rest = followupBuf.slice((match.index ?? 0) + match[0].length);
          followupBuf = "";
          inFollowups = false;
          if (rest) processVisibleDelta(rest);
        } else if (followupBuf.length > 4000) {
          // 异常情况下不是合法隐藏协议，避免永久吞文本。
          flushTextDelta(followupBuf);
          followupBuf = "";
          inFollowups = false;
        }
        continue;
      }

      followupBuf += ch;
      let upper = followupBuf.toUpperCase();
      while (followupBuf && !prefixes.some((p) => p.startsWith(upper))) {
        flushTextDelta(followupBuf[0]);
        followupBuf = followupBuf.slice(1);
        upper = followupBuf.toUpperCase();
      }
      if (prefixes.includes(upper)) {
        inFollowups = true;
      }
    }
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
          // 非注释起始，把缓冲区交给隐藏协议过滤器再输出
          processVisibleDelta(commentBuf);
          commentBuf = "";
        }
      } else {
        // 在 <!-- 内部，等待 -->
        commentBuf += ch;
        if (commentBuf.endsWith("-->")) {
          // 判断是否是工具元数据注释
          if (/<!--[\s\S]*?tool_(history|call|result):[\s\S]*?-->/i.test(commentBuf)) {
            // 丢弃，同时跳过紧跟的 \n
            commentBuf = "";
            inComment = false;
            // 如果下一个字符是换行也一起吞掉
            if (i + 1 < chunk.length && chunk[i + 1] === "\n") i++;
          } else {
            // 非工具元数据注释，原样输出
            processVisibleDelta(commentBuf);
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
            status: toolSuccess ? "done" : "error",
          });
          break;
        }
        case "error":
          errored = true;
          sseSend(res, "error", { message: String(part.error) });
          break;
      }
    }

    // 流结束后把过滤器缓冲区剩余内容 flush（非工具元数据的残留注释原样输出）
    if (commentBuf && !(/<!--[\s\S]*?tool_(history|call|result):/i.test(commentBuf))) {
      processVisibleDelta(commentBuf);
    }
    if (followupBuf) {
      if (inFollowups) {
        appendHiddenText(followupBuf);
      } else {
        flushTextDelta(followupBuf);
      }
      followupBuf = "";
      inFollowups = false;
    }

    // 检测模型是否把工具调用以文本形式输出（而非真正调用）
    // 典型特征：输出 <tool_code>...</tool_code> 或 ```json {"name": "tool"...} ``` 
    const FAKE_TOOL_CALL_PATTERNS = [
      /<tool_code>/i,
      /```\s*json\s*\{[\s\S]*?"name"\s*:/,
      /<tool_use>/i,
      /<function_calls>/i,
      /<!--[\s\S]*?tool_(call|result):[\s\S]*?-->/i,
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

    let noToolGuardHandled = false;

    if (recordedCalls.length === 0 && !hasFakeToolCall && shouldRequireToolCall(userMessage)) {
      noToolGuardHandled = true;
      console.warn("[stream] required tool-call intent detected but no tools were called — starting repair round");
      sseSend(res, "text_replace", { content: "⏳ 这个问题需要查询系统实时数据，正在重新调用工具获取结果，请稍候…" });

      const repair = await runRepairRound({
        llm,
        systemPrompt,
        messages,
        aiTools,
      });

      if (repair && repair.toolCount > 0) {
        console.log(`[stream] required-tool repair succeeded: ${repair.toolCount} tool calls, textLen=${repair.text.length}`);
        for (const step of repair.steps) {
          for (const call of step.toolCalls) {
            sseSend(res, "tool_start", {
              id: call.toolCallId,
              name: call.toolName,
              args: call.input ?? {},
            });
          }
          for (const tr of step.toolResults) {
            sseSend(res, "tool_result", {
              id: tr.toolCallId,
              name: tr.toolName,
              result: tr.output ?? "",
              duration: 0,
              status: "done",
            });
          }
        }
        sseSend(res, "text_replace", { content: repair.text });
        fullText = repair.text;
      } else {
        const replacement =
          `⚠️ 这个问题需要查询系统实时数据，但本轮模型没有执行任何工具调用。\n\n` +
          `为避免输出推断或历史缓存内容，我已阻止本次回答。请重新发送问题，或换用支持 function calling 的模型后重试。`;
        sseSend(res, "text_replace", { content: replacement });
        fullText = replacement;
      }
    }

    // ── 幻觉列表探测 + 自动纠偏 ─────────────────────────────────────────────
    // 当本轮没有任何工具调用但输出大量列表项时，判定为从历史/记忆中复读数据。
    // 先尝试自动纠偏（runRepairRound）：用 toolChoice:required 重跑一次，
    // 若纠偏成功则展示真实结果；若失败则降级为原有警告提示。
    // 用 text_replace 事件通知前端替换已显示内容，用户看不到幻觉数据。
    if (!noToolGuardHandled && !skipNoToolListGuard && recordedCalls.length === 0 && !hasFakeToolCall) {
      const listItemCount = (fullText.match(/^\s*[-•*◆▸◇]\s+.+|^\s*\d+[.)、]\s+.+/gm) || []).length;
      if (listItemCount > 8) {
        console.warn(`[stream] hallucination detected: ${listItemCount} list items, no tool calls — starting repair round`);

        // 先告诉用户正在重新查询，清除前端幻觉内容
        sseSend(res, "text_replace", { content: "⏳ 检测到回复疑似来自缓存数据，正在重新向系统查询，请稍候…" });

        const repair = await runRepairRound({
          llm,
          systemPrompt,
          messages,
          aiTools,
        });

        if (repair && repair.toolCount > 0) {
          // 纠偏成功：补发工具调用 SSE 事件（retroactive），然后展示真实结果
          console.log(`[stream] repair succeeded: ${repair.toolCount} tool calls, textLen=${repair.text.length}`);
          for (const step of repair.steps) {
            for (const call of step.toolCalls) {
              sseSend(res, "tool_start", {
                id: call.toolCallId,
                name: call.toolName,
                args: call.input ?? {},
              });
            }
            for (const tr of step.toolResults) {
              sseSend(res, "tool_result", {
                id: tr.toolCallId,
                name: tr.toolName,
                result: tr.output ?? "",
                duration: 0,
                status: "done",
              });
            }
          }
          sseSend(res, "text_replace", { content: repair.text });
          fullText = repair.text;
        } else {
          // 纠偏失败：降级到原有警告提示
          console.warn(`[stream] repair round failed or no tools called, showing fallback warning`);
          const replacement =
            `⚠️ 检测到本次回复包含大量列表内容，但本轮并未执行任何工具调用。\n\n` +
            `这意味着数据来自历史记录或模型推断，**不是真实查询结果**，已阻止显示以避免误导。\n\n` +
            `请告诉我你想查什么，我会立即重新调用工具获取最新数据。`;
          sseSend(res, "text_replace", { content: replacement });
          fullText = replacement;
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!fullText.trim() && !errored) {
      let fallback: string;
      if (recordedCalls.length > 0) {
        fallback = buildToolResultFallback(recordedCalls);
      } else {
        // 模型返回空响应（finishReason=other），常见原因是上下文过长、模型服务返回空流，
        // 只有在出现 fake tool-call 文本时才应提示“不支持 function calling”。
        fallback = `⚠️ 模型未返回任何内容。\n\n可能原因：上下文过长被截断、模型服务返回空流，或当前请求被模型侧安全/格式策略中止。请缩小问题范围后重试。`;
        console.warn(`[stream] empty response from model=${model}, provider=${provider}`);
      }
      fullText = fallback;
      sseSend(res, "text_delta", { content: fallback });
    }

    const withoutHistoryArtifacts = sanitizeVisibleHistoryArtifacts(fullText);
    if (withoutHistoryArtifacts !== fullText) {
      sseSend(res, "text_replace", { content: withoutHistoryArtifacts });
      fullText = withoutHistoryArtifacts;
    }

    const guardedText = sanitizeEmptyAnalysisSpeculation({
      text: fullText,
      toolCalls: recordedCalls,
    });
    if (guardedText !== fullText) {
      console.warn("[stream] replaced unverified empty-analysis speculation");
      sseSend(res, "text_replace", { content: guardedText });
      fullText = guardedText;
    }
  } catch (e) {
    errored = true;
    sseSend(res, "error", {
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const { clean, followUps } = extractFollowUps(fullText);
  if (clean !== fullText) {
    sseSend(res, "text_replace", { content: clean });
    fullText = clean;
  }

  if (clean || recordedCalls.length > 0) {
    // ── 历史消息截断：防止大量工具数据存入 history 被 LLM 复读 ──────────────
    // 当本轮有工具调用且回复内容很长时，截取前 400 字符作为摘要存入历史，
    // 让 LLM 知道"发生了什么"但拿不到完整数据，从而强制其下轮重新调用工具。
    const MAX_HISTORY_CONTENT = 400;
    let contentForHistory = clean;
    if (recordedCalls.length > 0 && clean.length > MAX_HISTORY_CONTENT) {
      contentForHistory = clean.slice(0, MAX_HISTORY_CONTENT) +
        `\n\n<!--history_truncated chars=${clean.length} visible=false-->`;
    }
    // ─────────────────────────────────────────────────────────────────────────
    await store.addMessage(sessionId, {
      role: "assistant",
      content: contentForHistory,
      toolCalls: recordedCalls.length > 0 ? recordedCalls : null,
      blocks: collectedBlocks.length > 0 ? collectedBlocks : null,
      charts: collectedCharts.length > 0 ? collectedCharts : null,
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
