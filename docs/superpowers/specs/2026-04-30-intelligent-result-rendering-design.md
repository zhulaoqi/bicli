# Intelligent Result Rendering Design

> **Status:** Draft for implementation planning  
> **Date:** 2026-04-30  
> **Scope:** BiCLI MCP server result shaping, SSE message blocks, and DataEye frontend chat rendering.

## Problem

BiCLI can now execute dashboard resources and return real rows, but the presentation is still mostly decided by the model text. In practice we have seen:

- Large query results are rendered as wide Markdown tables, which are hard to read in chat.
- Most structured rendering is table-only.
- The front-end has code for rich rendering, but only a small subset is actually fed by backend data.
- Chart-like, metric-like, trend-like, and process-like outputs often remain plain text.
- Failed or skipped dashboard components are summarized in prose instead of structured diagnostics.

The current system does not have a central policy that says: “this result shape should become a table, metric card, chart, warning, callout, or steps block.” Each tool either manually emits `__blocks__`, emits legacy `__chart__`, or lets the LLM describe the result.

## Current State

### Backend

Relevant files:

- `packages/mcp-server/src/chat/message-blocks.ts`
- `packages/mcp-server/src/chat/stream.ts`
- `packages/mcp-server/src/tools/dataeye-user-list.ts`
- `packages/mcp-server/src/tools/dataeye-analysis-execute.ts`
- `packages/mcp-server/src/tools/datart-dashboard-execute.ts`

Current behavior:

- `message_block` SSE is emitted only when a tool result string contains `data.__blocks__`.
- `chart_data` SSE is emitted only when a tool result string contains `data.__chart__`.
- `dataeye-user-list` is currently the main production tool that emits `__blocks__`, and it emits `table`.
- Analysis execution can emit `__chart__`, but this is a separate legacy channel, not a `message_block(type="chart")`.
- `message-blocks.ts` already lists future block types such as `chart`, `metric_cards`, `timeline`, `diagram`, `callout`, `summary`, and `warning`, but most are not produced by tools.

### Frontend

Relevant files:

- `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageBlocks.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/blockRegistry.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/ChartWidget.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Markdown/*`

Current behavior:

- `message_block` updates `state.blocks`.
- `chart_data` updates `state.charts`.
- `blockRegistry` renders only `table` and `steps`; all other types go to `UnknownBlock`.
- Markdown supports GFM tables, code highlighting, and Mermaid, but only after streaming finishes.
- Historical session messages do not restore `blocks` or `charts`; they only restore `content` and `toolCalls`.

## Root Cause

The issue is not that the frontend cannot render anything except tables. The deeper issue is that rendering decisions are scattered:

1. Tools manually decide whether to emit blocks.
2. Only a few tools emit blocks.
3. `chart_data` and `message_block(type="chart")` are separate paths.
4. The LLM still receives summaries and often formats results itself.
5. There is no deterministic result classifier between “tool returned data” and “frontend rendered UI.”

This means rich rendering is opportunistic, not systematic.

## Best Practice Target

Modern AI data assistants usually separate four concerns:

1. **Tool execution:** Get real data and provenance.
2. **Result profiling:** Determine result shape and intent.
3. **Structured rendering:** Emit typed UI blocks independent of LLM prose.
4. **Narrative explanation:** Let the model summarize the already-rendered evidence.

Recommended rendering policy:

| Result Shape | Preferred Rendering | Notes |
| --- | --- | --- |
| Small scalar KPIs | `metric_cards` | Total users, revenue, eCPM, conversion rate, success/failure counts |
| Time series | `chart` line/bar + optional table | Date/time dimension + numeric measures |
| Category comparison | `chart` bar/pie + table | Country, campaign, ad type, status distributions |
| Funnel steps | `chart` funnel | Step name + value/rate |
| Retention matrix | `chart` heatmap | Date cohort + day offset values |
| Wide/detail rows | `table` | Paginated, column hiding, truncation metadata |
| Execution diagnostics | `warning` / `summary` / `steps` | Failed units, skipped units, next actions |
| Conceptual explanation | Markdown + Mermaid | No tool result required |

The LLM should not decide the visual type from scratch. It can explain insights, but block production should be deterministic and testable.

## Goals

- Introduce a backend result profiler that maps tool result data to recommended block types.
- Expand backend block production beyond `table`.
- Add frontend renderers for core block types: `metric_cards`, `chart`, `summary`, `warning`, and improved `table`.
- Gradually unify legacy `chart_data` with `message_block(type="chart")` while preserving compatibility.
- Persist structured blocks/charts so historical sessions render the same as live streams.
- Reduce Markdown table overuse for business data.
- Keep LLM text concise and evidence-based.

## Non-Goals

- Do not build a full BI visualization editor in chat.
- Do not attempt to render every possible chart configuration from the visualization service.
- Do not let the LLM invent chart schemas not backed by tool output.
- Do not remove `chart_data` until the compatibility period is complete.

## Proposed Architecture

### 1. Result Profile Layer

Create a backend module:

`packages/mcp-server/src/chat/result-profile.ts`

It classifies normalized tool results:

```ts
type ResultProfile =
  | { kind: "empty"; reason?: string }
  | { kind: "metrics"; metrics: MetricCandidate[] }
  | { kind: "time_series"; xField: string; yFields: string[] }
  | { kind: "category_chart"; categoryField: string; valueFields: string[] }
  | { kind: "table"; columns: ColumnCandidate[]; rows: Record<string, unknown>[] }
  | { kind: "diagnostic"; severity: "info" | "warning" | "error"; items: DiagnosticItem[] };
```

