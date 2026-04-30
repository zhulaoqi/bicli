# Agent Runtime Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BiCLI 的“一次模型调用 + 散落兜底”链路为显式 Agent Runtime Loop（Router → Act → Finalize → Reflect → Render），让知识、实时查询、写操作、诊断和视觉解释类问题各走各的路径，并复用工具结果生成最终答复，避免幻读和空输出。

**Architecture:** 在 `packages/mcp-server/src/chat` 下新增显式状态机：`AgentRunner` 持有 `AgentRunState`，按 route 裁剪 `tool-domain-registry` 输出的工具集合；Act 阶段只跑工具循环；Finalize 阶段在 `toolChoice=none` 下基于工具结果生成最终文本；Reflect 阶段统一规则 + 模型 critique，必要时跑 repair；Render 阶段输出 message blocks/Mermaid hint。Skill 与 system prompt 拆成基础部分 + 路由专用部分。

**Tech Stack:** TypeScript, Node.js 20+, `ai` SDK (`streamText`)、MCP SDK、Vitest、existing `result-block-factory`、SSE、`@bicli/skills` Markdown 定义。

---

对应设计：`docs/superpowers/specs/2026-04-30-agent-runtime-loop-design.md`

## File Structure

Create:

- `packages/mcp-server/src/chat/agent/agent-runner.ts`
- `packages/mcp-server/src/chat/agent/intent-router.ts`
- `packages/mcp-server/src/chat/agent/tool-selector.ts`
- `packages/mcp-server/src/chat/agent/finalizer.ts`
- `packages/mcp-server/src/chat/agent/reflector.ts`
- `packages/mcp-server/src/chat/agent/render-hints.ts`
- `packages/mcp-server/src/chat/agent/agent-state.ts`
- `packages/mcp-server/src/chat/agent/__tests__/intent-router.test.ts`
- `packages/mcp-server/src/chat/agent/__tests__/tool-selector.test.ts`
- `packages/mcp-server/src/chat/agent/__tests__/finalizer.test.ts`
- `packages/mcp-server/src/chat/agent/__tests__/reflector.test.ts`
- `packages/mcp-server/src/chat/agent/__tests__/agent-runner.test.ts`
- `packages/mcp-server/src/tools/knowledge/knowledge-search.ts`
- `packages/mcp-server/src/tools/knowledge/concept-explain.ts`
- `packages/mcp-server/src/tools/knowledge/__tests__/knowledge-search.test.ts`
- `packages/mcp-server/src/tools/knowledge/__tests__/concept-explain.test.ts`
- `packages/skills/definitions/dataeye-knowledge/SKILL.md`
- `packages/skills/definitions/dataeye-knowledge/reference/concepts.md`
- `packages/skills/definitions/dataeye-knowledge/reference/playbooks.md`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/AgentTracePanel.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/__tests__/AgentTracePanel.test.tsx`

Modify:

- `packages/mcp-server/src/chat/stream.ts`
- `packages/mcp-server/src/chat/system-prompt.ts`
- `packages/mcp-server/src/chat/response-repair.ts`
- `packages/mcp-server/src/chat/message-blocks.ts`
- `packages/mcp-server/src/chat/__tests__/stream-guard.test.ts`
- `packages/mcp-server/src/tools/tool-domain-registry.ts`
- `packages/mcp-server/src/tools/__tests__/tool-domain-registry.test.ts`
- `packages/mcp-server/src/tools/__tests__/skill-tool-contract.test.ts`
- `packages/skills/definitions/<existing skills>/SKILL.md`（按 route 增加 `routeHints` 提示，必要时收敛 `requiredTools`）
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`

## P0 Phase

### Chunk 1: Agent State 与 Tool Routing 元数据

#### Task 1: 定义 `AgentRunState` 与 route 类型

**Files:**

- Create: `packages/mcp-server/src/chat/agent/agent-state.ts`
- Test: 借助下游 chunk 测试覆盖

- [ ] **Step 1: Define `RouteName` and `RouteDecision` types**

```ts
export type RouteName =
  | "knowledge"
  | "realtime_query"
  | "write_action"
  | "diagnosis"
  | "visual_explain";

export interface RouteDecision {
  route: RouteName;
  confidence: number;
  domains: string[];
  needsKnowledge: boolean;
  needsUserConfirm: boolean;
  reasoning: string;
}
```

