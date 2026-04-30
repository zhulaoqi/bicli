# Intelligent Result Rendering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BiCLI choose structured visual output deterministically from tool result shapes, so dashboard and analysis results render as metric cards, charts, warnings, summaries, and tables instead of mostly Markdown prose or wide tables.

**Architecture:** Add a backend result profiling layer and block factory, extend the existing `message_block` protocol, add frontend block renderers, and persist structured blocks for session history. Keep legacy `chart_data` compatible during migration.

**Tech Stack:** TypeScript, Node.js, Vitest, SSE, React 17, styled-components, Ant Design, Recharts, existing BiCLI `message_block` protocol.

---

对应设计：`docs/superpowers/specs/2026-04-30-intelligent-result-rendering-design.md`

## File Structure

Create:

- `packages/mcp-server/src/chat/result-profile.ts`
- `packages/mcp-server/src/chat/result-block-factory.ts`
- `packages/mcp-server/src/chat/__tests__/result-profile.test.ts`
- `packages/mcp-server/src/chat/__tests__/result-block-factory.test.ts`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/MetricCardsBlock.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/ChartBlock.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/SummaryBlock.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/WarningBlock.tsx`
- frontend tests for new blocks

Modify:

- `packages/mcp-server/src/chat/message-blocks.ts`
- `packages/mcp-server/src/chat/stream.ts`
- `packages/mcp-server/src/tools/datart-dashboard-execute.ts`
- `packages/mcp-server/src/tools/datart-data-execute.ts`
- `packages/mcp-server/src/tools/dataeye-analysis-execute.ts`
- `packages/mcp-server/src/chat/system-prompt.ts`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/blockRegistry.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`
- session persistence DTO/API files after storage strategy is chosen

## Chunk 1: Result Profiling

### Task 1: Write result profile tests

**Files:**

- Create: `packages/mcp-server/src/chat/__tests__/result-profile.test.ts`
- Create later: `packages/mcp-server/src/chat/result-profile.ts`

- [ ] **Step 1: Add failing test for KPI-like result**

Input:

```ts
{
  columns: [{ name: "request" }, { name: "response" }, { name: "revenue_new" }],
  rows: [[733, 688, 3.71]],
}
```

Expected:

- profile kind is `metrics`
- three metric candidates are produced

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/__tests__/result-profile.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 2: Add failing test for time series**

Input has `date` column and numeric measures over multiple dates.

Expected:

- kind `time_series`
- `xField=date`
- numeric measures as `yFields`

- [ ] **Step 3: Add failing test for wide detail table**

Input has many dimensions and multiple rows.

Expected:

- kind `table`
- low-priority id-like columns are marked as hide candidates

- [ ] **Step 4: Add failing test for diagnostics**

Input has `skippedUnits` and failed results.

Expected:

- diagnostic profile with warning severity

### Task 2: Implement result profiler

**Files:**

- Create: `packages/mcp-server/src/chat/result-profile.ts`

- [ ] **Step 1: Define profile types**

Include:

- `metrics`
- `time_series`
- `category_chart`
- `table`
- `diagnostic`
- `empty`

- [ ] **Step 2: Implement dataframe normalization**

Support both:

- `{ columns: [{ name }], rows: unknown[][] }`
- `{ columns: string[], rows: Record<string, unknown>[] }`

- [ ] **Step 3: Implement deterministic classification**

Rules:

