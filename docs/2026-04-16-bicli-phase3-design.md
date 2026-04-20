# BiCLI 三期设计：生产级安全基座 + 审批工作流 + CLI 体验提升

> **状态**: 设计评审通过
> **日期**: 2026-04-16
> **前置**: [二期设计](./2026-04-16-bicli-phase2-design.md)、[MCP 权限协议](./mcp-permission-protocol.md)

---

## 1. 目标与范围

### 1.1 背景

二期完成了三层权限体系、模型管理、Web GUI、用户切换等核心能力。三期聚焦三个方向：

1. **安全基座** — 让系统"敢上线"：审计日志、敏感操作确认、Token 端到端认证
2. **复杂业务场景** — 证明 CLI + Skill 的多步编排能力：审批工作流 + 操作日志查询
3. **CLI 体验** — 缩小与行业标杆的差距：工具调用完整展示、会话历史持久化

### 1.2 核心架构决策

采用 **双层混合模式**：

- **MCP 层**负责审计日志（数据网关，不论接入方式都有记录）
- **Core 层**负责敏感操作确认（UI 交互层，MCP 无状态不管"等用户回复"）

与二期"MCP 可剥离替换"原则一致——换 MCP 时审计跟着走，Core/CLI 确认逻辑不受影响。

### 1.3 类型命名约定

项目中存在两个 `ToolContext` 定义，语义不同需注意区分：
- **MCP 层** (`mcp-server/src/types/index.ts`)：解析后的身份，总是有 `userId`/`role`（Token 解析后也补全这两个字段）
- **Core 层** (`core/src/types.ts`)：调用入口，可能是 `{ userId, role }` 或 `{ token }`

为避免混淆，Core 层的类型在三期重构为 `AuthContext`，MCP 层保留 `ToolContext` 不变。

### 1.4 不做什么（YAGNI）

- 不做插件/Hook 系统（优先级低于安全基座）
- 不做 Markdown 渲染高亮（独立于业务逻辑，可后续单独加）
- 不做多级审批链（三期只做单人审批，验证机制即可）
- 不做速率限制（当前本地部署场景不紧迫）

---

## 2. 模块一：审计日志系统（MCP 层）

所有后续模块（操作日志查询、审批流水等）的基石。

### 2.1 数据库设计

新增 `audit_logs` 表（注意：`user_id` 使用 `BIGINT UNSIGNED` 匹配 `users.id` 的 `serial()` 类型）：

```sql
CREATE TABLE audit_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT UNSIGNED NOT NULL,
  user_role      VARCHAR(50) NOT NULL,
  tool_name      VARCHAR(100) NOT NULL,
  action         VARCHAR(50) NOT NULL,
  resource_type  VARCHAR(50),
  resource_id    VARCHAR(100),
  input_summary  JSON,
  output_summary JSON,
  status         ENUM('success','failed','denied','confirmed') NOT NULL,
  ip_address     VARCHAR(45),
  duration_ms    INT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_tool (tool_name),
  INDEX idx_resource (resource_type, resource_id),
  INDEX idx_created (created_at)
);
```

> **类型约定**：所有引用 `users.id` 的外键列统一使用 `BIGINT UNSIGNED`（Drizzle 的 `serial()` 生成 `BIGINT UNSIGNED AUTO_INCREMENT`）。本文档后续所有表均遵循此约定。

字段说明：

| 字段 | 用途 |
|------|------|
| `tool_name` | MCP 工具名，如 `user_manage`、`approval_submit` |
| `action` | 从工具名和参数推断的动作，如 `create`/`update`/`delete` |
| `resource_type` | 被操作的资源类型，如 `user`/`form`/`approval` |
| `resource_id` | 被操作资源的 ID |
| `input_summary` | 脱敏后的输入参数摘要（密码/token 用 `***` 替换） |
| `output_summary` | 截断后的输出摘要（大结果只保留前 500 字符） |
| `status` | `success` / `failed` / `denied`（用户取消） / `confirmed`（用户确认后执行） |
| `ip_address` | 客户端 IP，Web 模式从 WebSocket 请求头提取传入 `_context.ip`；stdio 模式为 `NULL` |
| `duration_ms` | 工具执行耗时 |

### 2.2 MCP 审计中间件

位置：`packages/mcp-server/src/middleware/audit.ts`（新建）

