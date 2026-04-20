# BiCLI 三期实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 BiCLI 增加审计日志、敏感操作确认、审批工作流、会话持久化、工具调用展示和 Token 认证，使系统达到生产级安全标准。

**Architecture:** 双层混合模式——MCP 层负责审计日志（数据网关），Core 层负责操作确认（UI 交互）。新增审批工作流场景证明多步编排能力。会话持久化写入 `~/.bicli/sessions/`，Token 使用 HMAC 签名。

**Tech Stack:** TypeScript, Drizzle ORM (MySQL), Vitest, Ink 7 (React for CLI), AI SDK 6, MCP SDK 1.29

**Spec:** `docs/2026-04-16-bicli-phase3-design.md`

---

## File Map

### MCP Server (`packages/mcp-server/`)

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/db/schema.ts` | 修改 | 新增 `auditLogs`、`approvals`、`approvalActions` 表 |
| `src/db/seed.ts` | 修改 | 新增权限、审批 Mock、data_scope_rules |
| `src/utils/sanitize.ts` | 新建 | `sanitize`、`truncate`、`extractAction`、`extractResourceType` |
| `src/middleware/audit.ts` | 新建 | `writeAuditLog` 函数 |
| `src/tools/register.ts` | 修改 | 统一审计入口、`ToolDef` 扩展 `destructive`、`internal` 标记 |
| `src/tools/audit-query.ts` | 新建 | 审计日志查询 |
| `src/tools/audit-write.ts` | 新建 | 内部审计写入（Core denied 用） |
| `src/tools/approval-submit.ts` | 新建 | 提交审批 |
| `src/tools/approval-review.ts` | 新建 | 审批操作（通过/驳回/转审） |
| `src/tools/approval-query.ts` | 新建 | 审批查询 |
| `src/auth/data-scope.ts` | 修改 | 支持多字段 OR 条件 |
| `src/auth/rbac.ts` | 修改 | `extractContext` Token 分支 |
| `src/auth/token.ts` | 新建 | `generateToken`、`verifyToken` |
| `src/types/index.ts` | 修改 | `ToolContext` 扩展 `token?`、`ip?` |

### Core (`packages/core/`)

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/types.ts` | 修改 | `ChatEvent` 判别联合、`AuthContext` 重命名 |
| `src/engine.ts` | 修改 | 确认拦截、工具计时、session 工具记录 |
| `src/llm/session.ts` | 修改 | `recordToolCall`/`recordToolResult`、`SessionPersister` 注入 |
| `src/storage/session-persister.ts` | 新建 | 会话文件 IO |
| `src/slash-commands/handler.ts` | 修改 | `/history`、`/save`、`/title` 命令 |
| `src/slash-commands/types.ts` | 修改 | 新增 result 类型 |

### CLI (`packages/cli/`)

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/tui/components/ConfirmDialog.tsx` | 新建 | 敏感操作确认弹框 |
| `src/tui/components/ChatArea.tsx` | 修改 | 工具调用完整展示 |
| `src/tui/App.tsx` | 修改 | 确认流程集成、历史命令渲染 |

### Skills (`packages/skills/`)

| 文件 | 操作 | 职责 |
|------|------|------|
| `definitions/approval-workflow/SKILL.md` | 新建 | 审批技能 |
| `definitions/approval-workflow/reference/approval-api.md` | 新建 | 审批 API 参考 |
| `definitions/audit-viewer/SKILL.md` | 新建 | 审计查看技能 |
| `definitions/audit-viewer/reference/audit-api.md` | 新建 | 审计 API 参考 |
| `definitions/session-manager/SKILL.md` | 新建 | 会话管理技能 |

---

## Chunk 1: Phase 3a — 安全基座 + 审批工作流

### Task 1: 数据库 Schema 扩展

**Files:**
- Modify: `packages/mcp-server/src/db/schema.ts`
- Test: `packages/mcp-server/tests/schema.test.ts`

- [ ] **Step 1: 在 schema.ts 末尾新增三张表定义**

```typescript
// packages/mcp-server/src/db/schema.ts — 追加到文件末尾

export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  userRole: varchar("user_role", { length: 50 }).notNull(),
  toolName: varchar("tool_name", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId: varchar("resource_id", { length: 100 }),
  inputSummary: json("input_summary"),
  outputSummary: json("output_summary"),
  status: mysqlEnum("status", ["success", "failed", "denied", "confirmed"]).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  durationMs: int("duration_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const approvals = mysqlTable("approvals", {
  id: serial().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  content: json("content").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending"),
  submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }).notNull(),
  reviewerId: bigint("reviewer_id", { mode: "number", unsigned: true }).notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: varchar("review_comment", { length: 500 }),
  relatedResourceType: varchar("related_resource_type", { length: 50 }),
  relatedResourceId: bigint("related_resource_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const approvalActions = mysqlTable("approval_actions", {
  id: serial().primaryKey(),
  approvalId: bigint("approval_id", { mode: "number", unsigned: true }).notNull(),
  actorId: bigint("actor_id", { mode: "number", unsigned: true }).notNull(),
  action: mysqlEnum("action", ["submit", "approve", "reject", "cancel", "reassign"]).notNull(),
  comment: varchar("comment", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});
