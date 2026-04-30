# Dashboard, Chart, and View Execution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BiCLI execute dashboard-like resources reliably by resolving resource names/IDs server-side, expanding chart and view widgets, and building service-compatible `ViewExecuteParam` requests.

**Architecture:** Add a resolver before execution so model-generated IDs are never trusted blindly. Split execution into resource resolution, dashboard planning, request-body construction, and result/error normalization. Reuse existing tool names while strengthening their schema and behavior.

**Tech Stack:** TypeScript, Node.js, existing BiCLI MCP server tools, visualization service HTTP proxy, Vitest.

---

对应设计：`docs/superpowers/specs/2026-04-30-dashboard-chart-view-execution-design.md`

## File Structure

Create:

- `packages/mcp-server/src/tools/datart-resource-resolver.ts`
- `packages/mcp-server/src/tools/datart-execute-request-builder.ts`
- `packages/mcp-server/src/tools/__tests__/datart-resource-resolver.test.ts`
- `packages/mcp-server/src/tools/__tests__/datart-execute-request-builder.test.ts`

Modify:

- `packages/mcp-server/src/tools/datart-dashboard-execute.ts`
- `packages/mcp-server/src/tools/datart-data-execute.ts`
- `packages/mcp-server/src/tools/datart-dashboard-list.ts`
- `packages/mcp-server/src/tools/datart-proxy.ts`
- `packages/mcp-server/src/tools/__tests__/datart-dashboard-execute.test.ts`
- `packages/mcp-server/src/tools/tool-domain-registry.ts`
- `packages/mcp-server/src/chat/system-prompt.ts`
- `packages/skills/definitions/datart-dashboard/SKILL.md`

Review for model-visible wording:

- `packages/skills/definitions/datart-dashboard/SKILL.md`
- tool descriptions in `packages/mcp-server/src/tools/datart-*.ts`
- any prompt text that encourages keyword-based routing or guessed IDs

## Chunk 1: Resource Resolution

### Task 1: Add failing resolver tests

**Files:**

- Create: `packages/mcp-server/src/tools/__tests__/datart-resource-resolver.test.ts`
- Create later: `packages/mcp-server/src/tools/datart-resource-resolver.ts`

- [ ] **Step 1: Write tests for `relId` vs `folderId`**

Cover:

- A folder item has `id="folder_1"` and `relId="dashboard_1"`.
- Resolving `dashboard_1` returns `dashboard_1`.
- Resolving `folder_1` does not treat it as executable unless no better candidate exists; expected result should be `NOT_FOUND` or an explicit invalid-folder-id outcome.

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-resource-resolver.test.ts
```

Expected: fail because resolver does not exist.

- [ ] **Step 2: Write tests for name and prefix resolution**

Cover:

- exact name match
- case-insensitive name match
- unique ID prefix match
- ambiguous name/prefix returns candidates and `resolved=false`
- no match returns stable `NOT_FOUND`

Run the same focused test command. Expected: fail.

### Task 2: Implement resolver

**Files:**

- Create: `packages/mcp-server/src/tools/datart-resource-resolver.ts`
- Modify if needed: `packages/mcp-server/src/tools/datart-dashboard-list.ts`

- [ ] **Step 1: Define resolver types**

Implement:

```ts
export type ResourceCandidate = {
  id: string;
  name: string;
  folderId?: string;
  parentId?: string;
};

export type ResolveDashboardResult =
  | { resolved: true; matchedBy: "id" | "name" | "prefix"; resource: ResourceCandidate }
  | { resolved: false; code: "AMBIGUOUS_RESOURCE" | "NOT_FOUND"; message: string; candidates?: ResourceCandidate[] };
```

- [ ] **Step 2: Implement candidate loading**

Use:

```ts
datartRequest<FolderItem[]>("/api/v1/viz/folders/type", context, {
  params: { orgId, vizType: "DASHBOARD" },
});
```

Normalize candidate ID from `relId || rel_id`. Keep `folderId` from `id`.

- [ ] **Step 3: Implement matching order**

Order:

1. exact executable ID
2. exact name
3. case-insensitive name
4. unique executable ID prefix

Do not execute on ambiguous matches.

- [ ] **Step 4: Run resolver tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-resource-resolver.test.ts
```

Expected: pass.

## Chunk 2: Execution Request Builder

### Task 3: Add failing request-builder tests

**Files:**

- Create: `packages/mcp-server/src/tools/__tests__/datart-execute-request-builder.test.ts`
- Create later: `packages/mcp-server/src/tools/datart-execute-request-builder.ts`