> **架构对齐说明**：现有代码中 `withAuth` 不是装饰器/包装器模式，而是在每个 handler 内部调用的辅助函数。`register.ts` 的 `CallToolRequestSchema` handler 直接调用 `tool.handler(db, args)`。因此 `withAudit` 采用相同模式——在 `register.ts` 的统一入口处调用，而非包装每个 handler。

实现方式：在 `register.ts` 的 `CallToolRequestSchema` handler 中，统一包裹审计逻辑：

```typescript
// register.ts — CallToolRequestSchema handler 改造
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const startTime = Date.now();
  let status = "success";
  let result;

  try {
    result = await tool.handler(db, args || {});
    if (result?.error) status = "failed";
  } catch (err) {
    status = "failed";
    throw err;
  } finally {
    // 从 args._context 提取身份（withAuth 已解析）
    const ctx = (args as any)?._context || {};
    writeAuditLog(db, {
      userId:        ctx.userId,
      userRole:      ctx.role,
      toolName:      name,
      action:        extractAction(name, args),
      resourceType:  extractResourceType(name),
      resourceId:    extractResourceId(args, result),
      inputSummary:  sanitize(args),
      outputSummary: truncate(result, 500),
      status,
      ipAddress:     ctx.ip || null,
      durationMs:    Date.now() - startTime,
    }).catch(err => console.error("[audit] write failed:", err));
  }

  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

`writeAuditLog` 是一个简单的异步 fire-and-forget 函数，封装 `db.insert(auditLogs).values(...)`。

辅助函数（位于 `packages/mcp-server/src/utils/sanitize.ts`，可被 Core 层复用）：
- `extractAction(toolName, input)` — 从工具名和 `input.action` 推断动作
- `sanitize(input)` — 对 `password`、`token`、`apiKey` 等字段用 `"***"` 替换
- `truncate(result, maxLen)` — 结果超长时截断

> **脱敏共享**：`sanitize`/`truncate` 函数同时被 MCP 审计和 CLI 工具展示使用。为避免 MCP 与 Core 包循环依赖，这些函数放在 MCP 包中导出，Core 通过 `import` 引用（MCP 是 Core 的依赖方向下游，不存在循环）。

### 2.3 新增 MCP 工具：`audit_query`

位置：`packages/mcp-server/src/tools/audit-query.ts`（新建）

```typescript
{
  name: "audit_query",
  description: "查询操作审计日志，支持按用户/工具/时间/资源筛选",
  inputSchema: z.object({
    userId:       z.number().optional(),
    toolName:     z.string().optional(),
    resourceType: z.string().optional(),
    action:       z.string().optional(),
    startTime:    z.string().optional(),    // ISO 8601
    endTime:      z.string().optional(),
    page:         z.number().default(1),
    pageSize:     z.number().default(20).max(100),
  }),
  _meta: {
    requiredPermissions: ["audit:read"],
  },
}
```

返回格式：

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 156,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 3. 模块二：敏感操作确认（Core 层）

LLM 执行删除、批量操作等高风险动作时，暂停并让用户二次确认。

### 3.1 MCP 侧：destructive 标记

在 `register.ts` 注册工具时，`_meta` 增加 `destructive` 字段：

```typescript
// 示例
{ name: "user_manage",    _meta: { requiredPermissions: ["user:write"],    destructive: ["delete"] } }
{ name: "form_manage",    _meta: { requiredPermissions: ["form:write"],    destructive: ["delete"] } }
{ name: "role_manage",    _meta: { requiredPermissions: ["role:write"],    destructive: ["delete"] } }
{ name: "approval_review", _meta: { requiredPermissions: ["approval:review"], destructive: ["reject"] } }
```

语义：
- `destructive: ["delete"]` — 当 `input.action === "delete"` 时需确认
- `destructive: true` — 该工具的任何调用都需确认
- 无 `destructive` 字段或 `false` — 不需确认

> **ToolDef 类型扩展**：`register.ts` 的 `ToolDef` 接口需新增 `destructive?: boolean | string[]`，并在 `ListToolsRequestSchema` handler 中将其暴露到返回的 `_meta.destructive` 字段。

### 3.2 Core 侧：拦截机制

在 `BiCLIEngine.buildAiTools` 中对 `defineTool` 的 `execute` 包装。

> **`toolMetaMap` 构建**：在 `buildAiTools` 遍历 `visibleTools` 时，从每个 tool 的 `_meta` 字段提取 `destructive` 信息，构建 `Map<string, { destructive?: boolean | string[] }>`，通过闭包捕获供 `execute` 使用。

```typescript
// buildAiTools 中
const toolMetaMap = new Map<string, ToolMeta>();
for (const tool of visibleTools) {
  toolMetaMap.set(tool.name, tool._meta || {});
  // ... defineTool(...)
}

