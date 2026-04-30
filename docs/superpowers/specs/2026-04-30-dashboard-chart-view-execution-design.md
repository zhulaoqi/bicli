# Dashboard, Chart, and View Execution Design

> **Status:** Draft for implementation planning  
> **Date:** 2026-04-30  
> **Scope:** BiCLI MCP server execution of embedded visualization resources backed by the existing visualization service.

## Problem

Users expect BiCLI to execute a named dashboard-like resource and return real data for every executable component inside it. The current implementation is unreliable:

- The model can pass a guessed or shortened `dashboardId` such as `53cdbb0d`, causing `resource.dashboard 不存在`.
- The backend tool accepts only `dashboardId`, so a natural-language resource name is not resolved server-side.
- Folder node IDs and resource relation IDs are easy to confuse. The executable ID is `Folder.relId`, not `Folder.id`.
- The current dashboard executor only handles saved charts from `detail.datacharts`; pure view widgets from `widgets[].viewIds` are skipped.
- The request-body builder is a simplified approximation of the frontend `ChartDataRequestBuilder`, missing fields such as `countAggregators`, `calculate`, `summary`, `params`, `functionColumns`, `chartGraphId`, richer filters, and correct paging flags.

This makes successful execution depend too much on the model selecting the right ID and rebuilding frontend query parameters from memory.

## Evidence From Service Code

The service detail endpoint starts from a real resource ID and then expands widgets, charts, views, and variables:

- `GET /api/v1/viz/dashboards/{dashboardId}` maps to `DashboardServiceImpl.getDashboardDetail`.
- `getDashboardDetail` calls `retrieve(dashboardId)` first. If the ID is not a real dashboard primary key, the service throws `resource.dashboard 不存在`.
- `getWidgets` reads widgets by dashboard ID, then reads `rel_widget_element`.
- A widget can reference a chart through `relType=DATACHART`, or one or more views through `relType=VIEW`.
- Charts also contribute their bound `viewId`; the detail response includes both `datacharts` and `views`.

Actual data execution is unified:

- `POST /api/v1/data-provider/execute` receives `ViewExecuteParam`.
- The service loads the `View` by `viewExecuteParam.viewId`.
- The query is built from `columns`, `aggregators`, `countAggregators`, `filters`, `groups`, `orders`, `pageInfo`, `functionColumns`, `calculate`, `params`, and summary options.
- `vizId`, `vizName`, and `vizType` are metadata for surrounding workflows; `viewId` and query fields drive the real query.

Frontend behavior is the best local reference for request composition:

- `dataeye-frontend/src/app/models/ChartDataRequestBuilder.ts` is the canonical request builder.
- It builds `summary`, `chartGraphId`, `viewId`, `aggregators`, `calculate`, `xRange`, `countAggregators`, `groups`, `filters`, `orders`, `pageInfo`, `functionColumns`, `columns`, `script`, and `params`.

## Goals

- Resolve dashboard-like resources by ID, name, or page context without letting the model guess IDs.
- Execute every supported component in a resource: saved charts and direct view widgets.
- Build `ViewExecuteParam` from saved chart/view config with behavior close to the frontend builder.
- Return structured execution metadata so the model can summarize without inventing missing causes.
- Provide stable error categories for not found, ambiguous name, unsupported config, partial execution, and execution failure.
- Keep model-facing routing conservative: execution tools should require server-side resource resolution before running.

## Non-Goals

- Do not modify the visualization service API in this iteration.
- Do not implement every frontend-only visual behavior such as drill-down UI state or conditional style rendering.
- Do not silently fabricate query fields when saved config is incomplete.
- Do not make the model responsible for assembling IDs or low-level query bodies.

## Proposed Architecture

### 1. Resource Resolver

Add a server-side resolver module:

`packages/mcp-server/src/tools/datart-resource-resolver.ts`

Responsibilities:

- Accept `dashboardId`, `dashboardName`, or `dashboardRef`.
- Fetch candidates from `/api/v1/viz/folders/type?orgId=...&vizType=DASHBOARD`.
- Treat `relId` as the executable resource ID.
- Preserve `folderId` only as folder metadata.
- Resolve:
  - exact `relId`
  - exact name
  - case-insensitive name
  - unique prefix match for 32-character IDs
