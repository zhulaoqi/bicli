import type { RouteDecision, RouteName } from "./agent-state.js";
import { RouterCache } from "./router-cache.js";

export interface RouteInput {
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** 调用方在前端注入了"当前页面 evidence"时为 true，可以提升 realtime_query 命中 */
  pageContextEvidence: boolean;
}

/**
 * 关键词组定义（中文为主，混合英文以兼容用户混打）。
 * 注意：每个组的命中权重不一样，详见 `routeUserMessage`。
 */
const knowledgeMarkers = [
  /是什么|什么意思|什么是/,
  /概念|原理|区别|对比|差异/,
  /怎么配置|如何配置|怎么使用|如何使用|怎么用/,
  /流程|步骤|教程|指引|指南/,
  /最佳实践|规范|建议/,
  /说明|文档|解释一下|讲解一下/,
  /接入|对接/,
];

/**
 * 强知识标记：命中后 knowledge 直接得 +6 分，使其压过 single write/diagnosis 关键词。
 * 设计意图：用户问"启动和立即执行的区别"虽然包含"启动"动词，但因有"区别"明显是知识问答。
 */
const strongKnowledgeMarkers = [
  /区别|对比|差异/,
  /是什么|什么意思|什么是/,
  /最佳实践|接入(.{0,8})流程/,
  /(原理|概念).{0,8}(是|呢|吗)?/,
];

const writeMarkers = [
  /创建|新建|新增|添加|加一个|加个/,
  /修改|更新|改成|改为|改一下|更名|重命名/,
  /删除|移除|清除|清掉|废弃/,
  /启动|停止|启用|禁用|归档|恢复|取消/,
  /分配|授予|授权|绑定|解绑/,
  /复制|克隆/,
  /发送|推送(?!.*报表)/,
];

const diagnosisMarkers = [
  /为什么|为何|原因|怎么回事/,
  /没数据|没有数据|为空|0条|0\s*条|空了/,
  /异常|出错|失败|报错|错误/,
  /不显示|不出来|看不到|加载不出/,
];

const visualExplainMarkers = [
  /画(个|一个|一下|个图)?/,
  /流程图|时序图|状态机|架构图|思维导图/,
  /用图|画出来|示意图/,
];

const concreteDataMarkers = [
  /\b(id|ID)\s*[=:：]?\s*\d+\b/,
  /\d{3,}/,
  /当前页面|当前图|这个图|这个看板|这个分析|这个任务|该产品|该项目|这个事件|这个用户|这个角色/,
  /结果|数量|多少|列表|明细/,
  /\bMY_[A-Z0-9_]+\b/,
];

const realtimeActionMarkers = [
  /查一下|查询|查看|看一下|帮我看|看下|列出|展示|显示|有哪些|有多少|统计/,
  /执行|跑一下|运行|触发/,
  /下载|导出|分享|生成.*链接/,
];

/** 先查列表、暂不执行写入（如「有哪些角色可以分配」） */
const readOnlyListMarkers = [
  /有哪些.{0,24}角色/,
  /角色.{0,16}(有哪些|列表|清单)/,
  /列出.{0,16}角色/,
  /(可以|能).{0,8}分配.{0,12}角色|角色.{0,12}(可以|能)分配/,
  /有哪些.{0,12}可以分配/,
];

/** 业务领域关键词（与 selector domain 对齐） */
const DOMAIN_KEYWORDS: Record<string, RegExp[]> = {
  schedule: [/定时|调度|计划任务|schedule|cron/i, /推送报表|定时发送|定时推送/],
  dashboard: [/看板|仪表盘|dashboard/i],
  chart: [/图表|chart/i, /柱状图|饼图|折线图|曲线图/],
  analysis: [/分析|漏斗|留存|事件分析|funnel|retention/i],
  event: [/事件|event/i, /埋点/],
  table: [/数据表|表结构|table|schema|字段/i],
  project: [/项目|product|应用/i, /我的产品/],
  user: [/用户|账号|账户/, /\buser\b/i],
  role: [/角色|权限/, /\brole\b/i],
  view: [/数据视图|\bview\b/i],
  knowledge: [],
};