- [ ] **Step 1: Test aggregated chart request**

Input:

- chart config with `group`, `aggregate`, `filter`, `mixed`, and `summary`
- view config with basic properties

Expected request includes:

- `viewId`
- `vizId`
- `vizType`
- `groups`
- `aggregators`
- `countAggregators`
- `filters`
- `orders`
- `pageInfo`
- `summary`
- `functionColumns`
- `calculate`
- `params`

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-execute-request-builder.test.ts
```

Expected: fail because builder does not exist.

- [ ] **Step 2: Test raw/detail chart request**

Use `aggregation=false`.

Expected:

- `columns` is populated.
- `aggregators` and `groups` are empty unless config requires them.
- request is not empty according to service `ViewExecuteParam.isEmpty()`.

- [ ] **Step 3: Test direct view request**

Use a view with meta/model fields.

Expected:

- `columns` is populated from selectable fields.
- `pageInfo` exists.
- unsupported view config returns explicit unsupported result.

### Task 4: Implement request builder

**Files:**

- Create: `packages/mcp-server/src/tools/datart-execute-request-builder.ts`
- Modify: `packages/mcp-server/src/tools/datart-data-execute.ts`

- [ ] **Step 1: Move existing helpers**

Move or re-export:

- `parseRecord`
- array normalization
- alias helpers
- unique-by-column helpers

Keep compatibility so existing tests still pass.

- [ ] **Step 2: Implement chart config parsing**

Parse:

- `config.chartConfig.datas`
- `config.styles`
- `config.aggregation`
- `config.chartGraphId`
- `view.config`

Do not throw on malformed JSON; return an unsupported result that includes reason.

- [ ] **Step 3: Implement field builders**

Implement service-compatible structures:

- `buildAggregators`
- `buildCountAggregators`
- `buildGroups`
- `buildColumns`
- `buildFilters`
- `buildOrders`
- `buildFunctionColumns`
- `buildCalculate`
- `buildSummary`
- `buildPageInfo`

Match frontend behavior where practical, especially aliases and `{ value, valueType }` filter values.

- [ ] **Step 4: Implement direct view request**

For a view unit:

- derive selectable columns from `view.model`, `view.meta`, or parsed config when available
- build `columns`
- include `pageInfo`
- return unsupported if no columns can be inferred

- [ ] **Step 5: Run request-builder tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-execute-request-builder.test.ts
```

Expected: pass.

## Chunk 3: Dashboard Planner and Executor

### Task 5: Add failing planner/executor tests

**Files:**

- Modify: `packages/mcp-server/src/tools/__tests__/datart-dashboard-execute.test.ts`

- [ ] **Step 1: Test mixed chart/view planning**

Create dashboard detail with:

- one widget referencing a chart
- one widget referencing a direct view
- one broken widget referencing a missing view

Expected:

- chart unit emitted
- view unit emitted
- skipped unit emitted with reason

- [ ] **Step 2: Test name-only execution flow**

Mock request order:

1. `/viz/folders/type`
2. `/viz/dashboards/{resolvedRelId}`
3. `/data-provider/execute` for each unit

Expected:

- tool accepts `dashboardRef`
- actual detail call uses resolved `relId`
- no call uses `folderId`

- [ ] **Step 3: Test ambiguous resource blocks execution**

Mock two matching candidates.

Expected:

- tool returns `AMBIGUOUS_RESOURCE`
- no `/viz/dashboards/{id}` call
- no `/data-provider/execute` call

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-dashboard-execute.test.ts
```

Expected: fail before implementation.

### Task 6: Implement planner and executor flow

**Files:**

- Modify: `packages/mcp-server/src/tools/datart-dashboard-execute.ts`

- [ ] **Step 1: Update input schema**

Support:

```ts
dashboardId?: string;
dashboardName?: string;
dashboardRef?: string;
pageSize?: number;
maxUnits?: number;
includeViews?: boolean;
includeCharts?: boolean;
```

Require at least one resource ref.

- [ ] **Step 2: Call resolver before detail**

Use user-provided raw ref. If resolver is ambiguous or not found, return immediately.

- [ ] **Step 3: Implement `resolveDashboardExecutableUnits`**

Use `widgets`, `datacharts`, and `views`.

Rules:

- chart widget -> chart -> chart.viewId -> view
- view widget -> viewIds -> view
- dedupe units
- collect skipped units

- [ ] **Step 4: Execute each unit**

For chart units, call `buildChartExecuteRequest`.

For view units, call `buildViewExecuteRequest`.

If builder returns unsupported, mark the unit skipped or failed without calling service.

- [ ] **Step 5: Normalize output**

Return:

- `resolvedResource`
- `plan`
- `execution`
- `results`
- `skippedUnits`
- stable `success` semantics

Use `PARTIAL_FAILURE` when needed.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-dashboard-execute.test.ts
```