```

- [ ] **Step 2: 确保需要的 drizzle 导入**

检查 `schema.ts` 顶部 import，确保包含 `bigint`, `mysqlEnum`, `int`, `json`, `timestamp`。如缺少则补充：

```typescript
import { mysqlTable, varchar, serial, timestamp, json, int, bigint, mysqlEnum } from "drizzle-orm/mysql-core";
```

- [ ] **Step 3: 推送表结构到数据库**

Run: `pnpm db:push`
Expected: 成功创建 `audit_logs`、`approvals`、`approval_actions` 三张表，无错误。

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/db/schema.ts
git commit -m "feat(mcp): add audit_logs, approvals, approval_actions schema"
```

---

### Task 2: 脱敏工具函数

**Files:**
- Create: `packages/mcp-server/src/utils/sanitize.ts`
- Test: `packages/mcp-server/tests/utils/sanitize.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// packages/mcp-server/tests/utils/sanitize.test.ts
import { describe, it, expect } from "vitest";
import { sanitize, truncate, extractAction, extractResourceType, extractResourceId } from "../../src/utils/sanitize.js";

describe("sanitize", () => {
  it("masks password fields", () => {
    const result = sanitize({ username: "alice", password: "secret123", _context: { userId: 1 } });
    expect(result.password).toBe("***");
    expect(result.username).toBe("alice");
    expect(result._context).toBeUndefined();
  });

  it("masks token and apiKey fields", () => {
    const result = sanitize({ token: "abc", apiKey: "xyz", data: "ok" });
    expect(result.token).toBe("***");
    expect(result.apiKey).toBe("***");
    expect(result.data).toBe("ok");
  });
});

describe("truncate", () => {
  it("truncates long strings", () => {
    const long = { data: "x".repeat(1000) };
    const result = truncate(long, 100);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(150);
  });

  it("passes through short objects", () => {
    const short = { ok: true };
    expect(truncate(short, 500)).toEqual(short);
  });
});

describe("extractAction", () => {
  it("extracts action from input", () => {
    expect(extractAction("user_manage", { action: "delete" })).toBe("delete");
    expect(extractAction("form_create", {})).toBe("create");
    expect(extractAction("approval_submit", {})).toBe("submit");
    expect(extractAction("audit_query", {})).toBe("query");
  });
});

describe("extractResourceType", () => {
  it("extracts resource from tool name", () => {
    expect(extractResourceType("user_manage")).toBe("user");
    expect(extractResourceType("form_create")).toBe("form");
    expect(extractResourceType("approval_submit")).toBe("approval");
    expect(extractResourceType("data_query")).toBe("data");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @bicli/mcp-server test -- tests/utils/sanitize.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 sanitize.ts**

```typescript
// packages/mcp-server/src/utils/sanitize.ts

const SENSITIVE_KEYS = new Set(["password", "token", "apiKey", "api_key", "secret", "authorization"]);

export function sanitize(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key === "_context") continue;
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = "***";
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function truncate(obj: unknown, maxLen: number): unknown {
  const str = JSON.stringify(obj);
  if (str.length <= maxLen) return obj;
  return { _truncated: true, preview: str.slice(0, maxLen) + "..." };
}

export function extractAction(toolName: string, input: unknown): string {
  const args = (input && typeof input === "object") ? input as Record<string, unknown> : {};
  if (typeof args.action === "string") return args.action;
  const parts = toolName.split("_");
  return parts[parts.length - 1] || "unknown";
}

export function extractResourceType(toolName: string): string {
  const parts = toolName.split("_");
  return parts[0] || "unknown";
}

export function extractResourceId(input: unknown, result: unknown): string | null {
  const args = (input && typeof input === "object") ? input as Record<string, unknown> : {};
  for (const key of ["id", "userId", "formId", "approvalId", "roleId"]) {
    if (args[key] != null) return String(args[key]);
  }
  const res = (result && typeof result === "object") ? result as Record<string, unknown> : {};
  const data = (res.data && typeof res.data === "object") ? res.data as Record<string, unknown> : {};
  if (data.id != null) return String(data.id);
  return null;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @bicli/mcp-server test -- tests/utils/sanitize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/utils/sanitize.ts packages/mcp-server/tests/utils/sanitize.test.ts
git commit -m "feat(mcp): add sanitize/truncate utils for audit logging"
```

---

### Task 3: 审计中间件 + register.ts 改造

**Files:**
- Create: `packages/mcp-server/src/middleware/audit.ts`
- Modify: `packages/mcp-server/src/tools/register.ts`

- [ ] **Step 1: 创建 audit.ts**

```typescript
// packages/mcp-server/src/middleware/audit.ts
import type { Database } from "../db/index.js";
import { auditLogs } from "../db/schema.js";
import { sanitize, truncate, extractAction, extractResourceType, extractResourceId } from "../utils/sanitize.js";

interface AuditEntry {
  userId: number;
  userRole: string;
  toolName: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  inputSummary: unknown;
  outputSummary: unknown;
  status: "success" | "failed" | "denied" | "confirmed";
  ipAddress: string | null;
  durationMs: number;
}

export async function writeAuditLog(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId,
    userRole: entry.userRole,
    toolName: entry.toolName,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    inputSummary: entry.inputSummary,
    outputSummary: entry.outputSummary,
    status: entry.status,
    ipAddress: entry.ipAddress,
    durationMs: entry.durationMs,
  });
}