// execute 闭包中
execute: async (args) => {
  const meta = toolMetaMap.get(toolName);

  if (needsConfirmation(meta, args)) {
    const summary = buildConfirmSummary(toolName, args);
    const confirmed = await this.requestConfirmation({
      toolName,
      action: args.action,
      summary,
      level: "destructive",
    });
    if (!confirmed) {
      // Core 层写一条 denied 审计记录（MCP 不会被调用，withAudit 不触发）
      this.emitAuditEvent({ toolName, action: args.action, status: "denied" });
      return { error: "USER_CANCELLED", message: "用户取消了操作" };
    }
  }

  return await toolCaller.call(toolName, args);
};
```

> **denied 审计写入时机**：用户取消时，MCP 工具不会被调用，`withAudit` 不触发。因此 `status: "denied"` 的审计由 Core 层通过调用 MCP 的 `audit_write` 内部工具写入（保证审计日志集中在同一张 `audit_logs` 表）。`audit_write` 仅限 Core 层通过 `_context` 内部标记调用，不暴露给 LLM。

```typescript
// audit_write 工具（内部使用，不注册到 LLM 可见工具列表）
{
  name: "audit_write",
  internal: true,  // 标记为内部工具，不出现在 listTools 中
  inputSchema: z.object({
    userId: z.number(), userRole: z.string(),
    toolName: z.string(), action: z.string(),
    status: z.enum(["denied"]),
    summary: z.string().optional(),
  }),
}
```

判断逻辑：

```typescript
function needsConfirmation(meta, args): boolean {
  if (!meta?.destructive) return false;
  if (meta.destructive === true) return true;
  if (Array.isArray(meta.destructive)) return meta.destructive.includes(args.action);
  return false;
}
```

### 3.3 Engine 确认回调

```typescript
// Engine 类
private confirmHandler?: (req: ConfirmRequest) => Promise<boolean>;

setConfirmHandler(handler: (req: ConfirmRequest) => Promise<boolean>) {
  this.confirmHandler = handler;
}