- [ ] **Step 2: Define `AgentRunState`**

字段需覆盖 `sessionId`、`userMessage`、`pageContextEvidence`、`route`、`allowedTools`、`messages`、`toolCalls`、`collectedBlocks`、`collectedCharts`、`actText`、`finalText`、`reflectVerdict`、`renderHints`、`telemetry`。

- [ ] **Step 3: Define `RenderHints`**

```ts
export interface RenderHints {
  preferMermaid?: boolean;
  preferSteps?: boolean;
  highlightConfirmation?: boolean;
  suppressMarkdownTable?: boolean;
}
```

- [ ] **Step 4: 不实现逻辑，纯类型与默认值**

只导出类型 + `createInitialAgentRunState`。

#### Task 2: 给 ToolDef 增加 `routeHints`

**Files:**

- Modify: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Modify: `packages/mcp-server/src/tools/__tests__/tool-domain-registry.test.ts`

- [ ] **Step 1: Add failing test that asserts route hints**

```ts
it("exposes route hints for routing", () => {
  const tools = getEnabledTools({ DATART_API_URL: "https://x" });
  const dashboardExec = tools.find((t) => t.name === "dataeye_dashboard_execute");
  expect(dashboardExec?.routeHints).toEqual(expect.arrayContaining(["realtime_query", "diagnosis"]));
});
```

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/tool-domain-registry.test.ts
```

Expected: fail because `routeHints` not implemented.

- [ ] **Step 2: Extend `ToolDef`**

```ts
export interface ToolDef {
  // ...existing fields
  routeHints?: RouteName[];
  knowledgeOnly?: boolean;
}
```

- [ ] **Step 3: Annotate每个已注册工具**

按设计 §7.2 表为每个工具补 `routeHints`。建议范例：

- `dataeye_schedule_manage`: `["realtime_query", "write_action"]`
- `dataeye_schedule_detail` / `dataeye_schedule_logs`: `["realtime_query", "diagnosis"]`
- `dataeye_dashboard_execute`: `["realtime_query", "diagnosis"]`
- `data_query` / `config_get`: `["realtime_query"]`，禁止出现在 knowledge route。
- `audit_query`: `["diagnosis"]`。

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/tool-domain-registry.test.ts
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/tool-domain-registry.ts \
        packages/mcp-server/src/tools/__tests__/tool-domain-registry.test.ts \
        packages/mcp-server/src/chat/agent/agent-state.ts
git commit -m "feat(mcp): add route hints and agent run state types"
```

### Chunk 2: Intent Router

#### Task 3: 规则层 router

**Files:**

- Create: `packages/mcp-server/src/chat/agent/intent-router.ts`
- Create: `packages/mcp-server/src/chat/agent/__tests__/intent-router.test.ts`

- [ ] **Step 1: Write failing tests**

覆盖：

- 知识/流程：`帮我看下接入 SDK 的流程`、`定时任务启动和立即执行的区别`、`这里最佳实践到底是什么` → `route="knowledge"`，`needsKnowledge=true`。
- 实时查询：`查一下定时任务列表`、`MY_CGT210_SceneryTile 的事件`、`当前页面数据怎么样` → `route="realtime_query"`，`domains` 至少包含一个领域。
- 写操作：`帮我创建一个用户 analyst@example.com` → `route="write_action"`，`needsUserConfirm=true`。
- 诊断：`为什么 2661 这个事件分析没有数据` → `route="diagnosis"`。
- 视觉解释：`画个状态机说明一下定时任务生命周期` → `route="visual_explain"`，`renderHints.preferMermaid=true`。
- 模糊场景：纯一句“分析一下” → `confidence < 0.5`，由调用方走兜底。

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/agent/__tests__/intent-router.test.ts
```

Expected: fail because module missing.

- [ ] **Step 2: Implement rule-based router**

```ts
export function routeUserMessage(input: RouteInput): RouteDecision;
```

- 内部使用关键词集合，分别为 `knowledgeMarkers`、`writeMarkers`、`diagnosisMarkers`、`visualExplainMarkers`、`concreteDataMarkers`。
- 解析 page context、history 中是否有 ID/资源引用以提高 `realtime_query` 命中。
- `confidence` 用命中权重 + 标记数量计算。

- [ ] **Step 3: Add fallback to `realtime_query` with low confidence**

确保所有路径都返回合法 `RouteDecision`。

- [ ] **Step 4: Run tests**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): add rule-based intent router"
```