Profiling rules should be deterministic:

- If columns contain date/time fields and numeric measures, prefer `time_series`.
- If there is one categorical dimension and one to three numeric measures, prefer `category_chart`.
- If there are one to six scalar numeric values, prefer `metric_cards`.
- If columns are more than six or rows are detail-like, prefer `table`.
- If a tool returns failures/skips, emit diagnostics even if successful data exists.

### 2. Block Factory Layer

Create:

`packages/mcp-server/src/chat/result-block-factory.ts`

Responsibilities:

- Convert `ResultProfile` into `MessageBlock[]`.
- Produce stable block IDs.
- Attach `sourceTool`, `toolCallId`, `title`, `display.priority`, and provenance.
- Truncate rows for chat display but preserve total/truncated metadata.
- Mask sensitive fields using existing table masking helpers.

Core block payloads:

```ts
type MetricCardsPayload = {
  cards: Array<{
    key: string;
    label: string;
    value: string | number;
    unit?: string;
    delta?: string | number;
    trend?: "up" | "down" | "flat";
  }>;
};

type ChartBlockPayload = {
  chartType: "line" | "bar" | "pie" | "funnel" | "heatmap";
  xField?: string;
  yFields?: string[];
  categories?: string[];
  series?: Array<{ name: string; data: Array<number | null> }>;
  rows?: Array<Record<string, unknown>>;
};

type SummaryBlockPayload = {
  items: Array<{ label: string; value: string | number; tone?: "default" | "success" | "warning" | "error" }>;
};

type WarningBlockPayload = {
  severity: "info" | "warning" | "error";
  message: string;
  details?: Array<string>;
  actions?: Array<{ label: string; prompt?: string }>;
};
```

### 3. Tool Integration

Start with high-value tools:

- `dataeye_dashboard_execute`
- `dataeye_chart_data_execute`
- `dataeye_analysis_execute`
- list/query tools that return rows

Dashboard execution should emit:

- `summary` block for total components, success count, skipped count.
- `warning` block for failed/skipped units.
- For each successful component:
  - `metric_cards` if result is KPI-like.
  - `chart` if result is trend/category/funnel/heatmap-like.
  - `table` for detail or wide rows.

The text response should say only the conclusion and reference the structured blocks.

### 4. Frontend Rendering

Extend:

`dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Blocks/blockRegistry.tsx`

Add components:

- `MetricCardsBlock.tsx`
- `ChartBlock.tsx`
- `SummaryBlock.tsx`
- `WarningBlock.tsx`

Chart rendering can reuse existing `ChartWidget` ideas and `recharts`.

Initial chart support:

- line chart
- bar chart
- pie chart
- funnel chart
- heatmap placeholder or simple matrix table if no mature component is available

### 5. Compatibility

Keep current behavior:

- Continue handling `chart_data`.
- Add support for `message_block(type="chart")`.
- For a transition period, analysis tools may emit both `__chart__` and `__blocks__[chart]`, or emit only `__blocks__[chart]` after frontend support is deployed.

### 6. Persistence

Current historical session restoration loses `blocks` and `charts`.

Required change:

- Extend assistant message persistence to store structured `blocks` and legacy `charts`.
- Extend session API DTOs.
- Map stored blocks/charts back into `UIMessage`.

If schema migration is risky, first store them under assistant message metadata, then later promote to first-class columns.

## Display Decision Rules

### Time Series

Input:

- at least one date/time column
- at least one numeric measure
- rows sorted or sortable by date

Output:

- `chart(type=line)` for continuous dates
- `chart(type=bar)` if low cardinality time buckets
- optional `table` if user asked for raw data

### Category Ranking

Input:

- one category dimension
- one numeric metric
- rows <= 50 after truncation

Output:

- `chart(type=bar)`
- table if category labels are long or there are multiple metrics

### KPI Cards

Input:

- one row with multiple numeric columns
- or summary object with scalar values

Output:

- `metric_cards`

### Detail Table

Input:

- many dimensions
- wide rows
- mixed string/numeric data

Output:

- `table`
- hide low-priority ID columns by default
- show total and preview count

### Diagnostics

Input:

- failed units
- skipped units
- empty result
- unsupported config

Output:

- `warning`
- `steps` with recovery actions when useful

## Prompt Policy

System prompt should say:

- Tool data should be rendered through blocks when available.
- The assistant should not create Markdown tables for large business data.
- If a block was emitted, text should summarize and explain, not duplicate rows.
- If there are multiple possible visualizations, prefer the deterministic block chosen by the backend.

## Testing Strategy

Backend:

- Unit tests for result profiling.
- Unit tests for block factory.
- Tool tests verifying dashboard execution emits summary/warning/chart/table blocks.
- Stream tests verifying `__blocks__` is removed from LLM payload and sent as SSE.

Frontend:

- Block registry tests for `metric_cards`, `chart`, `summary`, `warning`.
- `useChatStream` tests for `message_block(type="chart")`.
- Message history hydration tests for stored blocks/charts.

Manual:

- Execute a dashboard with time-series data: expect line chart + summary.
- Execute a dashboard with wide detail data: expect table with hidden low-priority columns.
- Execute a dashboard with failures: expect warning block + successful blocks.
- Reload session: structured blocks remain visible.

## Open Questions

- Should dashboard execution emit one combined dashboard-level block or one block per component?
- Should raw data tables default to collapsed when a chart is also present?
- Should metric cards display deltas only when the tool provides comparison data, or infer deltas when time periods exist?
- Should chart blocks include full raw rows for export, or only display-safe preview rows?