export function buildAuditEntry(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  status: AuditEntry["status"],
  durationMs: number,
): AuditEntry {
  const ctx = (args?._context || {}) as Record<string, unknown>;
  return {
    userId: (ctx.userId as number) || 0,
    userRole: (ctx.role as string) || "unknown",
    toolName,
    action: extractAction(toolName, args),
    resourceType: extractResourceType(toolName),
    resourceId: extractResourceId(args, result),
    inputSummary: sanitize(args),
    outputSummary: truncate(result, 500),
    status,
    ipAddress: (ctx.ip as string) || null,
    durationMs,
  };
}
```

- [ ] **Step 2: 改造 register.ts — 在 CallToolRequestSchema handler 中加入审计**

打开 `packages/mcp-server/src/tools/register.ts`，找到 `CallToolRequestSchema` handler，在 `tool.handler(db, args)` 调用前后包裹审计逻辑。同时扩展 `ToolDef` 接口添加 `destructive` 和 `internal` 字段。

关键改动：
1. `ToolDef` 接口添加 `destructive?: boolean | string[]` 和 `internal?: boolean`
2. `ListToolsRequestSchema` handler 中过滤掉 `internal: true` 的工具，并在 `_meta` 中暴露 `destructive`
3. `CallToolRequestSchema` handler 用 try/catch/finally 包裹，finally 中调用 `writeAuditLog`

- [ ] **Step 3: 在 register.ts 的 ListToolsRequestSchema 中过滤内部工具 + 暴露 destructive**

在返回 tools 列表时，过滤掉 `tool.internal === true`，并在 `_meta` 中加入 `destructive` 字段。

- [ ] **Step 4: 验证 MCP Server 启动正常**

Run: `pnpm --filter @bicli/mcp-server build && tsx packages/cli/bin/bicli.ts mcp status`
Expected: MCP Server connected，工具列表不含 `audit_write`

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/middleware/audit.ts packages/mcp-server/src/tools/register.ts
git commit -m "feat(mcp): add audit middleware and register.ts audit integration"
```

---

### Task 4: audit_query + audit_write 工具

**Files:**
- Create: `packages/mcp-server/src/tools/audit-query.ts`
- Create: `packages/mcp-server/src/tools/audit-write.ts`
- Modify: `packages/mcp-server/src/tools/register.ts` (注册新工具)

- [ ] **Step 1: 实现 audit-query.ts**

```typescript
// packages/mcp-server/src/tools/audit-query.ts
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { auditLogs } from "../db/schema.js";
import { withAuth } from "./base.js";
import { formatSuccess, formatError } from "./base.js";

export async function auditQuery(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["audit:read"], async (db, cleanArgs) => {
    const {
      userId, toolName, resourceType, action,
      startTime, endTime,
      page = 1, pageSize = 20,
    } = cleanArgs as Record<string, any>;

    const conditions = [];
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (toolName) conditions.push(eq(auditLogs.toolName, toolName));
    if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
    if (action) conditions.push(eq(auditLogs.action, action));
    if (startTime) conditions.push(gte(auditLogs.createdAt, new Date(startTime)));
    if (endTime) conditions.push(lte(auditLogs.createdAt, new Date(endTime)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (Number(page) - 1) * Number(pageSize);

    const [items, countResult] = await Promise.all([
      db.select().from(auditLogs).where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(Number(pageSize)).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
    ]);

    return formatSuccess({
      items,
      total: countResult[0]?.count || 0,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  });
}
```

- [ ] **Step 2: 实现 audit-write.ts (内部工具)**

```typescript
// packages/mcp-server/src/tools/audit-write.ts
import type { Database } from "../db/index.js";
import { writeAuditLog } from "../middleware/audit.js";
import { formatSuccess } from "./base.js";

export async function auditWrite(db: Database, args: Record<string, unknown>) {
  const { userId, userRole, toolName, action, status, summary } = args as Record<string, any>;
  await writeAuditLog(db, {
    userId: Number(userId),
    userRole: String(userRole),
    toolName: String(toolName),
    action: String(action),
    resourceType: null,
    resourceId: null,
    inputSummary: summary ? { summary } : null,
    outputSummary: null,
    status: status || "denied",
    ipAddress: null,
    durationMs: 0,
  });
  return formatSuccess({ written: true });
}
```

- [ ] **Step 3: 在 register.ts 中注册两个新工具**

在 tools 数组中添加 `audit_query`（requiredPermissions: `["audit:read"]`）和 `audit_write`（internal: true）。

- [ ] **Step 4: 验证 MCP status 显示 audit_query 但不显示 audit_write**

Run: `tsx packages/cli/bin/bicli.ts mcp status`
Expected: 工具列表包含 `audit_query`，不包含 `audit_write`

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/tools/audit-query.ts packages/mcp-server/src/tools/audit-write.ts packages/mcp-server/src/tools/register.ts
git commit -m "feat(mcp): add audit_query and audit_write tools"
```

---

### Task 5: applyDataScope 多字段 OR 支持

**Files:**
- Modify: `packages/mcp-server/src/auth/data-scope.ts`
- Test: `packages/mcp-server/tests/auth/data-scope.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// packages/mcp-server/tests/auth/data-scope.test.ts
import { describe, it, expect } from "vitest";