#### Task 4: 模型校正层（轻量 LLM 复核）

**Files:**

- Modify: `packages/mcp-server/src/chat/agent/intent-router.ts`
- Modify: `packages/mcp-server/src/chat/agent/__tests__/intent-router.test.ts`

- [ ] **Step 1: Add failing test for ambiguous reroute**

输入 “帮我看下定时任务的发送逻辑”：规则可能给 `knowledge`，但用户上文刚问过 `scheduleId=xxx`，期望 router 回退到 `realtime_query` 或保留 `knowledge` 但 `domains` 包含 `schedule`。

测试通过 `runRouterWithModelOverride` 包装函数 + mock `LanguageModel.invoke`。

- [ ] **Step 2: Implement optional LLM override**

```ts
export async function runRouter(
  input: RouteInput,
  options?: { llm?: LanguageModel; allowOverride?: boolean }
): Promise<RouteDecision>;
```

`confidence < 0.6` 或显式 `allowOverride=true` 时调用 LLM，要求 JSON 输出，2 秒超时则降级回规则结果。

- [ ] **Step 3: Add env switches**

`AGENT_ROUTER_DISABLE_LLM=1` 时关闭模型复核；`AGENT_ROUTER_TIMEOUT_MS` 控制超时。

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/agent/__tests__/intent-router.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): add optional LLM override for intent router"
```

### Chunk 3: Tool Selector

#### Task 5: 按 route 裁剪工具集合

**Files:**

- Create: `packages/mcp-server/src/chat/agent/tool-selector.ts`
- Create: `packages/mcp-server/src/chat/agent/__tests__/tool-selector.test.ts`

- [ ] **Step 1: Write failing tests**

- 给 `route="knowledge"`：返回的工具不包含任何带 `data_query`、`config_get`、`*_create`、`*_update`、`*_delete`，但包含 `dataeye_knowledge_search`、`dataeye_concept_explain`（先 stub）。
- 给 `route="realtime_query"` + `domains=["schedule"]`：返回 `dataeye_schedule_list`、`dataeye_schedule_detail`、`dataeye_schedule_logs`，不含 `dataeye_schedule_delete`。
- 给 `route="write_action"` + `domains=["schedule"]`：返回 `dataeye_schedule_manage`，并把删除/归档工具默认标记为 `dryRunOnly`。
- 给 `route="diagnosis"`：包含日志/详情/状态工具，但禁用所有写工具。
- 给 `route="visual_explain"`：默认只给知识工具与极少量列表工具。

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/agent/__tests__/tool-selector.test.ts
```

Expected: fail because module missing.

- [ ] **Step 2: Implement selection rules**

```ts
export interface ToolSelection {
  allowed: ToolDef[];
  forbidden: string[];
  reasoning: string;
}

export function selectToolsForRoute(
  registry: ToolDef[],
  decision: RouteDecision
): ToolSelection;
```

规则：

- 用 `routeHints` 做基础过滤；缺失 hints 的工具默认 `realtime_query` 与 `diagnosis` 可见。
- `route="knowledge"`：保留 `knowledgeOnly=true` 工具 + 显式名单。
- `route="write_action"`：保留 business-tier 工具，并强制标记 atomic 写工具为不可选。
- 受 `domains` 影响时优先保留 `name` 包含 `domains` 中关键字的工具。

- [ ] **Step 3: Run tests**

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): add per-route tool selector"
```

### Chunk 4: Act/Finalize 双阶段

#### Task 6: Act 阶段封装

**Files:**

- Modify: `packages/mcp-server/src/chat/stream.ts`
- Create: `packages/mcp-server/src/chat/agent/agent-runner.ts`
- Create: `packages/mcp-server/src/chat/agent/__tests__/agent-runner.test.ts`

- [ ] **Step 1: Failing test — `runAct` invokes streamText with allowed tools only**

mock `streamText`，断言传入的 `tools` 只包含 selector 输出的工具名。

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/agent/__tests__/agent-runner.test.ts
```

Expected: fail.