- Return `AMBIGUOUS_RESOURCE` with candidates when a name or short ID is not unique.
- Return `NOT_FOUND` when no candidate matches.

The executor must not call `/viz/dashboards/{id}` until the resolver has produced a single real `resolvedId`.

### 2. Dashboard Execution Planner

Replace chart-only resolution with an execution planner:

`resolveDashboardExecutableUnits(detail)`

Output unit shape:

```ts
type DashboardExecutableUnit = {
  unitId: string;
  unitType: "chart" | "view";
  widgetId?: string;
  widgetName?: string;
  chartId?: string;
  chartName?: string;
  viewId: string;
  viewName?: string;
  chartConfig?: unknown;
  view?: unknown;
};
```

Rules:

- For `widgets[].datachartId`, find the matching chart in `detail.datacharts`, then use `chart.viewId`.
- For `widgets[].viewIds`, create a direct view unit for each matching view.
- Deduplicate by `widgetId + chartId/viewId`.
- If a widget references a missing chart or view, add a skipped unit with reason.
- If a chart has no `viewId`, skip it with reason.
- Respect `maxUnits` after planning, but report total supported/skipped counts.

### 3. Request Body Builder

Extract request composition into:

`packages/mcp-server/src/tools/datart-execute-request-builder.ts`

Public functions:

```ts
buildChartExecuteRequest(input: ChartExecuteRequestInput): ViewExecuteRequest
buildViewExecuteRequest(input: ViewExecuteRequestInput): ViewExecuteRequest
```

Chart execution uses saved chart config:

- `chart.config.chartConfig.datas` as data sections.
- `chart.config.styles` for summary/paging where available.
- `chart.config.aggregation` to choose between aggregated and raw-column queries.
- `chart.config.chartGraphId` if present.
- `view.config` transformed into request-level view config.

View execution uses view metadata:

- Default to detail/raw columns when available.
- Include `pageInfo`.
- Return `UNSUPPORTED_VIEW_CONFIG` if no selectable fields can be inferred.

The builder must cover at least:

- `columns`
- `aggregators`
- `countAggregators`
- `groups`
- `filters`
- `orders`
- `pageInfo`
- `functionColumns`
- `calculate`
- `summary`
- `params`
- `chartGraphId`
- `script`
- `viewId`
- `vizId`
- `vizType`
- `vizName`

Unsupported advanced features should be explicit, not hidden:

- drill-down state
- runtime page filters not present in saved config
- xRange/scatter features unless directly present and test-covered
- frontend-only conditional visualization fields

### 4. Tool Contract

Update `dataeye_dashboard_execute` input:

```ts
{
  dashboardId?: string;
  dashboardName?: string;
  dashboardRef?: string;
  pageSize?: number;
  maxUnits?: number;
  includeViews?: boolean;
  includeCharts?: boolean;
}
```

Behavior:

- At least one of `dashboardId`, `dashboardName`, or `dashboardRef` is required.
- The tool resolves the resource first.
- If resolution is ambiguous, it returns candidates and does not execute.
- If resolution succeeds, it gets detail and plans units.
- It executes each unit independently through `/api/v1/data-provider/execute`.
- It returns partial success when some units execute and others fail.

Output shape:

```ts
{
  success: boolean;
  resolvedResource: {
    id: string;
    name?: string;
    folderId?: string;
    matchedBy: "id" | "name" | "prefix" | "pageContext";
  };
  plan: {
    totalWidgets: number;
    executableUnits: number;
    skippedUnits: Array<{ unitId?: string; reason: string }>;
  };
  execution: {
    executedCount: number;
    successCount: number;
    failedCount: number;
    results: Array<...>;
  };
}
```

### 5. Single Chart/View Tool

Update `dataeye_chart_data_execute` so it can execute:

- a chart when `vizId` or chart detail/config is available
- a direct view when only `viewId` is available
- a raw `requestBody` only for internal or already validated flows