describe("applyDataScope with multi-field ownerField", () => {
  it("generates OR condition for comma-separated ownerField", () => {
    // 验证 ownerField = "submitted_by,reviewer_id" 生成 OR 条件
    // 此测试需要 mock tableRef 和 context，具体实现见 step 3
  });

  it("single field works as before", () => {
    // 向下兼容：单字段 ownerField 仍然生成 eq 条件
  });
});
```

- [ ] **Step 2: 修改 data-scope.ts**

在 `scopeType === "own"` 分支中，检查 `ownerField` 是否包含逗号：

```typescript
import { or, eq } from "drizzle-orm";

// 替换原有 scopeType === "own" 分支
if (rule.scopeType === "own" && rule.ownerField) {
  const fields = rule.ownerField.split(",");
  const orConditions = fields
    .map(f => resolveColumn(tableRef, f.trim()))
    .filter(Boolean)
    .map(col => eq(col!, context.userId));
  if (orConditions.length === 1) {
    conditions.push(orConditions[0]);
  } else if (orConditions.length > 1) {
    conditions.push(or(...orConditions)!);
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @bicli/mcp-server test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/auth/data-scope.ts packages/mcp-server/tests/auth/data-scope.test.ts
git commit -m "feat(mcp): support multi-field OR in applyDataScope"
```

---

### Task 6: 审批工具 — approval_submit

**Files:**
- Create: `packages/mcp-server/src/tools/approval-submit.ts`
- Modify: `packages/mcp-server/src/tools/register.ts`

- [ ] **Step 1: 实现 approval-submit.ts**

```typescript
// packages/mcp-server/src/tools/approval-submit.ts
import { eq } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { approvals, approvalActions, users } from "../db/schema.js";
import { withAuth } from "./base.js";
import { formatSuccess, formatError } from "./base.js";

export async function approvalSubmit(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["approval:write"], async (db, cleanArgs, context) => {
    const { title, type, content, reviewerId, relatedResourceType, relatedResourceId } = cleanArgs as any;

    if (!title || !type || !content || !reviewerId) {
      return formatError("VALIDATION_ERROR", "title, type, content, reviewerId 均为必填");
    }

    if (reviewerId === context.userId) {
      return formatError("VALIDATION_ERROR", "不能指定自己为审批人");
    }

    const [reviewer] = await db.select().from(users)
      .where(eq(users.id, Number(reviewerId))).limit(1);
    if (!reviewer || reviewer.status !== "active") {
      return formatError("VALIDATION_ERROR", "审批人不存在或已停用");
    }

    const [result] = await db.insert(approvals).values({
      title: String(title),
      type: String(type),
      content,
      submittedBy: context.userId,
      reviewerId: Number(reviewerId),
      relatedResourceType: relatedResourceType ? String(relatedResourceType) : null,
      relatedResourceId: relatedResourceId ? Number(relatedResourceId) : null,
    }).$returningId();

    await db.insert(approvalActions).values({
      approvalId: result.id,
      actorId: context.userId,
      action: "submit",
    });

    return formatSuccess({
      id: result.id,
      title,
      type,
      status: "pending",
      submittedBy: context.userId,
      reviewerId: Number(reviewerId),
    });
  });
}
```

- [ ] **Step 2: 注册到 register.ts**

添加 `approval_submit`，`requiredPermissions: ["approval:write"]`。

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-server/src/tools/approval-submit.ts packages/mcp-server/src/tools/register.ts
git commit -m "feat(mcp): add approval_submit tool"
```

---

### Task 7: 审批工具 — approval_review（含乐观锁）

**Files:**
- Create: `packages/mcp-server/src/tools/approval-review.ts`
- Modify: `packages/mcp-server/src/tools/register.ts`

- [ ] **Step 1: 实现 approval-review.ts**

```typescript
// packages/mcp-server/src/tools/approval-review.ts
import { eq, and, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { approvals, approvalActions, users } from "../db/schema.js";
import { withAuth } from "./base.js";
import { formatSuccess, formatError } from "./base.js";

export async function approvalReview(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["approval:review"], async (db, cleanArgs, context) => {
    const { approvalId, action, comment, reassignTo } = cleanArgs as any;

    if (!approvalId || !action) {
      return formatError("VALIDATION_ERROR", "approvalId 和 action 为必填");
    }

    const [approval] = await db.select().from(approvals)
      .where(eq(approvals.id, Number(approvalId))).limit(1);

    if (!approval) return formatError("NOT_FOUND", "审批单不存在");
    if (approval.status !== "pending") return formatError("CONFLICT", "审批单已处理，当前状态: " + approval.status);

    if (action === "approve" || action === "reject") {
      if (approval.reviewerId !== context.userId) {
        return formatError("FORBIDDEN", "只有指定审批人可以审批");
      }
      if (approval.submittedBy === context.userId) {
        return formatError("FORBIDDEN", "不能审批自己提交的申请");
      }

      // 乐观锁：WHERE status = 'pending'
      const updateResult = await db.update(approvals)
        .set({
          status: action === "approve" ? "approved" : "rejected",
          reviewedAt: sql`NOW()`,
          reviewComment: comment ? String(comment) : null,
        })
        .where(and(eq(approvals.id, Number(approvalId)), eq(approvals.status, "pending")));

      // @ts-ignore — drizzle mysql 返回的 changedRows
      if (updateResult[0]?.affectedRows === 0) {
        return formatError("CONFLICT", "审批单已被其他人处理");
      }
    } else if (action === "reassign") {
      if (!reassignTo) return formatError("VALIDATION_ERROR", "转审需要 reassignTo 参数");
      const [target] = await db.select().from(users).where(eq(users.id, Number(reassignTo))).limit(1);
      if (!target || target.status !== "active") return formatError("VALIDATION_ERROR", "目标用户不存在或已停用");

      await db.update(approvals)
        .set({ reviewerId: Number(reassignTo) })
        .where(eq(approvals.id, Number(approvalId)));
    } else {
      return formatError("VALIDATION_ERROR", "无效的 action，可选: approve, reject, reassign");
    }

    await db.insert(approvalActions).values({
      approvalId: Number(approvalId),
      actorId: context.userId,
      action,
      comment: comment ? String(comment) : null,
    });

    return formatSuccess({
      approvalId: Number(approvalId),
      action,
      message: action === "approve" ? "已通过" : action === "reject" ? "已驳回" : "已转审",
    });
  });
}
```

- [ ] **Step 2: 注册到 register.ts，标记 destructive: ["reject"]**

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-server/src/tools/approval-review.ts packages/mcp-server/src/tools/register.ts
git commit -m "feat(mcp): add approval_review tool with optimistic locking"
```

---

### Task 8: 审批工具 — approval_query

**Files:**
- Create: `packages/mcp-server/src/tools/approval-query.ts`
- Modify: `packages/mcp-server/src/tools/register.ts`

- [ ] **Step 1: 实现 approval-query.ts**

实现要点：
- 查详情时联查 `approval_actions`
- 列表查询接入 `data_scope_rules`（使用 `getDataScopeRules` + `applyDataScope`）
- 分页 + 排序

- [ ] **Step 2: 注册到 register.ts**

requiredPermissions: `["approval:read"]`

- [ ] **Step 3: Commit**

```bash
git add packages/mcp-server/src/tools/approval-query.ts packages/mcp-server/src/tools/register.ts
git commit -m "feat(mcp): add approval_query tool with data scope"
```

---

### Task 9: 种子数据更新

**Files:**
- Modify: `packages/mcp-server/src/db/seed.ts`

- [ ] **Step 1: 在 seed.ts 中新增权限**

在角色权限部分添加：
- admin: `approval:read`, `approval:write`, `approval:review`, `audit:read`
- editor: `approval:read`, `approval:write`, `approval:review`, `audit:read`
- viewer: `approval:read`, `approval:write`

- [ ] **Step 2: 新增 data_scope_rules**

```typescript
// editor 看自己提交的 + 待自己审批的
{ roleId: editorRole.id, resource: "approval", scopeType: "own",
  ownerField: "submitted_by,reviewer_id", priority: 10 }
// viewer 只看自己提交的
{ roleId: viewerRole.id, resource: "approval", scopeType: "own",
  ownerField: "submitted_by", priority: 10 }
```

- [ ] **Step 3: 新增审批 Mock 数据**

在 TRUNCATE 列表中添加 `approvals` 和 `approval_actions`。
创建 3 条审批单 + 对应 approval_actions 记录。

- [ ] **Step 4: 运行种子脚本验证**

Run: `pnpm seed`
Expected: 成功，显示新增的审批数据

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/db/seed.ts
git commit -m "feat(mcp): update seed with approval permissions, mock data, data_scope_rules"
```

---

### Task 10: Core 确认拦截机制

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/engine.ts`

- [ ] **Step 1: 重构 ChatEvent 为判别联合类型**

```typescript
// packages/core/src/types.ts
export type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; toolName: string; args: unknown }
  | { type: "tool_call_end"; toolName: string; result: unknown; duration: number }
  | { type: "confirm_request"; toolName: string; action: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done"; fullText: string };

export interface ConfirmRequest {
  toolName: string;
  action: string;
  summary: string;
  level: "destructive" | "warning";
}
```

- [ ] **Step 2: 在 engine.ts 中添加确认机制**

1. 添加 `private confirmHandler` 和 `setConfirmHandler` 方法
2. 在 `buildAiTools` 中构建 `toolMetaMap`（从 `visibleTools` 的 `_meta` 提取 `destructive`）
3. 在 `execute` 闭包中调用 `needsConfirmation` + `requestConfirmation`
4. 用户取消时调用 `audit_write` 内部工具写入 denied 记录

- [ ] **Step 3: 在 engine.ts fullStream 中添加计时 + session 记录**

```typescript
const toolStartTimes: Record<string, number> = {};

case "tool-call":
  toolStartTimes[part.toolCallId] = Date.now();
  this.session.recordToolCall(part.toolName, part.input);
  yield { type: "tool_call_start", toolName: part.toolName, args: part.input };
  break;

case "tool-result":
  const duration = Date.now() - (toolStartTimes[part.toolCallId] || 0);
  this.session.recordToolResult(part.toolName, part.output);
  yield { type: "tool_call_end", toolName: part.toolName, result: part.output, duration };
  break;
```

- [ ] **Step 4: 修复所有 ChatEvent 消费方的类型错误**

更新 `App.tsx`、`web/src/server/index.ts` 中的 `switch(event.type)` 逻辑，使用类型收窄。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/engine.ts
git commit -m "feat(core): add confirmation mechanism and ChatEvent discriminated union"
```

---

### Task 11: TUI ConfirmDialog 组件

**Files:**
- Create: `packages/cli/src/tui/components/ConfirmDialog.tsx`
- Modify: `packages/cli/src/tui/App.tsx`

- [ ] **Step 1: 创建 ConfirmDialog.tsx**

```tsx
// packages/cli/src/tui/components/ConfirmDialog.tsx
import React from "react";
import { Box, Text, useInput } from "ink";
import type { ConfirmRequest } from "@bicli/core";

interface Props {
  request: ConfirmRequest;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ request, onConfirm, onCancel }: Props) {
  useInput((input, key) => {
    if (input.toLowerCase() === "y") onConfirm();
    else if (input.toLowerCase() === "n" || key.escape) onCancel();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>⚠️ 敏感操作确认</Text>
      <Text> </Text>
      <Text>{request.summary}</Text>
      <Text> </Text>
      <Text>
        <Text color="green" bold>[Y]</Text><Text> 确认执行    </Text>
        <Text color="red" bold>[N]</Text><Text> 取消</Text>
      </Text>
    </Box>
  );
}
```

- [ ] **Step 2: 在 App.tsx 中集成确认流程**

1. 添加 `confirmRequest` 和 `confirmResolveRef` state
2. 在 engine 初始化后注入 `setConfirmHandler`
3. 渲染时如果 `confirmRequest` 存在则显示 `ConfirmDialog`
4. 确认/取消后 resolve Promise 并清除 state

- [ ] **Step 3: 验证 TUI 启动正常**

Run: `tsx packages/cli/bin/bicli.ts chat`
Expected: TUI 正常启动，无报错

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/tui/components/ConfirmDialog.tsx packages/cli/src/tui/App.tsx
git commit -m "feat(cli): add ConfirmDialog for destructive operations"
```

---

### Task 12: TUI 工具调用完整展示

**Files:**
- Modify: `packages/cli/src/tui/components/ChatArea.tsx`
- Modify: `packages/cli/src/tui/App.tsx`

- [ ] **Step 1: 在 App.tsx 中补全 tool_call_start 和 tool_call_end 事件处理**

```typescript
case "tool_call_start":
  appendMessage({
    role: "system",
    content: `🔧 ${event.toolName}\n├─ 参数: ${formatArgs(event.args)}`
  });
  break;

case "tool_call_end":
  // 更新最后一条工具消息，追加耗时和结果
  updateLastToolMessage(
    `├─ 耗时: ${event.duration}ms\n└─ 结果: ${formatResult(event.result)}`
  );
  break;
```

- [ ] **Step 2: 实现 formatArgs 和 formatResult 辅助函数**

在 App.tsx 或独立 utils 中：
- `formatArgs`: JSON.stringify 后超 200 字符截断，敏感字段脱敏
- `formatResult`: 提取 `.data` 或 `.error`，超 200 字符截断

- [ ] **Step 3: 在 ChatArea.tsx 中优化工具消息渲染**

识别 `🔧` 开头的消息，用不同颜色渲染工具名（cyan）、参数（dim）、结果（green/red）。

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/tui/components/ChatArea.tsx packages/cli/src/tui/App.tsx
git commit -m "feat(cli): rich tool call display with args, duration, result"
```

---

### Task 13: Skill — approval-workflow + audit-viewer

**Files:**
- Create: `packages/skills/definitions/approval-workflow/SKILL.md`
- Create: `packages/skills/definitions/approval-workflow/reference/approval-api.md`
- Create: `packages/skills/definitions/audit-viewer/SKILL.md`
- Create: `packages/skills/definitions/audit-viewer/reference/audit-api.md`

- [ ] **Step 1: 创建 approval-workflow SKILL.md**

包含 frontmatter（name, description, triggers, requiredTools, requiredPermissions）和详细的使用指南（多步编排流程、常见场景、注意事项）。

- [ ] **Step 2: 创建 approval-api.md reference**

包含状态机图、字段说明、权限矩阵、API 参数详解、多步编排示例。

- [ ] **Step 3: 创建 audit-viewer SKILL.md + audit-api.md reference**

- [ ] **Step 4: Commit**

```bash
git add packages/skills/definitions/approval-workflow/ packages/skills/definitions/audit-viewer/
git commit -m "feat(skills): add approval-workflow and audit-viewer skills"
```

---

### Task 14: Phase 3a 集成验证

- [ ] **Step 1: 重新 seed 数据库**

Run: `pnpm seed`

- [ ] **Step 2: 启动 TUI 验证审批流程**

Run: `tsx packages/cli/bin/bicli.ts chat`

测试场景：
1. 输入 "帮我提交一个请假审批，下周一到周三，审批人是 bob" → 应调用 `user_list` + `approval_submit`
2. `/user bob` 切换到 bob → 输入 "查看我的待审批" → 应调用 `approval_query`
3. "通过刚才那个审批" → 应触发 `approval_review`，且看到完整的工具调用参数和结果
4. 尝试删除一个用户 → 应弹出 ConfirmDialog

- [ ] **Step 3: 验证审计日志**

输入 "查看操作日志" → 应调用 `audit_query` 返回刚才的操作记录

- [ ] **Step 4: 运行全部测试**

Run: `pnpm test`
Expected: 全部 PASS

---

## Chunk 2: Phase 3b — CLI 体验 + Token 认证

### Task 15: Session 持久化

**Files:**
- Create: `packages/core/src/storage/session-persister.ts`
- Modify: `packages/core/src/llm/session.ts`
- Modify: `packages/core/src/engine.ts`

- [ ] **Step 1: 实现 SessionPersister**

```typescript
// packages/core/src/storage/session-persister.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface PersistedMessage {
  role: "user" | "assistant" | "system" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
  timestamp: string;
}

export interface PersistedSession {
  id: string;
  title: string;
  userId: number;
  role: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: PersistedMessage[];
}

export interface SessionIndex {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export class SessionPersister {
  private sessionsDir: string;
  private currentId: string;
  private currentFile: string;
  private messageCount = 0;

  constructor(userId: number, role: string, model: string) {
    this.sessionsDir = join(homedir(), ".bicli", "sessions");
    if (!existsSync(this.sessionsDir)) mkdirSync(this.sessionsDir, { recursive: true });

    const now = new Date();
    this.currentId = `s_${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
    this.currentFile = join(this.sessionsDir, `${this.currentId}.jsonl`);

    // 写入 header 行
    const header = JSON.stringify({
      _header: true, id: this.currentId,
      userId, role, model,
      createdAt: now.toISOString(),
    });
    writeFileSync(this.currentFile, header + "\n");
  }

  async append(message: PersistedMessage): Promise<void> {
    try {
      await appendFile(this.currentFile, JSON.stringify(message) + "\n");
      this.messageCount++;
    } catch {}
  }

  load(sessionId: string): PersistedSession | null {
    const file = join(this.sessionsDir, `${sessionId}.jsonl`);
    if (!existsSync(file)) return null;
    const lines = readFileSync(file, "utf-8").trim().split("\n");
    const header = JSON.parse(lines[0]);
    const messages = lines.slice(1)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(m => m && !m._header);
    return {
      id: header.id,
      title: header.title || messages.find((m: any) => m.role === "user")?.content?.slice(0, 50) || "未命名",
      userId: header.userId,
      role: header.role,
      model: header.model,
      createdAt: header.createdAt,
      updatedAt: messages[messages.length - 1]?.timestamp || header.createdAt,
      messages,
    };
  }

  list(): SessionIndex[] {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir)
      .filter(f => f.endsWith(".jsonl"))
      .sort().reverse()
      .slice(0, 20)
      .map(f => {
        try {
          const lines = readFileSync(join(this.sessionsDir, f), "utf-8").trim().split("\n");
          const header = JSON.parse(lines[0]);
          return {
            id: header.id,
            title: header.title || "未命名",
            createdAt: header.createdAt,
            updatedAt: header.createdAt,
            messageCount: lines.length - 1,
          };
        } catch { return null; }
      })
      .filter(Boolean) as SessionIndex[];
  }

  async save(): Promise<void> {
    // JSONL 格式已实时写入，save 时更新 index
    this.updateIndex();
  }

  delete(sessionId: string): void {
    const file = join(this.sessionsDir, `${sessionId}.jsonl`);
    if (existsSync(file)) unlinkSync(file);
    this.updateIndex();
  }

  clearAll(): void {
    if (!existsSync(this.sessionsDir)) return;
    for (const f of readdirSync(this.sessionsDir)) {
      unlinkSync(join(this.sessionsDir, f));
    }
  }

  get sessionId(): string { return this.currentId; }

  setTitle(title: string): void {
    // 重写 header 行
    if (!existsSync(this.currentFile)) return;
    const lines = readFileSync(this.currentFile, "utf-8").trim().split("\n");
    const header = JSON.parse(lines[0]);
    header.title = title;
    lines[0] = JSON.stringify(header);
    writeFileSync(this.currentFile, lines.join("\n") + "\n");
  }

  private updateIndex(): void {
    const indexFile = join(this.sessionsDir, "index.json");
    const entries = this.list();
    writeFileSync(indexFile, JSON.stringify(entries, null, 2));
  }
}
```

- [ ] **Step 2: 改造 Session 类**

在 `session.ts` 中添加 `persister` 注入、`recordToolCall`、`recordToolResult` 方法（只写 persister，不污染 `ModelMessage[]`）。

- [ ] **Step 3: 在 engine.ts 中创建 SessionPersister 并注入**

在 `initialize()` 中创建 `SessionPersister`，传给 `Session` 构造函数。

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/storage/session-persister.ts packages/core/src/llm/session.ts packages/core/src/engine.ts
git commit -m "feat(core): add session persistence with JSONL storage"
```