- [ ] **Step 2: Implement `runAct(state, deps)`**

- 基于 `state.allowedTools` 构造 `aiTools`。
- 复用 `extractStructuredToolArtifacts`、SSE `tool_start`/`tool_result`/`message_block`/`chart_data` 已有逻辑。
- 收集 `state.actText`、`state.toolCalls`、`state.collectedBlocks`。
- 不再在 act 阶段触发现有 `runRepairRound`、`shouldRequireToolCall`、`buildToolResultFallback` 等检查，那些逻辑挪到 reflect。

- [ ] **Step 3: 控制 act 文本输出**

Act 系统提示词追加：“只调用工具，不要在工具循环中输出最终回答；最终回答会在下一轮生成。”

- [ ] **Step 4: Run focused test**

Expected: pass.

#### Task 7: Finalize 阶段

**Files:**

- Create: `packages/mcp-server/src/chat/agent/finalizer.ts`
- Create: `packages/mcp-server/src/chat/agent/__tests__/finalizer.test.ts`

- [ ] **Step 1: Failing test — finalize 仅基于工具结果**

输入 state：`actText=""`、`toolCalls` 包含一个 schedule detail 成功结果。期望 finalize 调用 `streamText`：

- `tools` 不传或 `toolChoice="none"`。
- `messages` 末尾包含工具结果摘要（不能直接传完整 raw）。
- 输出文本包含任务名称、cron。

- [ ] **Step 2: Implement finalize**

```ts
export async function runFinalize(state: AgentRunState, deps: AgentDeps): Promise<void>;
```

- 用 `summarizeToolResultsForPrompt(state.toolCalls)` 控制总长度（≤ 4000 字符）。
- 系统提示词：基于 route 输出短指令（例如 visual_explain 强调 Mermaid，diagnosis 强调“以工具结果为唯一证据”）。
- finalize 仍然走 SSE `text_delta`，与现有前端无缝兼容。

- [ ] **Step 3: 处理 finalize 空输出**

如果 finalize 返回空字符串，调用 deterministic fallback `buildToolResultFallback`（从 `stream.ts` 迁过来的版本，放进 `reflector.ts`）。

- [ ] **Step 4: Run tests**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): add act/finalize phases with restricted tool surface"
```

### Chunk 5: Reflect 规则层

#### Task 8: 把现有 stream guard 搬进 reflector

**Files:**

- Create: `packages/mcp-server/src/chat/agent/reflector.ts`
- Modify: `packages/mcp-server/src/chat/__tests__/stream-guard.test.ts`
- Modify: `packages/mcp-server/src/chat/stream.ts`

- [ ] **Step 1: Failing test — reflector composes existing guards**

新增 `runReflect(state, deps)` 测试：

- 当 `state.toolCalls` 为空但 `route` 应当调用工具：`reflectVerdict="needs_repair"`，`reason="missing_required_tool"`。
- 当 finalize text 含 `<tool_code>`：返回 `verdict="fallback"`，并替换文本。
- 当 analysis 工具返回 empty 且 finalize 推断了根因：触发 `sanitizeEmptyAnalysisSpeculation`。
- 当 finalize 含工具元数据残留（`<!--tool_history:...-->`）：清洗。

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/__tests__/stream-guard.test.ts
```

Expected: fail because new APIs missing.

- [ ] **Step 2: Move `sanitizeEmptyAnalysisSpeculation`、`sanitizeVisibleHistoryArtifacts`、`buildToolResultFallback` 到 `reflector.ts`**

保留原导出兼容旧测试，但内部改成 thin re-export。

- [ ] **Step 3: Implement `runReflect`**

```ts
export interface ReflectResult {
  verdict: "ok" | "needs_repair" | "fallback";
  reasons: string[];
  text?: string;
}

export function runReflect(state: AgentRunState): ReflectResult;
```

按设计 §7.5 规则层执行。

- [ ] **Step 4: Run tests**