Expected: pass.

## Chunk 4: Single Chart/View Tool Alignment

### Task 7: Update single execution tool tests

**Files:**

- Add or modify tests under `packages/mcp-server/src/tools/__tests__/`
- Modify: `packages/mcp-server/src/tools/datart-data-execute.ts`

- [ ] **Step 1: Test direct view execution**

Input:

- `viewId`
- view metadata or request body

Expected:

- calls `/data-provider/execute`
- returns dataframe summary

- [ ] **Step 2: Test dashboard rejection remains**

Input:

- `vizType: "DASHBOARD"`

Expected:

- returns `INVALID_ARGS`
- message points to `dataeye_dashboard_execute`

### Task 8: Wire single execution through shared builder

**Files:**

- Modify: `packages/mcp-server/src/tools/datart-data-execute.ts`
- Modify: `packages/mcp-server/src/tools/datart-execute-request-builder.ts`

- [ ] **Step 1: Replace local builder**

Use shared `buildChartExecuteRequest` / `buildViewExecuteRequest`.

- [ ] **Step 2: Preserve existing exports**

If tests or other tools import `buildChartDataRequestBody`, keep a compatibility export that delegates to the new builder.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/datart-dashboard-execute.test.ts src/tools/__tests__/datart-execute-request-builder.test.ts
```

Expected: pass.

## Chunk 5: Error Normalization and Model Guidance

### Task 9: Normalize service errors

**Files:**

- Modify: `packages/mcp-server/src/tools/datart-proxy.ts`
- Modify if needed: `packages/mcp-server/src/tools/base.ts`
- Test: add coverage in relevant tool tests

- [ ] **Step 1: Add error classifier**

Map messages containing `resource.dashboard 不存在` or equivalent response code to `NOT_FOUND`.

- [ ] **Step 2: Preserve raw details**

Return stable code and user-safe message, but keep raw service message in a `details` or `cause` field for debugging.

- [ ] **Step 3: Test normalized not-found**

Expected:

- no `INTERNAL_ERROR` for dashboard not found
- message explains ID/folder/permission possibilities without claiming one as fact

### Task 10: Update tool descriptions, prompt, and Skill

**Files:**

- Modify: `packages/mcp-server/src/tools/datart-dashboard-execute.ts`
- Modify: `packages/mcp-server/src/tools/datart-dashboard-list.ts`
- Modify: `packages/mcp-server/src/tools/datart-data-execute.ts`
- Modify: `packages/mcp-server/src/chat/system-prompt.ts`
- Modify: `packages/skills/definitions/datart-dashboard/SKILL.md`

- [ ] **Step 1: Clarify execution contract**

Descriptions should say:

- pass raw name/ref to the business execution tool
- do not invent IDs
- never use `folderId` for execution
- if candidates are returned, ask the user to choose

- [ ] **Step 2: Reduce keyword-routing dependence**

Avoid wording that teaches the model to route by broad keywords alone. Prefer workflow rules and tool contracts.

- [ ] **Step 3: Run contract tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/skill-tool-contract.test.ts src/tools/__tests__/tool-domain-registry.test.ts
```

Expected: pass.

## Chunk 6: Final Verification

### Task 11: Run full verification

**Files:**

- No new files.

- [ ] **Step 1: Run full mcp-server tests**

Run:

```bash
pnpm --filter @bicli/mcp-server test
```

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run:

```bash
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

- [ ] **Step 3: Manual scenario verification**

Use a real environment and ask:

```text
执行下 WGT-Widget-创意分析看板
```

Expected:

- tool receives raw name/ref
- resolver returns a real executable ID from `relId`
- detail call uses the resolved ID
- chart and view units are both planned
- execution results include success/failure per unit
- no short guessed ID appears
- no `resource.dashboard 不存在` unless the resolver truly cannot find the resource

### Task 12: Completion notes

**Files:**

- Optionally update implementation notes in the final response only.

- [ ] **Step 1: Summarize behavior change**

Include:

- what now resolves IDs
- what now executes
- what still returns unsupported
- how to verify in deployment

- [ ] **Step 2: Do not commit unless requested**

The repository may contain unrelated user changes. Do not commit automatically.