---

### Task 16: /history /save /title 斜杠命令

**Files:**
- Modify: `packages/core/src/slash-commands/handler.ts`
- Modify: `packages/core/src/slash-commands/types.ts`
- Modify: `packages/core/src/engine.ts`

- [ ] **Step 1: 在 types.ts 中新增 result 类型**

```typescript
| { type: "session_list"; sessions: SessionIndex[] }
| { type: "session_loaded"; sessionId: string; messageCount: number }
| { type: "session_saved"; sessionId: string }
| { type: "session_cleared" }
| { type: "title_set"; title: string }
```

- [ ] **Step 2: 在 handler.ts 中实现命令**

添加 `/history`、`/history <id>`、`/history clear`、`/save`、`/title <text>` 的处理。
`SlashCommandContext` 需添加 `sessionPersister` 引用。

- [ ] **Step 3: 在 engine.ts 中暴露 sessionPersister 到 SlashCommandContext**

- [ ] **Step 4: 在 App.tsx 和 web/server/index.ts 中渲染新的 result 类型**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/slash-commands/ packages/core/src/engine.ts packages/cli/src/tui/App.tsx packages/web/src/server/index.ts
git commit -m "feat(core): add /history /save /title slash commands"
```

---

### Task 17: Token 认证端到端

**Files:**
- Create: `packages/mcp-server/src/auth/token.ts`
- Modify: `packages/mcp-server/src/types/index.ts`
- Modify: `packages/mcp-server/src/auth/rbac.ts`
- Test: `packages/mcp-server/tests/auth/token.test.ts`

- [ ] **Step 1: 编写 token 测试**

```typescript
// packages/mcp-server/tests/auth/token.test.ts
import { describe, it, expect } from "vitest";
import { generateToken, verifyToken } from "../../src/auth/token.js";