Expected: pass。

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): unify stream guards into reflector rule layer"
```

### Chunk 6: Repair 阶段统一调度

#### Task 9: 重命名并复用 `runRepairRound`

**Files:**

- Modify: `packages/mcp-server/src/chat/response-repair.ts`
- Modify: `packages/mcp-server/src/chat/agent/agent-runner.ts`
- Modify: `packages/mcp-server/src/chat/agent/__tests__/agent-runner.test.ts`

- [ ] **Step 1: Failing test — reflect.needs_repair 触发一次 repair**

mock `runActRepair` 返回工具调用 + 文本。期望 runner 把 repair 的工具结果合并到 state，再跑一次 finalize，最终 reflect verdict 为 `ok`。

- [ ] **Step 2: Rename `runRepairRound` → `runActRepair`**

参数改为 `AgentRunState`，并允许传入 `force: "tool_required" | "fallback_summarize"`。

- [ ] **Step 3: Implement repair orchestration in runner**

```ts
if (reflect.verdict === "needs_repair" && state.telemetry.repairCount < MAX_REPAIRS) {
  await runActRepair(state, deps);
  await runFinalize(state, deps);
  reflect = runReflect(state);
}
```

`MAX_REPAIRS=1` 默认；可由 `AGENT_MAX_REPAIRS` 调整。

- [ ] **Step 4: Run tests**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): orchestrate repair loop via reflector verdicts"
```

### Chunk 7: Render Hints

#### Task 10: 写回 SSE `_meta` 渲染建议

**Files:**

- Create: `packages/mcp-server/src/chat/agent/render-hints.ts`
- Modify: `packages/mcp-server/src/chat/message-blocks.ts`
- Modify: `packages/mcp-server/src/chat/agent/finalizer.ts`
- Modify: `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`
- Modify: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`

- [ ] **Step 1: Failing test — `computeRenderHints` 在 visual_explain 路由下设置 preferMermaid**

```ts
expect(computeRenderHints({ route: { route: "visual_explain", ... }, toolCalls: [] }))
  .toMatchObject({ preferMermaid: true, suppressMarkdownTable: true });
```

- [ ] **Step 2: Implement `computeRenderHints(state)`**

按设计 §7.6 输出 hint。

- [ ] **Step 3: Pipe hints into SSE**

在 `runFinalize` 完成后追加 `agent_render_hint` 事件或者放进现有 `message_block` 的 `payload.renderHint`。保持向后兼容：旧前端忽略未识别字段。

- [ ] **Step 4: Frontend consumes hint**

- `useChatStream` 把 hint 存入 `state.renderHints`。
- `MessageItem` 在 hint=preferMermaid 时优先把首段 Mermaid 上提；hint=suppressMarkdownTable 时把 Markdown 表替换为 `TableBlock`（如果数据可用）。

- [ ] **Step 5: Run frontend tests**

```bash
pnpm --filter dataeye-frontend test -- Chat/__tests__/useChatStream.test.ts
```

如无对应测试，至少保证 `pnpm --filter dataeye-frontend lint` 通过。

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(agent): emit render hints from finalize phase"
```

### Chunk 8: Stream 主路径切换到 Runner

#### Task 11: 用 `agent-runner` 替换 `handleChatStream` 主流程

**Files:**

- Modify: `packages/mcp-server/src/chat/stream.ts`
- Modify: `packages/mcp-server/src/chat/agent/agent-runner.ts`
- Modify: `packages/mcp-server/src/chat/__tests__/stream-guard.test.ts`

- [ ] **Step 1: Failing integration test**

补一个 stream-level test：构造 `RouteDecision`、`ToolSelection` mock，执行 `handleChatStream`，验证 SSE 事件顺序：`tool_start` → `tool_result` → `text_delta` (finalize) → `agent_trace` → `done`。

- [ ] **Step 2: Wire phases together**

```ts
const state = createInitialAgentRunState(...);
state.route = await runRouter(input, deps);
state.allowedTools = selectToolsForRoute(registry, state.route).allowed;
await runAct(state, deps);
await runFinalize(state, deps);
let verdict = runReflect(state);
if (verdict.verdict === "needs_repair") {
  await runActRepair(state, deps);
  await runFinalize(state, deps);
  verdict = runReflect(state);
}
applyVerdict(state, verdict);
applyRenderHints(state);
emitAgentTrace(state, sse);
```

- [ ] **Step 3: 旧兜底逻辑全部下线**

删除 `handleChatStream` 末尾的旧 fallback 调用（已迁入 reflector）。保留对外导出 `shouldRequireToolCall`、`sanitizeEmptyAnalysisSpeculation` 等以兼容当前测试，标 `@deprecated`。

