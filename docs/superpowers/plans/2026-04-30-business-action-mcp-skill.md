# Business Action MCP and Skill System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize BiCLI MCP tools and Skills around business actions so the model completes user goals such as onboarding users, importing tables, and executing dashboards without manually guessing low-level API sequences.

**Architecture:** Keep atomic tools available but add preferred business-action tools with built-in validation, dry-run preview, confirmation, execution, and verification. Introduce domain-based tool registration so both MCP server registration and `/chat` tool mapping are generated from the same source. Update Skills to guide the model toward business-action tools instead of raw API chains.

**Tech Stack:** TypeScript, Node.js, MCP SDK, existing BiCLI tool handlers, DataEye HTTP proxy helpers, Vitest, Markdown Skill definitions.

---

对应设计：`docs/2026-04-30-business-action-mcp-skill-design.md`

## File Structure

Create:

- `packages/mcp-server/src/tools/tool-domain-registry.ts`
- `packages/mcp-server/src/tools/business/user-onboard.ts`
- `packages/mcp-server/src/tools/business/table-import-create.ts`
- `packages/mcp-server/src/tools/business/__tests__/user-onboard.test.ts`
- `packages/mcp-server/src/tools/business/__tests__/table-import-create.test.ts`
- `packages/skills/definitions/dataeye-user-onboarding/SKILL.md`
- `packages/skills/definitions/dataeye-table-import/SKILL.md`

Modify:

- `packages/mcp-server/src/tools/register.ts`
- `packages/mcp-server/src/http-server.ts`
- `packages/mcp-server/src/chat/system-prompt.ts`
- `packages/skills/definitions/dataeye-user-role-management/SKILL.md`
- `packages/skills/definitions/dataeye-table-management/SKILL.md`
- `packages/skills/definitions/datart-dashboard/SKILL.md`
- Existing DataEye user/table tool descriptions where needed.

## Chunk 1: Domain-Based Tool Registry

### Task 1: Introduce `tool-domain-registry.ts`

**Files:**

- Create: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Modify: `packages/mcp-server/src/tools/register.ts`
- Test: `packages/mcp-server/src/tools/__tests__/tool-domain-registry.test.ts`

- [ ] **Step 1: Write registry tests**

Cover:

- Domain registry returns DataEye tools only when DataEye is enabled.
- Visualization tools are omitted when visualization API URL is absent.
- Preferred business tools and advanced tools are both included in MCP list unless `internal=true`.
- Tool names are unique.

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/tool-domain-registry.test.ts
```

Expected: fail because `tool-domain-registry.ts` does not exist.

- [ ] **Step 2: Implement registry types**

Define:

```ts
export interface ToolDef {
  name: string;
  description: string;
  schema?: any;
  inputSchema?: Record<string, unknown>;
  requiredPermissions: string[];
  destructive?: boolean | string[];
  internal?: boolean;
  tier?: "business" | "atomic" | "internal";
  domain: string;
  handler: ToolHandler;
}