interface MatchScore {
  knowledge: number;
  realtime_query: number;
  write_action: number;
  diagnosis: number;
  visual_explain: number;
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    if (p.test(text)) n++;
  }
  return n;
}

function detectDomains(text: string): string[] {
  const result: string[] = [];
  for (const [domain, patterns] of Object.entries(DOMAIN_KEYWORDS)) {
    if (!patterns.length) continue;
    if (patterns.some((p) => p.test(text))) result.push(domain);
  }
  return result;
}

function detectIdLikeReference(text: string): boolean {
  return (
    /\b(id|ID)\s*[=:：]?\s*[\w-]+/.test(text) ||
    /\bMY_[A-Z0-9_]+\b/.test(text) ||
    /\b[a-z0-9]{6,}-[a-z0-9]+/i.test(text)
  );
}

export function routeUserMessage(input: RouteInput): RouteDecision {
  const text = input.userMessage.trim();
  if (!text) {
    return {
      route: "realtime_query",
      confidence: 0,
      domains: [],
      needsKnowledge: false,
      needsUserConfirm: false,
      reasoning: "empty user message",
    };
  }

  const userHistoryText = input.history
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  // “确认执行/继续/是”属于上下文续写语义，本身信息量极低；
  // 必须从用户历史中继承“写操作 + 业务域”，避免被污染的 assistant 文本带偏。
  if (isShortConfirmationMessage(text)) {
    const historyWriteHits = countMatches(userHistoryText, writeMarkers);
    const historyDomains = detectDomains(userHistoryText);
    if (historyWriteHits > 0 || historyDomains.length > 0) {
      return {
        route: "write_action",
        confidence: 0.85,
        domains: historyDomains,
        needsKnowledge: false,
        needsUserConfirm: true,
        reasoning: `rule: short_confirm_with_history_write domains=${historyDomains.join(",") || "-"}`,
      };
    }
  }

  const score: MatchScore = {
    knowledge: 0,
    realtime_query: 0,
    write_action: 0,
    diagnosis: 0,
    visual_explain: 0,
  };

  // 基础打分
  score.knowledge += countMatches(text, knowledgeMarkers) * 2;
  // 强知识标记一旦命中即视为决定性知识问答信号
  const strongKnowledgeHit = countMatches(text, strongKnowledgeMarkers);
  score.knowledge += strongKnowledgeHit * 6;
  score.write_action += countMatches(text, writeMarkers) * 3;
  score.diagnosis += countMatches(text, diagnosisMarkers) * 3;
  score.visual_explain += countMatches(text, visualExplainMarkers) * 3;
  score.realtime_query += countMatches(text, realtimeActionMarkers) * 2;
  score.realtime_query += countMatches(text, concreteDataMarkers);

  // 「有哪些角色可以分配」：查询可选项，不是立即执行分配写操作
  const readOnlyListHit = countMatches(text, readOnlyListMarkers);
  if (readOnlyListHit > 0) {
    score.realtime_query += 5;
    score.write_action = Math.max(0, score.write_action - 2);
  }

  // 历史消息中出现 ID 或资源名 → 视为存在实时查询线索
  // 历史证据只看 user 消息，避免 assistant 幻觉文本污染下一轮路由。
  const historyText = userHistoryText;
  const hasContextRef = detectIdLikeReference(historyText);
  if (hasContextRef) score.realtime_query += 1;

  // page context evidence 进一步提升 realtime
  if (input.pageContextEvidence) score.realtime_query += 2;

  // 写操作含具体 ID 时同时带实时查询语义（dryRun 需要先查）
  if (score.write_action > 0 && (detectIdLikeReference(text) || /这个|该/.test(text))) {
    score.realtime_query += 1;
  }

  // visual_explain 通常需要知识
  if (score.visual_explain > 0) score.knowledge += 1;

  const domains = detectDomains(text);

  // 顶选：选最大分；若全部为 0，回退到 realtime_query 但 confidence=0
  const entries = Object.entries(score) as Array<[RouteName, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [topRoute, topScore] = entries[0];
  const [, secondScore] = entries[1] ?? ["realtime_query", 0];

  // 决策：
  // 0. 强知识标记直接走 knowledge（除非显式 visual 指令，否则压过写/诊断/实时）
  // 1. 视觉解释优先于其他
  // 2. 写优先：write_action 命中后只要有写动词，几乎必走写
  // 3. diagnosis 优先于 realtime（即使 realtime 分数高一点，"为什么没数据" 必走诊断）
  // 4. knowledge 与 realtime 冲突时：若文本里有 concrete data 引用 → realtime
  let route: RouteName;
  if (score.visual_explain >= 3) {
    route = "visual_explain";
  } else if (strongKnowledgeHit > 0 && score.knowledge > score.write_action) {
    route = "knowledge";
  } else if (score.write_action >= 3) {
    route = "write_action";
  } else if (score.diagnosis >= 3) {
    route = "diagnosis";
  } else if (score.knowledge >= 2 && score.realtime_query <= score.knowledge) {
    route = "knowledge";
  } else if (topScore === 0) {
    route = "realtime_query";
  } else {
    route = topRoute;
  }

  // 置信度：top-second 差距越大越自信
  const totalScore = entries.reduce((sum, [, v]) => sum + v, 0);
  let confidence = totalScore === 0 ? 0 : Math.min(1, (topScore - secondScore + topScore) / (totalScore + 2));
  if (route === "realtime_query" && topScore === 0 && !input.pageContextEvidence && !hasContextRef) {
    confidence = 0;
  }
  if (route === "knowledge" && score.knowledge >= 2) {
    confidence = Math.max(confidence, 0.6);
  }

  // domains 兜底：若文本没命中任何 domain，但历史含 schedule/analysis 等关键词，也带上
  let resolvedDomains = domains;
  if (resolvedDomains.length === 0) {
    resolvedDomains = detectDomains(historyText);
  }

  // 即便走 knowledge，若上下文里命中 schedule/dashboard 等领域，仍把 domains 带上方便 selector 决策
  if (route === "knowledge" && resolvedDomains.length === 0) {
    resolvedDomains = detectDomains(historyText);
  }

  return {
    route,
    confidence: Number(confidence.toFixed(3)),
    domains: resolvedDomains,
    needsKnowledge: route === "knowledge" || route === "visual_explain",
    needsUserConfirm: route === "write_action",
    reasoning: `rule: ${entries
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}; chose=${route}; confidence=${confidence.toFixed(3)}`,
  };
}

export interface RouterLLMInvoker {
  (prompt: string): Promise<unknown>;
}

export interface RunRouterOptions {
  llm?: RouterLLMInvoker;
  /** 显式打开 LLM 校正；为 false 时即使 confidence 低也不调用 LLM */
  allowOverride?: boolean;
  /** LLM 超时，默认 2000ms 或读取 AGENT_ROUTER_TIMEOUT_MS */
  timeoutMs?: number;
  /** 可选路由缓存，命中后直接返回，不再调用规则/LLM */
  cache?: RouterCache;
  /** 与 cache 配合用于生成 key；通常是会话 id */
  sessionId?: number | string;
}

const DEFAULT_TIMEOUT_MS = 2000;
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export async function runRouter(
  input: RouteInput,
  options: RunRouterOptions = {},
): Promise<RouteDecision> {
  const cacheEnabled = !isShortConfirmationMessage(input.userMessage);
  const contextFingerprint = buildContextFingerprint(input);
  const cacheKey =
    cacheEnabled && options.cache && options.sessionId !== undefined
      ? RouterCache.makeKey({
        sessionId: options.sessionId,
        userMessage: input.userMessage,
        contextFingerprint,
      })
      : null;
  if (cacheEnabled && options.cache && cacheKey) {
    const hit = options.cache.get(cacheKey);
    if (hit) {
      return {
        ...hit,
        reasoning: hit.reasoning.startsWith("cache:")
          ? hit.reasoning
          : `cache: ${hit.reasoning}`,
      };
    }
  }

  const ruleDecision = routeUserMessage(input);

  const finalize = (decision: RouteDecision): RouteDecision => {
    if (cacheEnabled && options.cache && cacheKey) {
      options.cache.set(cacheKey, decision);
    }
    return decision;
  };

  if (process.env.AGENT_ROUTER_DISABLE_LLM === "1") return finalize(ruleDecision);
  if (!options.llm) return finalize(ruleDecision);
  // 必须 allowOverride=true 且规则置信度低才调用 LLM。
  // 高置信度场景（即使 allowOverride=true）不浪费一次模型调用。
  if (!options.allowOverride) return finalize(ruleDecision);
  if (ruleDecision.confidence >= LOW_CONFIDENCE_THRESHOLD) return finalize(ruleDecision);

  const timeoutMs = options.timeoutMs ?? (Number(process.env.AGENT_ROUTER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const prompt = buildLLMPrompt(input, ruleDecision);

  try {
    const raw = await runWithTimeout(options.llm(prompt), timeoutMs);
    const overridden = parseLLMOverride(raw, ruleDecision);
    if (overridden) {
      return finalize(overridden);
    }
    return finalize(ruleDecision);
  } catch (err) {
    console.warn("[intent-router] LLM override failed, falling back to rule decision:", err);
    return finalize(ruleDecision);
  }
}

function buildContextFingerprint(input: RouteInput): string {
  const tail = input.history.slice(-4);
  const historyDigest = tail
    .map((m) => `${m.role}:${compactText(m.content).slice(0, 160)}`)
    .join("||");
  return `page=${input.pageContextEvidence ? 1 : 0}|h=${historyDigest}`;
}

function compactText(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function isShortConfirmationMessage(message: string): boolean {
  const text = compactText(message).toLowerCase();
  if (!text) return false;
  const confirmPatterns = [
    /^(确认执行|确认|执行|继续|是|好的|ok|okay|yes|yep|go)$/i,
    /^请执行$/i,
    /^可以执行$/i,
    /^继续执行$/i,
  ];
  return text.length <= 8 && confirmPatterns.some((p) => p.test(text));
}

function runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`router LLM override timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function parseLLMOverride(raw: unknown, fallback: RouteDecision): RouteDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.route !== "string") return null;
  const validRoutes: RouteName[] = ["knowledge", "realtime_query", "write_action", "diagnosis", "visual_explain"];
  if (!validRoutes.includes(obj.route as RouteName)) return null;

  const route = obj.route as RouteName;
  const confidence = typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : fallback.confidence;
  const domains = Array.isArray(obj.domains) ? obj.domains.filter((d): d is string => typeof d === "string") : fallback.domains;
  const needsKnowledge = typeof obj.needsKnowledge === "boolean" ? obj.needsKnowledge : route === "knowledge" || route === "visual_explain";
  const needsUserConfirm = typeof obj.needsUserConfirm === "boolean" ? obj.needsUserConfirm : route === "write_action";
  const reasoning = typeof obj.reasoning === "string" ? `model: ${obj.reasoning}` : `model override → ${route}`;

  return { route, confidence, domains, needsKnowledge, needsUserConfirm, reasoning };
}

function buildLLMPrompt(input: RouteInput, ruleDecision: RouteDecision): string {
  return [
    "你是 BiCLI Agent 的路由分类器。下面给出用户消息和规则层的初步判定，请输出 JSON。",
    "可选 route：knowledge / realtime_query / write_action / diagnosis / visual_explain。",
    "JSON 字段：route, confidence(0-1), domains[], needsKnowledge, needsUserConfirm, reasoning。",
    "",
    `用户消息：${input.userMessage}`,
    `历史最近 1 条：${input.history.slice(-1)[0]?.content ?? ""}`,
    `规则层结果：${JSON.stringify(ruleDecision)}`,
    "",
    "只返回 JSON，不要解释。",
  ].join("\n");
}