const SECRET = "test-secret-key";

describe("Token", () => {
  it("generates and verifies valid token", () => {
    const token = generateToken(1, "admin", SECRET);
    const result = verifyToken(token, SECRET);
    expect(result).toEqual({ userId: 1, role: "admin" });
  });

  it("rejects tampered token", () => {
    const token = generateToken(1, "admin", SECRET);
    const tampered = token.slice(0, -1) + "x";
    expect(verifyToken(tampered, SECRET)).toBeNull();
  });

  it("rejects expired token", () => {
    // 生成一个已过期的 token（手动构造）
    const payload = Buffer.from("1:admin:0").toString("base64");
    const { createHmac } = require("crypto");
    const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
    expect(verifyToken(`${payload}.${sig}`, SECRET)).toBeNull();
  });
});
```

- [ ] **Step 2: 实现 token.ts**

使用 `crypto.timingSafeEqual` 进行签名比较（防时序攻击）。

- [ ] **Step 3: 扩展 ToolContext 类型**

```typescript
// packages/mcp-server/src/types/index.ts
export interface ToolContext {
  userId: number;
  role: string;
  token?: string;
  ip?: string;
}
```

- [ ] **Step 4: 改造 rbac.ts extractContext**

添加 token 分支：有 token 时调用 `verifyToken` 解析身份。

- [ ] **Step 5: 运行测试**

Run: `pnpm --filter @bicli/mcp-server test`
Expected: PASS

- [ ] **Step 6: 在 .env 中添加 AUTH_SECRET 示例**

在 `.env.example`（如有）中添加 `AUTH_SECRET=your-secret-here`。

- [ ] **Step 7: Commit**

```bash
git add packages/mcp-server/src/auth/token.ts packages/mcp-server/src/types/index.ts packages/mcp-server/src/auth/rbac.ts packages/mcp-server/tests/auth/token.test.ts
git commit -m "feat(mcp): add HMAC token auth with timing-safe verification"
```

---

### Task 18: Web GUI 更新（确认 + 工具展示）

**Files:**
- Modify: `packages/web/src/server/index.ts`

- [ ] **Step 1: 在 WebSocket 消息处理中增加 confirm_request 事件**

当 Engine yield `confirm_request` 事件时，通过 WebSocket 下发给客户端。
客户端弹出确认框，用户操作后回传 `confirm_response`。

- [ ] **Step 2: 在客户端 HTML 中渲染工具调用详情**

更新 `formatStreamEvent` 函数，处理 `tool_call_start`（显示参数）和 `tool_call_end`（显示耗时+结果）。

- [ ] **Step 3: 在客户端 HTML 中添加确认弹框**

JavaScript 中监听 `confirm_request` 事件，使用 `window.confirm()` 或自定义模态框，回传结果。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/server/index.ts
git commit -m "feat(web): add confirmation dialog and rich tool display"
```