- [ ] **Step 4: Run all chat tests**

```bash
pnpm --filter @bicli/mcp-server test -- src/chat
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): switch chat stream to agent runtime loop"
```

## P1 Phase

### Chunk 9: 模型 Critique（按 route 触发）

#### Task 12: 增加 `runModelCritique`

**Files:**

- Modify: `packages/mcp-server/src/chat/agent/reflector.ts`
- Modify: `packages/mcp-server/src/chat/agent/__tests__/reflector.test.ts`

- [ ] **Step 1: Failing test**

mock 模型返回 `{ verdict: "needs_repair", reasons: ["未引用工具结果"] }`，验证 reflector 把 verdict 升级。

- [ ] **Step 2: Implement critique**

- 仅在 `route ∈ {diagnosis, write_action}` 默认开启；其余 route 通过环境变量打开。
- 输入：用户问题 + finalize 答复 + 工具结果摘要。
- 输出格式 strict JSON；解析失败回退到 `verdict="ok"`。
- 超时与失败均回退到规则层结果。

- [ ] **Step 3: Cost guard**

`AGENT_DISABLE_CRITIQUE=1` 时跳过；`telemetry` 记录调用次数与耗时。

- [ ] **Step 4: Run tests**

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): add optional model critique in reflect phase"
```

### Chunk 10: 知识工具

#### Task 13: 实现 `dataeye_knowledge_search`

**Files:**

- Create: `packages/mcp-server/src/tools/knowledge/knowledge-search.ts`
- Create: `packages/mcp-server/src/tools/knowledge/__tests__/knowledge-search.test.ts`
- Modify: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Create: `packages/skills/definitions/dataeye-knowledge/SKILL.md`
- Create: `packages/skills/definitions/dataeye-knowledge/reference/concepts.md`
- Create: `packages/skills/definitions/dataeye-knowledge/reference/playbooks.md`

- [ ] **Step 1: Failing test**

测试：

- query=“启动和立即执行的区别” → 命中 `concepts.md` 中相应章节，返回片段，并附 `source` 路径。
- query=“SDK 接入流程” → 命中 `playbooks.md`。
- query=“xx 不存在”：返回空数组 + `success: true`。

- [ ] **Step 2: Implement static index**

读取 `packages/skills/definitions/**/reference/*.md` 与 `docs/**/*.md`，构建标题 + 段落索引；查询用 token 包含 + 同义词映射。索引在进程启动时缓存。

- [ ] **Step 3: Register tool**

`tool-domain-registry`：

```ts
{ domain: "knowledge", tier: "atomic", name: "dataeye_knowledge_search",
  routeHints: ["knowledge", "visual_explain"], knowledgeOnly: true, ... }
```

- [ ] **Step 4: Skill 内容**

`dataeye-knowledge` Skill 描述命中场景、典型问题、首选 `dataeye_knowledge_search`。

- [ ] **Step 5: Update skill-tool contract**

修改 `skill-tool-contract.test.ts`：知识 Skill 的 `requiredTools` 需要被全部注册。

- [ ] **Step 6: Run tests**

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(knowledge): add knowledge_search tool and dataeye-knowledge skill"
```

#### Task 14: 实现 `dataeye_concept_explain`

**Files:**

- Create: `packages/mcp-server/src/tools/knowledge/concept-explain.ts`
- Create: `packages/mcp-server/src/tools/knowledge/__tests__/concept-explain.test.ts`
- Modify: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Modify: `packages/skills/definitions/dataeye-knowledge/reference/concepts.md`

- [ ] **Step 1: Failing test**

输入 topic=“schedule_lifecycle”，期望返回固定结构 `{ concept, scope, keyDifferences[], typicalActions[] }`。

- [ ] **Step 2: Implement concept registry**

YAML/JSON 静态表，初版至少包含：

- `schedule_lifecycle`（启动/立即执行/停止区别）
- `schedule_send_target`（收件人/抄送/发送人语义）
- `dashboard_vs_view_vs_chart`
- `analysis_types`（事件/漏斗/留存）
- `sdk_integration_overview`

- [ ] **Step 3: Register tool**

`routeHints: ["knowledge", "visual_explain"]`，`knowledgeOnly: true`。