private async requestConfirmation(req: ConfirmRequest): Promise<boolean> {
  if (!this.confirmHandler) return true;  // 无 UI 时默认通过（SDK 模式）
  return this.confirmHandler(req);
}
```

类型定义：

```typescript
interface ConfirmRequest {
  toolName: string;
  action: string;
  summary: string;              // 人类可读的操作摘要
  level: "destructive" | "warning";
}
```

### 3.4 TUI 确认组件

位置：`packages/cli/src/tui/components/ConfirmDialog.tsx`（新建）

渲染效果：

```
┌─ ⚠️ 敏感操作确认 ──────────────────────┐
│                                         │
│  即将删除用户 #3 (张三)，此操作不可恢复  │
│                                         │
│  [Y] 确认执行    [N] 取消               │
└─────────────────────────────────────────┘
```

TUI 在初始化时注入确认回调：

```typescript
engine.setConfirmHandler(async (req) => {
  setConfirmRequest(req);       // 触发 ConfirmDialog 渲染
  return new Promise(resolve => {
    confirmResolveRef.current = resolve;
  });
});
```

Web GUI 通过 WebSocket 事件 `confirm_request` / `confirm_response` 实现相同流程。

### 3.5 审计联动

- 用户确认 → 审计日志 `status: "confirmed"`，后续执行结果正常记录
- 用户取消 → 审计日志 `status: "denied"`，不执行工具

---

## 4. 模块三：审批工作流（新 MCP 场景）

最重要的新业务场景，天然需要 LLM 多步工具编排。

### 4.1 数据库设计

```sql
CREATE TABLE approvals (
  id                     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title                  VARCHAR(200) NOT NULL,
  type                   VARCHAR(50) NOT NULL,         -- 'leave'|'expense'|'publish'|'custom'
  content                JSON NOT NULL,
  status                 ENUM('pending','approved','rejected','cancelled') DEFAULT 'pending',
  submitted_by           BIGINT UNSIGNED NOT NULL,
  reviewer_id            BIGINT UNSIGNED NOT NULL,
  reviewed_at            TIMESTAMP NULL,
  review_comment         VARCHAR(500),
  related_resource_type  VARCHAR(50),
  related_resource_id    BIGINT UNSIGNED,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_submitted (submitted_by),
  INDEX idx_reviewer (reviewer_id),
  INDEX idx_status (status),
  FOREIGN KEY (submitted_by) REFERENCES users(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

CREATE TABLE approval_actions (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  approval_id  BIGINT UNSIGNED NOT NULL,
  actor_id     BIGINT UNSIGNED NOT NULL,
  action       ENUM('submit','approve','reject','cancel','reassign') NOT NULL,
  comment      VARCHAR(500),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_approval (approval_id),
  FOREIGN KEY (approval_id) REFERENCES approvals(id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
);
```

### 4.2 状态机

```
              submit
  (draft) ──────────→ pending
                        │
              ┌─────────┼─────────┐
              │approve   │cancel   │reject
              ▼          ▼         ▼
          approved    cancelled  rejected
```

规则：
- 只有 `submitted_by` 本人可以 `cancel`
- 只有 `reviewer_id` 可以 `approve` / `reject`
- **不能审批自己提交的申请**（`submitted_by === reviewer_id` 时 approve/reject 被拒绝）
- 已终态（approved/rejected/cancelled）不可再变更
- `reassign` 可以改 `reviewer_id`（仅 admin 或原提交人），状态不变

**并发控制**：使用乐观锁防止竞态条件：

```sql
UPDATE approvals
SET status = 'approved', reviewed_at = NOW(), review_comment = :comment
WHERE id = :id AND status = 'pending'
```

检查 `affectedRows === 0` 时返回"审批单已被处理"错误，避免重复审批。

### 4.3 MCP 工具

#### `approval_submit`

```typescript
{
  name: "approval_submit",
  description: "提交审批申请（请假/报销/发布等），需指定审批人",
  inputSchema: z.object({
    title:                z.string(),
    type:                 z.enum(["leave", "expense", "publish", "custom"]),
    content:              z.record(z.any()),
    reviewerId:           z.number(),
    relatedResourceType:  z.string().optional(),
    relatedResourceId:    z.number().optional(),
  }),
  _meta: { requiredPermissions: ["approval:write"] },
}
```

实现要点：
- 插入 `approvals` 表 + 插入 `approval_actions`（action=submit）
- `submitted_by` 从 `_context.userId` 取
- 校验 `reviewerId` 对应的用户存在且状态为 active

#### `approval_review`

```typescript
{
  name: "approval_review",
  description: "审批操作：通过、驳回或转审",
  inputSchema: z.object({
    approvalId:  z.number(),
    action:      z.enum(["approve", "reject", "reassign"]),
    comment:     z.string().optional(),
    reassignTo:  z.number().optional(),
  }),
  _meta: {
    requiredPermissions: ["approval:review"],
    destructive: ["reject"],
  },
}
```

实现要点：
- 校验当前用户是否为 `reviewer_id`（approve/reject）
- **校验 `submitted_by !== context.userId`**（不能审批自己的申请）
- 校验审批单状态为 `pending`（使用乐观锁 `WHERE status = 'pending'`，检查 `affectedRows`）
- `reassign` 时校验目标用户存在且 active
- 每次操作插入 `approval_actions` 记录
- 更新 `approvals` 表状态 + `reviewed_at` + `review_comment`

#### `approval_query`

```typescript
{
  name: "approval_query",
  description: "查询审批单列表或详情，含操作历史",
  inputSchema: z.object({
    approvalId:  z.number().optional(),
    status:      z.string().optional(),
    submittedBy: z.number().optional(),
    reviewerId:  z.number().optional(),
    type:        z.string().optional(),
    page:        z.number().default(1),
    pageSize:    z.number().default(20),
  }),
  _meta: { requiredPermissions: ["approval:read"] },
}
```

实现要点：
- 查详情时（`approvalId` 有值）联查 `approval_actions` 返回操作历史
- 列表查询接入 `data_scope_rules` 做行级过滤
- 接入 `field_scope_rules` 做字段级过滤

> **`applyDataScope` OR 条件支持**：现有 `applyDataScope` 只支持单字段 `ownerField` 条件。审批的 editor 规则需要 `submitted_by = :userId OR reviewer_id = :userId`。解决方案：扩展 `ownerField` 支持逗号分隔多字段，`applyDataScope` 遇到逗号分隔时生成 `OR` 条件。向下兼容——现有单字段规则不受影响。
>
> 实现代码（改造 `data-scope.ts`）：
>
> ```typescript
> import { or, eq } from "drizzle-orm";
>
> if (rule.scopeType === "own" && rule.ownerField) {
>   const fields = rule.ownerField.split(",");
>   const orConditions = fields
>     .map(f => resolveColumn(tableRef, f.trim()))
>     .filter(Boolean)
>     .map(col => eq(col!, context.userId));
>   if (orConditions.length === 1) {
>     conditions.push(orConditions[0]);
>   } else if (orConditions.length > 1) {
>     conditions.push(or(...orConditions)!);
>   }
> }
> ```

### 4.4 权限与数据可见性

角色权限分配：

| 角色 | approval:read | approval:write | approval:review |
|------|:---:|:---:|:---:|
| admin | ✓ | ✓ | ✓ |
| editor | ✓ | ✓ | ✓ |
| viewer | ✓ | ✓ | ✗ |

`data_scope_rules` 配置：

| 角色 | 资源 | 范围 | 条件 |
|------|------|------|------|
| editor | approval | own | `ownerField: "submitted_by,reviewer_id"`（多字段 OR） |
| viewer | approval | own | `ownerField: "submitted_by"` |
| admin | — | — | 无规则，跳过 scope 检查 |

### 4.5 多步编排示例

**场景：提交请假审批**

用户："帮我提交一个请假审批，下周一到周三，审批人是李经理"

```
1. user_list → 查找"李经理"对应 userId
2. approval_submit → 创建审批单，reviewerId = 李经理 ID
3. 返回："已提交请假审批 #12，审批人：李经理，状态：待审批"
```

**场景：审批操作**

切换到李经理角色："看看我的待审批"

```
1. approval_query → reviewerId=当前用户, status=pending
2. 返回待审批列表
```

"通过第 12 号审批"

```
1. approval_review → approvalId=12, action=approve
2. 审计日志自动记录
3. 返回："审批 #12 已通过"
```

---

## 5. 模块四：会话历史持久化 + 工具调用完整展示

### 5.1 会话存储

存储位置：`~/.bicli/sessions/`

```
~/.bicli/
├── models.json
└── sessions/
    ├── index.json
    ├── s_20260416_143022.json
    └── s_20260416_150815.json
```

会话文件结构：

```typescript
interface PersistedSession {
  id: string;
  title: string;
  userId: number;
  role: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: PersistedMessage[];
}

interface PersistedMessage {
  role: "user" | "assistant" | "system" | "tool_call" | "tool_result";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
  timestamp: string;
}
```

设计要点：
- 运行时增量追加 JSONL 格式，退出时写完整 JSON（保证格式完整性）
- `index.json` 只记索引（id / title / time / messageCount），列表加载时不读全部内容
- 单个会话超 500 条消息自动归档

### 5.2 Session 类改造

位置：`packages/core/src/llm/session.ts`

> **类型分离设计**：`Session` 内部维持 `ModelMessage[]`（AI SDK 类型）用于 LLM 对话，**不**把 `tool_call`/`tool_result` 的自定义 role 混入 `ModelMessage[]`（AI SDK 只识别 `system|user|assistant|tool`）。工具调用记录仅写入 `SessionPersister`，与运行时消息分开。

```typescript
class Session {
  private messages: ModelMessage[] = [];
  private persister?: SessionPersister;

  constructor(maxTurns: number, persister?: SessionPersister) {
    this.persister = persister;
  }

  addMessage(message: ModelMessage) {
    this.messages.push(message);
    // 转为 PersistedMessage 格式写入持久化
    this.persister?.append({
      role: message.role,
      content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
      timestamp: new Date().toISOString(),
    }).catch(() => {});
    this.trim();
  }

  // 仅写入持久化，不污染 ModelMessage[]
  recordToolCall(toolName: string, args: any) {
    this.persister?.append({
      role: "tool_call", content: "", toolName, toolArgs: args,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  recordToolResult(toolName: string, result: any) {
    this.persister?.append({
      role: "tool_result", content: "", toolName, toolResult: result,
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }
}
```

`SessionPersister` 接口：

```typescript
interface SessionPersister {
  append(message: PersistedMessage): Promise<void>;  // 异步，内部 catch 不抛出
  load(sessionId: string): Promise<PersistedSession>;
  list(): Promise<SessionIndex[]>;
  save(): Promise<void>;                               // 完整写入
  delete(sessionId: string): Promise<void>;
}
```

实现位置：`packages/core/src/storage/session-persister.ts`（新建）

### 5.3 新增斜杠命令

| 命令 | 功能 |
|------|------|
| `/history` | 列出最近 20 个会话（ID、标题、时间） |
| `/history <id>` | 加载指定历史会话，恢复上下文继续对话 |
| `/history clear` | 清空所有历史会话 |
| `/save` | 手动保存当前会话（正常退出时自动保存） |
| `/title <text>` | 给当前会话设置标题 |

### 5.4 工具调用完整展示

改造前（当前状态）：
```
AI: [approval_query] 调用 approval_query...
```

改造后：
```
🔧 approval_query
├─ 参数: { reviewerId: 2, status: "pending" }
├─ 耗时: 45ms
└─ 结果: 找到 3 条待审批记录
```

实现方式：

在 `App.tsx` 补全 `tool_call_start` 和 `tool_call_end` 事件处理：

```typescript
case "tool_call_start":
  appendMessage({
    role: "system",
    content: `🔧 ${event.toolName}\n├─ 参数: ${formatArgs(event.args)}`
  });
  break;

case "tool_call_end":
  updateLastToolMessage({
    append: `├─ 耗时: ${event.duration}ms\n└─ 结果: ${formatResult(event.result)}`
  });
  break;
```

辅助函数：
- `formatArgs(args)` — JSON 超 3 行折叠，敏感字段脱敏
- `formatResult(result)` — 结果超 200 字符截断
- 脱敏逻辑复用审计中间件的 `sanitize`

### 5.5 Engine 层计时 + ChatEvent 类型重构

> **ChatEvent 判别联合类型（Breaking Change）**：现有 `ChatEvent` 是扁平接口，重构为判别联合类型。这是破坏性变更——现有消费方（`App.tsx`、`web/server/index.ts`）需要用 `switch(event.type)` 做类型收窄后再访问特定字段（如 `event.content` 只在 `text_delta` 上存在）。实施时需同步修改所有消费方。

```typescript
// packages/core/src/types.ts
type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; toolName: string; args: unknown }
  | { type: "tool_call_end"; toolName: string; result: unknown; duration: number }
  | { type: "confirm_request"; toolName: string; action: string; summary: string }
  | { type: "error"; message: string }
  | { type: "done"; fullText: string };
```

Engine 层 `fullStream` 处理：

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

---

## 6. 模块五：Token 端到端打通

### 6.1 MCP 侧 Token 验证

> **ToolContext 类型扩展**：现有 `ToolContext` 定义为 `{ userId: number; role: string }`，需扩展为可选 token 模式。`extractContext`（`rbac.ts`）需分支处理：有 token 时先验证解析，再构造标准 `ToolContext`，确保所有下游 `context.userId` / `context.role` 的使用不受影响。

```typescript
// types/index.ts 改造
export interface ToolContext {
  userId: number;
  role: string;
  token?: string;   // 新增：可选 token
  ip?: string;      // 新增：可选客户端 IP
}

// rbac.ts extractContext 改造
export function extractContext(args: Record<string, unknown>): ToolContext {
  const ctx = (args._context || {}) as Record<string, unknown>;

  if (typeof ctx.token === "string" && ctx.token) {
    const secret = process.env.AUTH_SECRET || "bicli-dev-secret-do-not-use-in-prod";
    const identity = verifyToken(ctx.token, secret);
    if (!identity) throw new Error("Invalid or expired token");
    return { userId: identity.userId, role: identity.role, ip: ctx.ip as string };
  }

  if (typeof ctx.userId !== "number" || typeof ctx.role !== "string") {
    throw new Error("Invalid _context: requires token or (userId + role)");
  }
  return { userId: ctx.userId, role: ctx.role, ip: ctx.ip as string };
}
```

### 6.2 Token 方案

采用 HMAC 签名 token（轻量，不引入 JWT 库）：

位置：`packages/mcp-server/src/auth/token.ts`（新建，MCP 侧需要验证；Core 侧需要生成）

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

// token 格式: base64(userId:role:expiry).hmacSignature
export function generateToken(userId: number, role: string, secret: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000;   // 24h
  const payload = Buffer.from(`${userId}:${role}:${expiry}`).toString("base64");
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string): { userId: number; role: string } | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;
  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  // 使用 timingSafeEqual 防止时序攻击
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  const [userId, role, expiry] = Buffer.from(payload, "base64").toString().split(":");
  if (Date.now() > Number(expiry)) return null;
  return { userId: Number(userId), role };
}
```

`secret` 来源：`.env` 的 `AUTH_SECRET`，未配置时使用固定开发密钥。

> **安全警告**：启动时若检测到使用开发密钥，在终端打印醒目的黄色警告 `⚠️ 使用开发密钥，不要在生产环境中使用`。当 `NODE_ENV === "production"` 且未配置 `AUTH_SECRET` 时，拒绝启动。

### 6.3 CLI login 改造

现有 `login` 命令将用户名+密码发送到 MCP 验证，改造后：

1. MCP 新增 `auth_login` 工具，验证用户名密码后返回 token
2. CLI 将 token 存储到 `~/.bicli/auth.json`
3. 后续所有 MCP 调用在 `_context.token` 中携带此 token
4. MCP `withAuth` 解析 token 获取真实身份

---

## 7. Skill 配套

### 7.1 `approval-workflow`

位置：`packages/skills/definitions/approval-workflow/`

```
approval-workflow/
├── SKILL.md
└── reference/
    └── approval-api.md
```

SKILL.md frontmatter：

```yaml
name: approval-workflow
description: 引导用户完成审批流程：提交、查询、审批、转审
triggers:
  - 审批 | 请假 | 报销 | 审批单 | approve | reject
requiredTools:
  - approval_submit
  - approval_query
  - approval_review
  - user_list
requiredPermissions:
  - approval:read
```

`reference/approval-api.md`：状态机图、字段说明、权限矩阵、多步编排示例。

### 7.2 `audit-viewer`

位置：`packages/skills/definitions/audit-viewer/`

```yaml
name: audit-viewer
description: 查询和分析系统操作审计日志
triggers:
  - 审计 | 操作日志 | 谁做了 | 操作记录 | audit
requiredTools:
  - audit_query
requiredPermissions:
  - audit:read
```

配套 `reference/audit-api.md`：查询参数、输出字段、常见分析场景。

### 7.3 `session-manager`

位置：`packages/skills/definitions/session-manager/`

```yaml
name: session-manager
description: 管理对话历史：查看、恢复、清理历史会话
triggers:
  - 历史 | 会话 | 对话记录 | history | session
requiredTools: []
requiredPermissions: []
```

---

## 8. 种子数据更新

### 8.1 新增权限

```typescript
const newPermissions = [
  "approval:read",
  "approval:write",
  "approval:review",
  "audit:read",
];
```

角色分配：

| 角色 | 新增权限 |
|------|----------|
| admin | `approval:*` + `audit:read` |
| editor | `approval:read` + `approval:write` + `approval:review` + `audit:read` |
| viewer | `approval:read` + `approval:write` |

### 8.2 审批 Mock 数据

> **注意**：使用现有种子用户，不创建新用户。
> 现有角色映射：admin(admin), alice(admin), bob(editor), carol(editor), dave(editor), eve(viewer), frank(viewer), grace(viewer)

```typescript
// 3 条审批单（映射到现有用户及其真实角色）
{ title: "请假申请 - 家庭原因", type: "leave",
  content: { startDate: "2026-04-21", endDate: "2026-04-23", reason: "家庭事务" },
  submittedBy: bob/*editor*/, reviewerId: alice/*admin*/, status: "approved" }

{ title: "差旅报销 - 上海出差", type: "expense",
  content: { amount: 3500, items: ["机票","酒店","交通"] },
  submittedBy: eve/*viewer*/, reviewerId: bob/*editor*/, status: "pending" }

{ title: "请假申请 - 年假", type: "leave",
  content: { startDate: "2026-04-28", endDate: "2026-04-29", reason: "年假" },
  submittedBy: frank/*viewer*/, reviewerId: admin/*admin*/, status: "rejected",
  reviewComment: "当月已请假超限" }
```

对应 `approval_actions` 记录（每条审批单至少一条 `submit` 记录，已审批的还有 `approve`/`reject` 记录）。

### 8.3 data_scope_rules

```typescript
{ roleId: editor, resource: "approval", scopeType: "own",
  ownerField: "submitted_by,reviewer_id", priority: 10 }
{ roleId: viewer, resource: "approval", scopeType: "own",
  ownerField: "submitted_by", priority: 10 }
```

---

## 9. 完整交付物清单

| 层 | 新增/改造 | 文件位置 |
|----|----------|---------|
| **MCP** | `audit_logs` 表 schema | `mcp-server/src/db/schema.ts` |
| **MCP** | `approvals` + `approval_actions` 表 | `mcp-server/src/db/schema.ts` |
| **MCP** | 审计写入 + `register.ts` 统一审计入口 | `mcp-server/src/middleware/audit.ts` (新) + `register.ts` |
| **MCP** | `ToolContext` 扩展 + `extractContext` Token 分支 | `mcp-server/src/types/index.ts` + `auth/rbac.ts` |
| **MCP** | `ToolDef` 扩展 `destructive` 字段 | `mcp-server/src/tools/register.ts` |
| **MCP** | `applyDataScope` 多字段 OR 支持 | `mcp-server/src/auth/data-scope.ts` |
| **MCP** | Token 生成/验证 | `mcp-server/src/auth/token.ts` (新) |
| **MCP** | 脱敏工具函数 | `mcp-server/src/utils/sanitize.ts` (新) |
| **MCP** | `audit_query` 工具 | `mcp-server/src/tools/audit-query.ts` (新) |
| **MCP** | `audit_write` 内部工具（Core 用于 denied 审计） | `mcp-server/src/tools/audit-write.ts` (新) |
| **MCP** | `approval_submit` 工具 | `mcp-server/src/tools/approval-submit.ts` (新) |
| **MCP** | `approval_review` 工具 | `mcp-server/src/tools/approval-review.ts` (新) |
| **MCP** | `approval_query` 工具 | `mcp-server/src/tools/approval-query.ts` (新) |
| **MCP** | `withAuth` token 验证改造 | `mcp-server/src/auth/rbac.ts` |
| **MCP** | 种子数据更新 | `mcp-server/src/db/seed.ts` |
| **Core** | 确认拦截机制 | `core/src/engine.ts` |
| **Core** | Session 持久化 | `core/src/llm/session.ts` + `core/src/storage/session-persister.ts` (新) |
| **Core** | 工具调用计时 | `core/src/engine.ts` |
| **Core** | `/history` `/save` `/title` 命令 | `core/src/slash-commands/handler.ts` |
| **Core** | `ChatEvent` 判别联合类型重构 | `core/src/types.ts` |
| **Core** | `ToolContext` → `AuthContext` 重命名 | `core/src/types.ts` |
| **CLI** | `ConfirmDialog` 组件 | `cli/src/tui/components/ConfirmDialog.tsx` (新) |
| **CLI** | 工具调用完整展示 | `cli/src/tui/components/ChatArea.tsx` |
| **CLI** | 会话历史 UI | `cli/src/tui/App.tsx` |
| **Web** | 确认弹框 + 工具展示 | `web/src/server/index.ts` |
| **Skills** | `approval-workflow` + reference | `skills/definitions/approval-workflow/` (新) |
| **Skills** | `audit-viewer` + reference | `skills/definitions/audit-viewer/` (新) |
| **Skills** | `session-manager` | `skills/definitions/session-manager/` (新) |

---

## 10. 实施分期建议

### Phase 3a（安全基座 + 审批）

1. `audit_logs` 表 + `withAudit` 中间件 + `audit_query` 工具
2. `approvals` + `approval_actions` 表 + 3 个审批工具
3. `_meta.destructive` 标记 + Core 确认拦截 + TUI `ConfirmDialog`
4. 种子数据更新（权限 + 审批 Mock + data_scope）
5. `approval-workflow` + `audit-viewer` Skill

### Phase 3b（CLI 体验 + Token）

6. Session 持久化（`SessionPersister` + 斜杠命令）
7. 工具调用完整展示（Engine 计时 + TUI 渲染 + Web 渲染）
8. Token 端到端打通（`auth/token.ts` + `withAuth` 改造 + `auth_login` 工具）
9. `session-manager` Skill

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 审计写入拖慢工具响应 | 用户感知延迟 | fire-and-forget 异步写入 |
| 确认弹框打断 LLM 流式 | 流式中断体验差 | 确认在工具执行前触发，不影响文本流 |
| 会话文件过大 | 磁盘/加载慢 | 500 条自动归档 + index.json 惰性加载 |
| Token secret 泄露 | 身份伪造 | 开发环境固定密钥 + 生产 `NODE_ENV=production` 强制配置 |
| 审批状态竞态 | 重复审批 | 乐观锁 `WHERE status = 'pending'` + `affectedRows` 检查 |
| Token 时序攻击 | 签名猜测 | 使用 `crypto.timingSafeEqual` 比较签名 |

---

## 12. 文档同步

三期实施时需同步更新以下文档：

| 文档 | 更新内容 |
|------|----------|
| `docs/mcp-permission-protocol.md` | 新增 `approval`、`audit` 资源的权限字符串约定 |
| `docs/getting-started.md` | 新增审批、审计、历史命令的使用说明 |
| Skill reference 文件 | 新建 `approval-workflow/reference/`、`audit-viewer/reference/` |