---

### Task 19: session-manager Skill

**Files:**
- Create: `packages/skills/definitions/session-manager/SKILL.md`

- [ ] **Step 1: 创建 SKILL.md**

```yaml
---
name: session-manager
description: 管理对话历史：查看、恢复、清理历史会话
triggers:
  - 历史 | 会话 | 对话记录 | history | session
requiredTools: []
requiredPermissions: []
---
```

包含 `/history`、`/save`、`/title` 命令的使用说明。

- [ ] **Step 2: Commit**

```bash
git add packages/skills/definitions/session-manager/
git commit -m "feat(skills): add session-manager skill"
```

---

### Task 20: 文档同步 + MCP 权限协议更新

**Files:**
- Modify: `docs/mcp-permission-protocol.md`
- Modify: `docs/getting-started.md`

- [ ] **Step 1: 更新 MCP 权限协议**

在权限字符串约定中添加 `approval` 和 `audit` 资源。

- [ ] **Step 2: 更新 getting-started.md**

添加审批、审计、历史命令的使用说明。

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: update permission protocol and getting-started for phase 3"
```

---

### Task 21: Phase 3b 集成验证

- [ ] **Step 1: 重新 seed 数据库**

Run: `pnpm seed`

- [ ] **Step 2: 启动 TUI 完整验证**

测试场景：
1. 正常对话，退出后重启 → `/history` 看到历史会话
2. `/history <id>` 恢复历史对话
3. `/title 测试会话` 设置标题
4. 工具调用显示参数和结果
5. 删除操作弹出确认
6. 审批全流程（提交→切换用户→审批→查看审计）

- [ ] **Step 3: 运行全部测试**

Run: `pnpm test`
Expected: 全部 PASS

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat: BiCLI Phase 3 complete — audit, approval, confirmation, session persistence, token auth"
```