- [ ] **Step 4: Update Skill reference**

把 concept 列表写入 `concepts.md`，给 router 与模型提供同步源。

- [ ] **Step 5: Run tests + skill contract**

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(knowledge): add concept_explain tool with curated concept registry"
```

### Chunk 11: agent_trace SSE 与前端调试面板

#### Task 15: 后端发送 `agent_trace`

**Files:**

- Modify: `packages/mcp-server/src/chat/agent/agent-runner.ts`
- Modify: `packages/mcp-server/src/chat/agent/__tests__/agent-runner.test.ts`

- [ ] **Step 1: Failing test**

断言 `done` 之前发送一条 `agent_trace`，包含 `route`、`allowedToolNames`、`toolCallCount`、`finalizeRan`、`reflectVerdict`、`repairCount`、`durations`。

- [ ] **Step 2: Implement emit**

在 `applyVerdict` 之后调用 `safeSseSend(res, "agent_trace", buildTracePayload(state))`。允许用 `AGENT_TRACE=off` 关闭。

- [ ] **Step 3: Run tests**

Expected: pass.

#### Task 16: 前端调试面板

**Files:**

- Modify: `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/AgentTracePanel.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/__tests__/AgentTracePanel.test.tsx`
- Modify: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`

- [ ] **Step 1: Failing test**

渲染 `AgentTracePanel` with sample trace，断言显示 route、tool 名单、reflect verdict。

- [ ] **Step 2: useChatStream 接收 trace**

监听 `agent_trace` 事件，写入 message-level 的 `trace`。

- [ ] **Step 3: 加可折叠面板**

在 `MessageItem` 末尾加 `AgentTracePanel`，默认折叠；可通过 `?debug=1` query 或 `localStorage.bicliAgentTrace=1` 显示。

- [ ] **Step 4: Run frontend tests/lint**

```bash
pnpm --filter dataeye-frontend test
pnpm --filter dataeye-frontend lint
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(frontend): add agent trace panel for debugging"
```

## P2 Phase

### Chunk 12: Router 缓存与 telemetry 上报

#### Task 17: 路由结果缓存

**Files:**

- Modify: `packages/mcp-server/src/chat/agent/intent-router.ts`
- Create: `packages/mcp-server/src/chat/agent/__tests__/router-cache.test.ts`

- [ ] **Step 1: Failing test**

同一 sessionId 内连续两条相似消息：第二次直接命中缓存，不调用 LLM。

- [ ] **Step 2: Implement LRU cache keyed by `sessionId + hash(userMessage)`**

容量默认 200，TTL 5 分钟。

- [ ] **Step 3: Run tests**

#### Task 18: Telemetry 上报

**Files:**

- Modify: `packages/mcp-server/src/chat/agent/agent-runner.ts`
- Create: `packages/mcp-server/src/chat/agent/telemetry.ts`
- Create: `packages/mcp-server/src/chat/agent/__tests__/telemetry.test.ts`

- [ ] **Step 1: Failing test**

mock telemetry sink，验证每次 run 都会上报：route、durations、repairCount、success。

- [ ] **Step 2: Implement sink with env-based backend**