export interface ToolDomain {
  domain: string;
  enabled: (env: NodeJS.ProcessEnv) => boolean;
  tools: ToolDef[];
}
```

- [ ] **Step 3: Move existing static arrays into domains**

Create domains:

- `coreDomain`
- `dataeyeDomain`
- `visualizationDomain`

Keep existing handlers and tool definitions unchanged in this step.

- [ ] **Step 4: Refactor `register.ts` to use domains**

Replace local `tools`, `dateyeTools`, and visualization tool arrays with:

```ts
const allTools = getEnabledTools(process.env);
```

Preserve audit logging and MCP response shape.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/__tests__/tool-domain-registry.test.ts
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

## Chunk 2: Unify `/chat` Tool Mapping

### Task 2: Remove duplicate manual tool mapping in `http-server.ts`

**Files:**

- Modify: `packages/mcp-server/src/http-server.ts`
- Modify: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Test: `packages/mcp-server/src/tools/__tests__/tool-domain-registry.test.ts`

- [ ] **Step 1: Add async loader for chat tools**

Extend registry with:

```ts
export async function loadChatToolRegistry(env: NodeJS.ProcessEnv): Promise<{
  handlers: Record<string, ToolHandler>;
  definitions: ToolDefinition[];
}>
```

It should produce the same handlers and definitions used by MCP registration.

- [ ] **Step 2: Replace `initToolHandlers` manual import list**

In `http-server.ts`, replace `Promise.all([...manual imports])` and positional `mods[n]` access with `loadChatToolRegistry(process.env)`.

- [ ] **Step 3: Add regression test for dashboard execute registration**

Assert `dataeye_dashboard_execute` is present when visualization tools are enabled.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

## Chunk 3: User Onboarding Business Tool

### Task 3: Implement `dataeye_user_onboard`

**Files:**

- Create: `packages/mcp-server/src/tools/business/user-onboard.ts`
- Create: `packages/mcp-server/src/tools/business/__tests__/user-onboard.test.ts`
- Modify: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Modify: `packages/mcp-server/src/tools/dataeye-user-create.ts`
- Modify: `packages/mcp-server/src/tools/dataeye-user-assign-role.ts`

- [ ] **Step 1: Write dry-run test**

Input:

```ts
{
  email: "analyst@example.com",
  username: "Data Analyst",
  roleIdList: ["role_1"],
  dryRun: true
}
```

Expected:

- No write request is sent.
- Result contains planned actions: duplicate check, role validation, create user, assign roles, verify.

- [ ] **Step 2: Write duplicate-user test**

Mock `dataeye_user_list` response with an existing email.

Expected:

- Tool returns `success=false`.
- Error explains that the user already exists.
- No create request is sent.

- [ ] **Step 3: Write confirmed execution test**

Mock:

- User list returns empty.
- Role list returns selected roles.
- User create returns user ID.
- User detail/list verification returns created user.

Expected:

- Tool sends create request once.
- Tool verifies role assignment.
- Result includes created user and roles.

- [ ] **Step 4: Implement minimal tool**

Export:

```ts
export async function dataeyeUserOnboard(...)
export const dataeyeUserOnboardDef = { name: "dataeye_user_onboard", ... }
```

Input schema:

- `email` required.
- `username` required.
- `roleIdList` optional.
- `roleNameKeywords` optional.
- `phone` optional.
- `orgAuthFlag` optional.
- `dryRun` default `true`.
- `_context` required.

- [ ] **Step 5: Register as business tool**

Add it to `dataeyeDomain` with `tier: "business"`.

- [ ] **Step 6: Run tests and build**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/business/__tests__/user-onboard.test.ts
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

## Chunk 4: Table Import Create Business Tool

### Task 4: Implement `dataeye_table_import_create`

**Files:**

- Create: `packages/mcp-server/src/tools/business/table-import-create.ts`
- Create: `packages/mcp-server/src/tools/business/__tests__/table-import-create.test.ts`
- Modify: `packages/mcp-server/src/tools/tool-domain-registry.ts`
- Modify: existing file/session upload helpers if a reusable uploaded-file reference already exists.

- [ ] **Step 1: Inspect existing upload/file capabilities**

Search for uploaded file handling in:

- `packages/mcp-server/src`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench`

Document whether the backend already exposes file bytes, file IDs, or only chat attachments.

- [ ] **Step 2: Write dry-run field inference test**

Use a small CSV-like sample:

```csv
event_time,user_id,pay_amount
2026-04-01,u1,12.5
```

Expected:

- `event_time` inferred as datetime.
- `user_id` inferred as varchar.
- `pay_amount` inferred as number.
- No table create request is sent.

- [ ] **Step 3: Write missing-import-interface test**

If no data import API is available, confirmed execution must:

- Create the table only if user explicitly confirms table creation.
- Return `dataImportStatus: "not_supported"` or equivalent.
- Never claim rows were uploaded.

- [ ] **Step 4: Implement table plan builder**

Create pure helpers:

- `parseTabularSample`
- `inferDataType`
- `buildFieldMappings`
- `buildCreateTablePreview`

- [ ] **Step 5: Implement tool wrapper**

Input schema:

- `projectId`
- `fileId` or `sampleRows`
- `tableName`
- `remark`
- `ctType`
- `fieldMappings`
- `dryRun`
- `_context`

Behavior:

- Validate project and table name.
- Call `dataeye_table_validate_name`.
- Build create-table body.
- In dry-run, return preview only.
- In confirmed mode, call `dataeye_table_create`.
- Return explicit import support status.

- [ ] **Step 6: Register as business tool**

Add to `dataeyeDomain` with `tier: "business"`.

- [ ] **Step 7: Run tests and build**

Run:

```bash
pnpm --filter @bicli/mcp-server test -- src/tools/business/__tests__/table-import-create.test.ts
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

## Chunk 5: Skill Updates

### Task 5: Replace API-chain Skills with business workflow Skills

**Files:**

- Create: `packages/skills/definitions/dataeye-user-onboarding/SKILL.md`
- Create: `packages/skills/definitions/dataeye-table-import/SKILL.md`
- Modify: `packages/skills/definitions/dataeye-user-role-management/SKILL.md`
- Modify: `packages/skills/definitions/dataeye-table-management/SKILL.md`
- Modify: `packages/skills/definitions/datart-dashboard/SKILL.md`

- [ ] **Step 1: Create `dataeye-user-onboarding` Skill**

Required content:

- Trigger terms: 创建用户、新增成员、开通账号、分配角色。
- Preferred tool: `dataeye_user_onboard`.
- Missing-info rules.
- dryRun confirmation rules.
- Admin/permission escalation warning.
- Duplicate-user handling.

- [ ] **Step 2: Create `dataeye-table-import` Skill**

Required content:

- Trigger terms: 上传文件建表、Excel 导入、CSV 导入、根据文件创建表。
- Preferred tool: `dataeye_table_import_create`.
- Field inference rules.
- User confirmation rules.
- Import API unsupported fallback.

- [ ] **Step 3: Update existing Skills**

Change existing Skills to point to business-action tools first:

- `dataeye-user-role-management`: keep role management details, delegate new-user flow to `dataeye_user_onboard`.
- `dataeye-table-management`: keep manual table management, delegate file upload/import flow to `dataeye_table_import_create`.
- `datart-dashboard`: delegate real dashboard data execution to `dataeye_dashboard_execute`.

- [ ] **Step 4: Check Skill metadata**

Ensure:

- `name` is lowercase with hyphens.
- `description` includes what and when.
- No internal service names are used in model-facing text.
- SKILL.md stays under 500 lines.

## Chunk 6: Prompt and Tool Description Alignment

### Task 6: Align system prompt and tool descriptions

**Files:**

- Modify: `packages/mcp-server/src/chat/system-prompt.ts`
- Modify: `packages/mcp-server/src/tools/dataeye-user-create.ts`
- Modify: `packages/mcp-server/src/tools/dataeye-user-assign-role.ts`
- Modify: `packages/mcp-server/src/tools/dataeye-table-create.ts`
- Modify: `packages/mcp-server/src/tools/datart-data-execute.ts`

- [ ] **Step 1: Add global business-action rule**

In system prompt, add concise rule:

> When both a business-action tool and several atomic tools can satisfy the user's goal, prefer the business-action tool.

- [ ] **Step 2: Update atomic write tool descriptions**

Descriptions should say:

- This is a single-step tool.
- Prefer the business-action tool for complete user workflows.
- Write operation requires explicit confirmation.

- [ ] **Step 3: Keep prompt small**

Do not move full workflows into `system-prompt.ts`; workflows belong in Skills.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0.

## Chunk 7: End-to-End Verification

### Task 7: Verify routing behavior with representative prompts

**Files:**

- Modify or create existing chat/tool routing tests if present.
- Otherwise document manual verification results in PR notes.

- [ ] **Step 1: Test user onboarding prompt**

Prompt:

```text
帮我创建一个用户 analyst@example.com，名字叫 Data Analyst，分配数据分析师角色
```

Expected:

- Uses `dataeye_user_onboard`.
- If role cannot be resolved, asks for role selection.
- Does not manually call user create first.

- [ ] **Step 2: Test file import prompt**

Prompt:

```text
我上传了一个 CSV，帮我创建数据表并导入
```

Expected:

- Uses `dataeye_table_import_create`.
- Infers fields from sample if available.
- Does not ask user to hand-write full JSON.

- [ ] **Step 3: Test dashboard prompt**

Prompt:

```text
帮我分析这个看板的真实数据
```

Expected:

- Uses `dataeye_dashboard_execute`.
- Does not call `dataeye_chart_data_execute` with `vizType=DASHBOARD`.

- [ ] **Step 4: Full backend checks**

Run:

```bash
pnpm --filter @bicli/mcp-server test
pnpm --filter @bicli/mcp-server build
```

Expected: exit 0, except any documented environment-only Node engine warning.

## Acceptance Criteria

- `register.ts` and `/chat` no longer maintain separate hand-written tool lists.
- New business-action tools are registered and visible to the model.
- Atomic write tools remain available but point users/model toward business-action tools.
- User onboarding can be dry-run previewed, confirmed, executed, and verified.
- File upload table creation can infer fields and honestly reports whether data import execution is supported.
- Skills guide the model by business workflow instead of raw API chains.
- Existing dashboard execution remains registered and preferred for dashboard data analysis.