- date/time + numeric rows -> `time_series`
- one category + numeric -> `category_chart`
- single row + scalar numbers -> `metrics`
- wide or detail rows -> `table`
- failures/skips -> `diagnostic`

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/__tests__/result-profile.test.ts
```

Expected: pass.

## Chunk 2: Block Factory

### Task 3: Write block factory tests

**Files:**

- Create: `packages/mcp-server/src/chat/__tests__/result-block-factory.test.ts`
- Create later: `packages/mcp-server/src/chat/result-block-factory.ts`
- Modify later: `packages/mcp-server/src/chat/message-blocks.ts`

- [ ] **Step 1: Test metric cards block**

Given `metrics` profile, expect:

- `type="metric_cards"`
- payload has cards with labels, values, units where inferred

- [ ] **Step 2: Test chart block**

Given `time_series` profile, expect:

- `type="chart"`
- `payload.chartType="line"`
- x/y fields and series are present

- [ ] **Step 3: Test warning block**

Given diagnostic profile, expect:

- `type="warning"`
- severity and actions are included

- [ ] **Step 4: Test table block**

Given table profile, expect:

- `type="table"`
- rows truncated
- total/truncated metadata present

### Task 4: Implement message block payload types and factory

**Files:**

- Modify: `packages/mcp-server/src/chat/message-blocks.ts`
- Create: `packages/mcp-server/src/chat/result-block-factory.ts`

- [ ] **Step 1: Add payload interfaces**

Add:

- `MetricCardsBlockPayload`
- `ChartBlockPayload`
- `SummaryBlockPayload`
- `WarningBlockPayload`

- [ ] **Step 2: Implement block creation helpers**

Functions:

- `createMetricCardsBlock`
- `createChartBlock`
- `createWarningBlock`
- `createSummaryBlock`
- `createTableBlockFromProfile`

- [ ] **Step 3: Preserve `isMessageBlock` compatibility**

Do not break existing `table` and `steps` extraction.

- [ ] **Step 4: Run block tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/chat/__tests__/result-block-factory.test.ts src/chat/__tests__/message-blocks.test.ts
```

Expected: pass.

## Chunk 3: Backend Tool Integration

### Task 5: Dashboard execution blocks

**Files:**

- Modify: `packages/mcp-server/src/tools/datart-dashboard-execute.ts`
- Test: `packages/mcp-server/src/tools/__tests__/datart-dashboard-execute.test.ts`

- [ ] **Step 1: Add failing test for dashboard block output**

Mock one successful chart result with date + numeric measures.

Expected:

- response data includes `__blocks__`
- contains `summary`
- contains `chart`
- contains `table` only when raw rows are detail-like or preview requested

- [ ] **Step 2: Add failing test for skipped/failed units**

Expected:

- warning block is emitted
- text summary tells LLM not to infer root cause

- [ ] **Step 3: Implement integration**

For each successful unit:

- call `profileDataframe`
- convert profile to blocks
- attach `sourceTool` and unit metadata

For failed/skipped units:

- emit `warning` block

- [ ] **Step 4: Run focused dashboard tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-dashboard-execute.test.ts
```

Expected: pass.

### Task 6: Single chart/view and analysis execution blocks

**Files:**

- Modify: `packages/mcp-server/src/tools/datart-data-execute.ts`
- Modify: `packages/mcp-server/src/tools/dataeye-analysis-execute.ts`
- Tests: relevant tool tests

- [ ] **Step 1: Add failing tests for single view blocks**

Expected:

- KPI-like data emits `metric_cards`
- time-series data emits `chart`
- wide detail data emits `table`

- [ ] **Step 2: Add analysis compatibility test**

Expected:

- old `__chart__` is preserved during compatibility period
- new `__blocks__[chart]` is also emitted when possible

- [ ] **Step 3: Implement block emission**

Do not duplicate huge raw rows in LLM-facing JSON.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-data-execute.test.ts src/tools/__tests__/dataeye-analysis-execute.test.ts
```

Expected: pass.

## Chunk 4: SSE and Persistence Contract

### Task 7: Strengthen stream contract tests

**Files:**

- Modify or create: `packages/mcp-server/src/chat/__tests__/stream-blocks.test.ts`
- Modify: `packages/mcp-server/src/chat/stream.ts`

- [ ] **Step 1: Test `__blocks__` extraction**

Given tool result with `__blocks__`, expect:

- `message_block` event emitted
- LLM payload no longer contains `__blocks__`