支持 `AGENT_TELEMETRY=stdout|http`；http 模式 POST 到 `AGENT_TELEMETRY_URL`，失败不中断业务。

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): add router cache and runtime telemetry"
```

### Chunk 13: 多 Sub-Agent 拆分

#### Task 19: 抽出 schedule sub-agent runner

**Files:**

- Create: `packages/mcp-server/src/chat/agent/sub-agents/schedule-runner.ts`
- Create: `packages/mcp-server/src/chat/agent/sub-agents/__tests__/schedule-runner.test.ts`
- Modify: `packages/mcp-server/src/chat/agent/agent-runner.ts`

- [ ] **Step 1: Failing test — `route.domains=["schedule"]` 路由到 schedule sub-agent**

断言 sub-agent 的 system prompt 包含定时任务专项指引，`allowedTools` 仅含 schedule 域。

- [ ] **Step 2: Implement sub-agent dispatch**

主 runner 在 `route` 决策后选择 sub-agent。Sub-agent 复用同一套 act/finalize/reflect，但有自定义 prompt 与限制。

- [ ] **Step 3: Add registry**

```ts
const subAgents: Record<string, SubAgent> = {
  schedule: scheduleRunner,
  analysis: analysisRunner,
  user: userRunner,
};
```

未配置 sub-agent 时走默认 runner。

- [ ] **Step 4: Run tests**

#### Task 20: Analysis 与 User sub-agent

**Files:**

- Create: `packages/mcp-server/src/chat/agent/sub-agents/analysis-runner.ts`
- Create: `packages/mcp-server/src/chat/agent/sub-agents/user-runner.ts`
- Tests in same folder.

- [ ] **Step 1: 复制 schedule-runner 模板，定制 system prompt 与默认 allowed tools**

- [ ] **Step 2: 跑全量测试与 build**

```bash
pnpm --filter @bicli/mcp-server test
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): introduce schedule/analysis/user sub-agents"
```

### Chunk 14: 知识工具向量检索升级 — **SKIPPED**

> **跳过理由（2026-04-30）：** 引入 embedding 模型 + 向量索引会带来新的外部依赖与运维成本，团队评估当前 P1 Chunk 10 的关键字 + 同义词索引已经足够覆盖主要知识问答场景，因此不在本次迭代范围内。如未来确实需要语义检索，再单独立项。

## End-to-End Verification

### Task 23: 全链路验证

**Files:**

- 既有测试 + 必要时新增 manual verification notes。

- [ ] **Step 1: Run backend full test suite**

```bash
pnpm --filter @bicli/mcp-server test
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0；预期 Node engine warning 可忽略。

- [ ] **Step 2: Run frontend tests/lint**

```bash
pnpm --filter dataeye-frontend test
pnpm --filter dataeye-frontend lint
```

- [ ] **Step 3: Manual prompts (记录在 PR 描述)**

| Prompt                             | 期望                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| 帮我看下接入 SDK 的流程            | route=knowledge；调用 `dataeye_knowledge_search` 或 `dataeye_concept_explain`；不调业务工具 |
| 启动和立即执行的区别               | route=knowledge；finalize 含 Mermaid                                                         |
| 查一下定时任务列表                 | route=realtime_query；调用 `dataeye_schedule_list` + finalize 输出概览                       |
| 帮我把任务 X 的收件人改成 Y        | route=write_action；先 `dataeye_schedule_manage` dryRun，再确认                              |
| 为什么这个分析没数据               | route=diagnosis；调用诊断工具；finalize 不下未验证根因                                       |
| 画下定时任务生命周期               | route=visual_explain；finalize 含 Mermaid，无大型 Markdown 表格                              |

- [ ] **Step 4: Trace 检查**

打开 `AgentTracePanel`，确认每条消息的 route、tool 名单、reflect verdict、repair count 与预期一致。

- [ ] **Step 5: Commit verification notes**

```bash
git commit -m "chore(agent): record runtime loop verification results"
```

## Acceptance Criteria

- 知识/流程/最佳实践问题不再触发实时业务工具，由 `dataeye_knowledge_search` / `dataeye_concept_explain` 提供答案。
- 实时查询、写操作、诊断问题进入对应 route，工具集合受限到该领域；`tool-domain-registry` 暴露 `routeHints`，selector 单测覆盖每条 route。
- 任何工具调用结束后必走 finalize，finalize 在工具结果可用时一定输出自然语言；空输出场景由 reflector deterministic fallback 兜底，永远不会出现“模型未返回任何内容”。
- Reflect 阶段统一规则 + 模型 critique，对漏调工具、伪成功、未验证根因、工具元数据残留有专项处理；最多触发一次 repair。
- Render hints 通过 SSE 输出，前端按 hint 选择 Mermaid、step 列表、message blocks，避免大型 Markdown 表格。
- `AgentTracePanel` 在 debug 模式下展示 route、工具名单、阶段耗时、reflect verdict、repair 次数。
- P2 完成后：router 命中缓存、telemetry 上报、schedule/analysis/user 各自独立 sub-agent。Chunk 14 知识工具向量检索升级本期不做（保持 Chunk 10 的关键字 + 同义词索引）。
- 全量 `pnpm --filter @bicli/mcp-server test`、`pnpm --filter @bicli/mcp-server build`、`pnpm --filter dataeye-frontend test`、`pnpm --filter dataeye-frontend lint` 通过。