For dashboard-level requests, it should continue to reject direct execution and point to the dashboard executor.

### 6. Error Model

Map service and tool failures into stable codes:

- `INVALID_ARGS`: missing or conflicting input.
- `AMBIGUOUS_RESOURCE`: resolver found multiple candidates.
- `NOT_FOUND`: resolver found no candidate or service reports `resource.dashboard 不存在`.
- `NO_EXECUTABLE_UNITS`: detail has no supported chart/view units.
- `UNSUPPORTED_CHART_CONFIG`: config cannot produce non-empty `ViewExecuteParam`.
- `UNSUPPORTED_VIEW_CONFIG`: direct view cannot infer columns or query fields.
- `PARTIAL_FAILURE`: at least one unit succeeded and at least one failed.
- `EXECUTION_FAILED`: all planned units failed.

For `resource.dashboard 不存在`, the message should explain likely causes:

- the ID is a folder node ID, not `relId`
- the ID is a short or guessed ID
- the resource is deleted/archived
- the current org or user cannot access it

It must not claim one cause as fact unless the tool verified it.

### 7. Model and Skill Guidance

Model-facing guidance should not rely on keyword guessing. It should state operational rules:

- For execution requests, call the business execution tool with the user's raw name/ref; do not invent IDs.
- If the user gives a name, pass it as `dashboardRef` or `dashboardName`.
- If the user gives an ID-like fragment, pass it as `dashboardRef`; the resolver decides whether it is unique.
- Never use `folderId` for execution.
- If the tool returns candidates, ask the user to choose instead of retrying with a guessed ID.

Existing skill/tool descriptions should be reviewed to reduce confusing or project-restricted terminology in prompts and routing. Internal file names can be cleaned separately, but model-visible descriptions should prefer neutral business action wording and exact tool contracts.

## Data Flow

1. User: "执行下 WGT-Widget-创意分析看板".
2. Model calls `dataeye_dashboard_execute` with `{ dashboardRef: "WGT-Widget-创意分析看板" }`.
3. Resolver lists folder resources and resolves the exact `relId`.
4. Executor calls `/api/v1/viz/dashboards/{relId}`.
5. Planner extracts chart units and direct view units from `widgets`, `datacharts`, and `views`.
6. Builder creates one `ViewExecuteParam` per unit.
7. Executor calls `/api/v1/data-provider/execute` for each unit.
8. Tool returns structured results, skipped reasons, and summaries.
9. Model summarizes only from tool output.

## Testing Strategy

Unit tests:

- Resolver uses `relId`, not `folderId`.
- Resolver handles exact name, exact ID, unique prefix, ambiguous prefix, and not found.
- Planner emits both chart units and direct view units.
- Planner reports skipped units for missing chart/view config.
- Request builder produces non-empty `ViewExecuteParam`.
- Request builder includes `countAggregators`, `calculate`, `summary`, `params`, `functionColumns`, and page info when present.
- Error mapper converts `resource.dashboard 不存在` to `NOT_FOUND`.

Integration-style tests with mocked `datartRequest`:

- Name-only dashboard execution resolves then executes.
- Mixed chart/view dashboard returns partial success.
- Ambiguous name returns candidates without executing.
- Service not-found returns stable `NOT_FOUND`.

Manual verification:

- Ask: "执行下 WGT-Widget-创意分析看板".
- Expected: resolver shows the real resolved ID; tool executes multiple units; no guessed short ID appears.
- Ask with a short prefix that matches multiple resources.
- Expected: candidates are returned and execution is blocked.

## Rollout

1. Land resolver and tests first.
2. Land planner and request builder behind existing tool names.
3. Update tool schema and model guidance.
4. Validate with mocked tests and one real dashboard-like resource.
5. Only after verification, consider broader rich-result rendering for full tables/charts.

## Open Questions

- Whether page context can reliably provide the real `relId`; if yes, the resolver should accept it as high-confidence evidence.
- Whether pure view widgets should default to all model fields or only visible/default columns.
- Whether advanced xRange/scatter chart execution is required in this iteration or should return an explicit unsupported reason until covered by tests.