- [ ] **Step 2: Test `__chart__` compatibility**

Given tool result with both `__blocks__` and `__chart__`, expect both channels emit.

- [ ] **Step 3: Test non-string tool result handling**

If a tool returns object data, ensure stream serializes or normalizes it before extraction, or document and test that all tools must return strings.

### Task 8: Persist blocks and charts

**Files:**

- Investigate and modify session storage files under `packages/mcp-server/src`
- Modify `dataeye-frontend/src/app/pages/BiCLIWorkbench/api.ts`
- Modify `dataeye-frontend/src/app/pages/BiCLIWorkbench/Workbench.tsx`

- [ ] **Step 1: Identify message storage schema**

Decide whether blocks/charts live in metadata or first-class columns.

- [ ] **Step 2: Add backend tests for saving assistant blocks**

Expected:

- assistant message persists blocks/charts after stream done

- [ ] **Step 3: Add frontend hydration test**

Expected:

- historical session maps stored blocks/charts back into `UIMessage`

- [ ] **Step 4: Implement persistence**

Preserve backwards compatibility for existing sessions.

## Chunk 5: Frontend Block Renderers

### Task 9: Add frontend block renderer tests

**Files:**

- Create tests under `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/__tests__/`

- [ ] **Step 1: Test metric cards**

Render `metric_cards` block and assert labels/values appear.

- [ ] **Step 2: Test chart block**

Render `chart` block and assert chart title/legend/empty state appears.

- [ ] **Step 3: Test summary and warning**

Render `summary` and `warning` blocks.

### Task 10: Implement frontend renderers

**Files:**

- Create: `MetricCardsBlock.tsx`
- Create: `ChartBlock.tsx`
- Create: `SummaryBlock.tsx`
- Create: `WarningBlock.tsx`
- Modify: `blockRegistry.tsx`
- Modify: `useChatStream.ts` types

- [ ] **Step 1: Add types**

Extend frontend block payload types.

- [ ] **Step 2: Implement components**

Use existing UI style:

- cards for metrics
- Recharts for line/bar/pie/funnel
- Ant Design alert/card for warning/summary

- [ ] **Step 3: Register block types**

`metric_cards`, `chart`, `summary`, `warning`

- [ ] **Step 4: Run frontend tests**

Use the project’s existing frontend test command.

Expected: pass.

## Chunk 6: Prompt and UX Policy

### Task 11: Update prompt rules

**Files:**

- Modify: `packages/mcp-server/src/chat/system-prompt.ts`
- Modify relevant Skill docs if needed

- [ ] **Step 1: Add rule for block-backed results**

Say:

- Do not duplicate structured block rows in text.
- Summarize blocks and call out insights.
- Do not create large Markdown tables when tool blocks are present.

- [ ] **Step 2: Add tool result display hint convention**

Tools can include `displayHint` in LLM payload.

- [ ] **Step 3: Run prompt-related tests**

Run mcp-server tests.

## Chunk 7: Verification

### Task 12: Full verification

- [ ] **Step 1: Backend tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test
pnpm --filter @bicli/mcp-server build
```

Expected: pass.

- [ ] **Step 2: Frontend tests**

Run the applicable frontend test/build commands.

Expected: pass.

- [ ] **Step 3: Manual scenarios**

Manual checks:

- Execute a dashboard with one time-series component: chart block appears.
- Execute a dashboard with KPI result: metric cards appear.
- Execute a dashboard with wide rows: table block appears, not oversized Markdown.
- Execute a dashboard with partial failures: warning block appears.
- Reload session: blocks/charts still render.

## Rollout Order

Recommended order:

1. Backend profiler and block factory.
2. Dashboard execution blocks.
3. Frontend block renderers.
4. Persistence.
5. Analysis tool compatibility migration.
6. Prompt refinement.

This order allows backend data contracts to stabilize before frontend persistence and broad tool adoption.
