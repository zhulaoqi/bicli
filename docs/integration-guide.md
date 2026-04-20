# BiCLI 系统集成技术白皮书

> 版本: 1.0.0 | 更新日期: 2026-04-16 | 适用: BiCLI v2.x+

---

## 目录

1. [概述](#1-概述)
2. [架构总览](#2-架构总览)
3. [集成前提](#3-集成前提)
4. [阶段一：权限对接](#4-阶段一权限对接)
5. [阶段二：业务 MCP 接入](#5-阶段二业务-mcp-接入)
6. [阶段三：前端嵌入](#6-阶段三前端嵌入)
7. [权限 API 接口规范](#7-权限-api-接口规范)
8. [权限映射表](#8-权限映射表)
9. [安全规范](#9-安全规范)
10. [运维与监控](#10-运维与监控)
11. [FAQ](#11-faq)

---

## 1. 概述

BiCLI 是一个**可嵌入的 AI 能力层**——它不是一个独立应用，而是一组可以植入到任意软件系统中的组件。宿主系统通过提供权限 API 和业务数据接口，即可获得 AI 对话 + 工具编排 + 权限管控的完整能力。

### 核心价值

| 能力 | 说明 |
|------|------|
| **AI 对话引擎** | 多模型适配（OpenAI / Anthropic / 阿里千问 / 自定义），流式输出，多轮工具编排 |
| **MCP 工具协议** | 标准化的 AI-工具交互协议，每个工具声明权限要求，运行时自动鉴权 |
| **RBAC 数据权限** | Role-Resource-Field 三级权限，行级过滤 + 字段脱敏 |
| **操作审计** | 每次工具调用自动记录 who/what/when/result |
| **多端嵌入** | CLI / Web GUI / 前端 SDK，同一套 MCP 后端 |

### 集成的本质

```
┌─────────────────────────────────┐
│        宿主系统（您的软件）       │
│  ┌───────────┐  ┌─────────────┐ │
│  │ 前端应用   │  │  后端服务    │ │
│  │ @bicli/    │  │             │ │
│  │ embed +    │  │ 权限 API    │ │
│  │ widget     │  │ 业务 API    │ │
│  └─────┬─────┘  └──────┬──────┘ │
│        │               │        │
│        │    HTTP/MCP    │        │
│        ▼               ▼        │
│  ┌─────────────────────────────┐ │
│  │   BiCLI MCP Server          │ │
│  │   PermissionAdapter(http)   │ │
│  │   → 调宿主权限 API          │ │
│  │   → 业务工具 MCP 化         │ │
│  └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## 2. 架构总览

### 适配器模式

BiCLI 的权限系统通过 **PermissionAdapter** 接口抽象，实现与宿主系统的解耦：

```typescript
interface PermissionAdapter {
  // 身份解析：token → { userId, role }
  resolveIdentity(credential: IdentityCredential): Promise<{ userId: number; role: string }>;

  // 权限查询：角色 → 权限列表 ["user:read", "form:write", ...]
  getPermissions(role: string): Promise<string[]>;

  // 行级数据范围：角色 + 资源 → 过滤规则
  getDataScopeRules(role: string, resource: string): Promise<DataScopeRule[]>;

  // 字段级可见性：角色 + 资源 → 字段脱敏/隐藏规则
  getFieldScopeRules(role: string, resource: string): Promise<FieldScopeRule[]>;
}
```

两种内置实现：

| 实现 | 环境变量 | 用途 |
|------|---------|------|
| `LocalPermissionAdapter` | `PERMISSION_MODE=local`（默认） | 直接查询 BiCLI 自身数据库，用于 Demo 和独立部署 |
| `HttpPermissionAdapter` | `PERMISSION_MODE=http` | 通过 HTTP 调用宿主系统的权限 API，用于生产集成 |

### 数据流

```
用户请求 → LLM 选择工具 → MCP 调用
                            ↓
                      withAuth(db, adapter, args, perms, handler)
                            │
                            ├─ adapter.resolveIdentity()   ← 身份解析
                            ├─ adapter.getPermissions()    ← 功能权限检查
                            │
                            └─ handler() 内部:
                               ├─ adapter.getDataScopeRules()  ← 行级过滤
                               ├─ adapter.getFieldScopeRules() ← 字段脱敏
                               └─ 业务查询 + 返回
```

---

## 3. 集成前提

### 3.1 宿主系统要求

- **认证体系**：已有用户登录 + Token/Session 机制
- **RBAC 模型**：已有角色体系（admin / editor / viewer 或自定义）
- **API 能力**：能提供 4 个 HTTP 接口（见 [§7](#7-权限-api-接口规范)）

### 3.2 技术要求

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 22.0.0 |
| MySQL | 8.x（用于 BiCLI 自身数据：审计日志、会话历史等） |
| 网络 | MCP Server 能访问宿主系统的后端 API |

### 3.3 环境变量

```bash
# .env

# 切换为 HTTP 适配器
PERMISSION_MODE=http

# 宿主系统权限 API 基地址
PERMISSION_API_URL=https://your-backend.example.com/api/bicli-auth

# API 调用超时（毫秒），默认 5000
PERMISSION_API_TIMEOUT=5000
```

---

## 4. 阶段一：权限对接

> **目标**：让 BiCLI 的工具权限检查走宿主系统的 RBAC，而不是 BiCLI 自己的数据库。

### 4.1 实施步骤

#### Step 1: 梳理宿主系统角色

列出宿主系统中已有的角色和权限，建立与 BiCLI 工具权限的映射关系。

BiCLI 使用 `resource:action` 格式的权限标识，例如：

| BiCLI 权限 | 含义 | 典型映射 |
|-----------|------|---------|
| `user:read` | 查询用户列表 | 宿主系统的"用户管理-查看"权限 |
| `user:write` | 创建/修改/删除用户 | 宿主系统的"用户管理-编辑"权限 |
| `form:read` | 查询表单 | 宿主系统的"表单中心-查看" |
| `form:write` | 创建/修改表单 | 宿主系统的"表单中心-编辑" |
| `data:read` | 通用数据查询 | 宿主系统的"数据分析-查看" |
| `config:read` | 读取配置 | 宿主系统的"系统设置-查看" |
| `config:write` | 修改配置 | 宿主系统的"系统设置-编辑" |
| `role:read` | 查看角色 | 宿主系统的"权限管理-查看" |
| `role:write` | 管理角色 | 宿主系统的"权限管理-编辑" |
| `audit:read` | 查看审计日志 | 宿主系统的"日志管理"权限 |
| `approval:read` | 查看审批 | 宿主系统的"审批中心-查看" |
| `approval:write` | 发起审批 | 宿主系统的"审批中心-提交" |
| `approval:review` | 审批操作 | 宿主系统的"审批中心-审批" |

完整映射表见 [§8](#8-权限映射表)。

#### Step 2: 在宿主后端实现 4 个 API

按照 [§7 权限 API 接口规范](#7-权限-api-接口规范) 实现以下接口：

1. `GET /identity` — 验证 Token，返回 userId + role
2. `GET /permissions?role=xxx` — 返回角色的权限列表
3. `GET /data-scope?role=xxx&resource=yyy` — 返回行级数据过滤规则
4. `GET /field-scope?role=xxx&resource=yyy` — 返回字段可见性规则

#### Step 3: 配置环境变量并启动

```bash
# .env
PERMISSION_MODE=http
PERMISSION_API_URL=https://your-backend.example.com/api/bicli-auth

# 启动 MCP Server
pnpm dev:mcp        # stdio 模式（CLI/Web GUI）
pnpm dev:mcp-http   # HTTP 模式（前端嵌入）
```

#### Step 4: 验证

```bash
# 启动 CLI 测试
npx tsx packages/cli/bin/bicli.ts chat

# 在对话中测试
> 查询所有用户     # 验证 user:read 权限
> 创建一个表单     # 验证 form:write 权限
> /user            # 切换用户，验证不同角色数据差异
```

### 4.2 最简实现示例

以下是宿主系统后端（以 Express 为例）的最简实现：

```typescript
// routes/bicli-auth.ts
import express from "express";
import { verifyJWT } from "../auth/jwt.js";
import { RoleService } from "../services/role.js";

const router = express.Router();

// 1. 身份解析
router.get("/identity", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });

  const user = await verifyJWT(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });

  res.json({ userId: user.id, role: user.roleName });
});

// 2. 权限查询
router.get("/permissions", async (req, res) => {
  const { role } = req.query;
  // 从宿主系统的角色权限表查询，映射为 BiCLI 格式
  const permissions = await RoleService.getBicliPermissions(String(role));
  res.json(permissions); // ["user:read", "form:write", ...]
});

// 3. 数据范围规则
router.get("/data-scope", async (req, res) => {
  const { role, resource } = req.query;
  // admin 看全部，editor 看自己创建的，viewer 只看已发布的
  const rules = await RoleService.getDataScopeForBicli(String(role), String(resource));
  res.json(rules);
});

// 4. 字段可见性规则
router.get("/field-scope", async (req, res) => {
  const { role, resource } = req.query;
  const rules = await RoleService.getFieldScopeForBicli(String(role), String(resource));
  res.json(rules);
});

export default router;
```

### 4.3 自定义适配器

如果 HTTP 接口模式不满足需求（如需要 gRPC、消息队列等），可以自行实现 `PermissionAdapter`：

```typescript
import type { PermissionAdapter, IdentityCredential, DataScopeRule, FieldScopeRule } from "@bicli/mcp-server/auth/adapter";

export class MyCustomAdapter implements PermissionAdapter {
  async resolveIdentity(credential: IdentityCredential) {
    // 自定义身份解析逻辑
  }
  async getPermissions(role: string) {
    // 自定义权限查询逻辑
  }
  async getDataScopeRules(role: string, resource: string) {
    // 自定义数据范围逻辑
  }
  async getFieldScopeRules(role: string, resource: string) {
    // 自定义字段规则逻辑
  }
}
```

在 `create-adapter.ts` 中添加新模式分支即可。

---

## 5. 阶段二：业务 MCP 接入

> **目标**：将宿主系统的业务接口 MCP 化，让 AI 能够调用真实业务能力。

### 5.1 工具开发规范

每个 MCP 工具需要：

1. **Zod Schema** — 定义参数类型和校验规则
2. **权限声明** — 在 `register.ts` 中声明 `requiredPermissions`
3. **Handler 函数** — 签名 `(db, adapter, args) => Promise<Result>`
4. **数据权限** — 查询类工具应使用 `adapter.getDataScopeRules` + `adapter.getFieldScopeRules`

```typescript
// tools/your-tool.ts
import { z } from "zod";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { withAuth, formatSuccess } from "./base.js";
import { applyDataScope, applyFieldScopeWithRules } from "../auth/data-scope.js";

export const yourToolSchema = z.object({
  // 参数定义
});

export async function yourTool(
  db: Database,
  adapter: PermissionAdapter,
  args: Record<string, unknown>
) {
  return withAuth(db, adapter, args, ["your:permission"], async (db, cleanArgs, context, adapter) => {
    // 1. 获取数据范围规则（行级过滤）
    const scopeRules = await adapter.getDataScopeRules(context.role, "your_resource");
    // 2. 构建查询条件
    const conditions = [];
    applyDataScope(scopeRules, context, yourTable, conditions);
    // 3. 执行查询
    const data = await db.select().from(yourTable).where(and(...conditions));
    // 4. 字段级过滤
    const fieldRules = await adapter.getFieldScopeRules(context.role, "your_resource");
    const filtered = applyFieldScopeWithRules(fieldRules, data);
    return formatSuccess(filtered);
  });
}
```

### 5.2 注册工具

在 `packages/mcp-server/src/tools/register.ts` 中添加：

```typescript
import { yourTool, yourToolSchema } from "./your-tool.js";

// 在 tools 数组中添加
{
  name: "your_tool",
  description: "工具描述（会被 LLM 读取，要清晰）",
  schema: yourToolSchema,
  requiredPermissions: ["your:permission"],
  destructive: false,        // 或 true / ["delete"]
  handler: yourTool,
}
```

### 5.3 代理宿主业务 API

如果不想重新实现业务逻辑，可以在工具 handler 中直接代理宿主 API：

```typescript
export async function orderQuery(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, ["order:read"], async (_db, cleanArgs, context) => {
    // 直接调用宿主系统的业务 API
    const resp = await fetch("https://your-backend/api/orders", {
      headers: { "X-User-Id": String(context.userId), "X-User-Role": context.role },
    });
    const data = await resp.json();
    return formatSuccess(data);
  });
}
```

---

## 6. 阶段三：前端嵌入

> **目标**：在宿主系统的前端中嵌入 AI 对话 UI。

### 6.1 架构

```
浏览器
├── 宿主前端应用
│   ├── @bicli/embed   ← 轻量 SDK（LLM 调用 + MCP 通信）
│   └── @bicli/widget  ← React 聊天组件
│
└── 网络请求 ──→ LLM API（OpenAI/千问等）
               ──→ BiCLI MCP HTTP Server（工具调用）
```

### 6.2 安装

```bash
npm install @bicli/embed @bicli/widget
```

### 6.3 使用示例

```tsx
import { BiCLIChat } from "@bicli/widget";

function App() {
  return (
    <BiCLIChat
      mcpUrl="https://your-domain/mcp"
      llmConfig={{
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "qwen-plus",
        apiKey: "sk-xxx", // 注意：生产环境应通过后端代理，不暴露 Key
      }}
      userId={currentUser.id}
      userRole={currentUser.role}
    />
  );
}
```

### 6.4 API Key 安全

**生产环境不应在前端暴露 API Key**。推荐方案：

1. **后端代理模式**：前端发消息到自己的后端 → 后端用安全的 Key 调 LLM API → 流式返回前端
2. **临时 Token 模式**：后端签发短期有效的 LLM API Token，前端使用

---

## 7. 权限 API 接口规范

> 以下是 `HttpPermissionAdapter` 调用的 4 个接口规范。基地址由 `PERMISSION_API_URL` 配置。

### 7.1 身份解析

```
GET /identity
Authorization: Bearer <user-token>

Response 200:
{
  "userId": 42,
  "role": "editor"
}

Response 401:
{ "error": "Invalid or expired token" }
```

**说明**：
- Token 来自用户登录后的凭证，由前端/CLI 传入
- 当 `_context` 直接传递了 `userId` 和 `role`（非 token 模式），此接口不会被调用

### 7.2 权限查询

```
GET /permissions?role=editor

Response 200:
["user:read", "form:read", "form:write", "data:read", "approval:read", "approval:write"]

// 或包装格式：
{
  "permissions": ["user:read", "form:read", ...]
}
```

**说明**：
- 返回该角色拥有的所有 BiCLI 权限标识
- 支持两种响应格式：纯数组 或 `{ permissions: [...] }`

### 7.3 数据范围规则

```
GET /data-scope?role=editor&resource=users

Response 200:
[
  {
    "scopeType": "condition",
    "conditionField": "status",
    "conditionOperator": "eq",
    "conditionValue": "active"
  }
]

// 或包装格式：
{ "rules": [...] }
```

**DataScopeRule 结构**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `scopeType` | `"all" \| "own" \| "condition" \| "deny"` | **必填**。all=全部可见，own=只看自己的，condition=条件过滤，deny=禁止 |
| `ownerField` | `string` | scopeType=own 时必填。数据表中的所有者字段名，如 `"created_by"` |
| `conditionField` | `string` | scopeType=condition 时必填。过滤字段名 |
| `conditionOperator` | `"eq" \| "in" \| "ne"` | 条件操作符，默认 eq |
| `conditionValue` | `any` | 条件值。in 时传数组 |

**常见场景**：

```jsonc
// admin: 看全部
[{ "scopeType": "all" }]

// editor: 只看自己创建的
[{ "scopeType": "own", "ownerField": "created_by" }]

// viewer: 只看已发布的
[{ "scopeType": "condition", "conditionField": "status", "conditionOperator": "eq", "conditionValue": "published" }]

// 无权限
[{ "scopeType": "deny" }]

// 返回空数组也等同于 deny
[]
```

### 7.4 字段可见性规则

```
GET /field-scope?role=viewer&resource=users

Response 200:
[
  { "fieldName": "email", "visibility": "masked", "maskPattern": "email" },
  { "fieldName": "phone", "visibility": "masked", "maskPattern": "phone" },
  { "fieldName": "salary", "visibility": "hidden" }
]

// 或包装格式：
{ "rules": [...] }
```

**FieldScopeRule 结构**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `fieldName` | `string` | **必填**。要控制的字段名 |
| `visibility` | `"visible" \| "hidden" \| "masked"` | **必填**。visible=正常显示，hidden=完全隐藏，masked=脱敏显示 |
| `maskPattern` | `string` | visibility=masked 时有效。内置模式：`"email"` (a***@b.com)、`"phone"` (138****5678)、省略则默认首尾保留中间用 * |

**说明**：
- 返回空数组表示不做字段级限制（全部可见）
- 只需要返回需要控制的字段，未列出的字段默认 visible

---

## 8. 权限映射表

### 8.1 BiCLI 内置工具权限

| 工具名 | 所需权限 | 危险操作 | 说明 |
|--------|---------|---------|------|
| `user_list` | `user:read` | - | 用户列表查询 |
| `user_manage` | `user:write` | delete | 用户增删改 |
| `form_create` | `form:write` | - | 创建表单 |
| `form_manage` | `form:write` | delete | 表单修改/删除 |
| `form_query` | `form:read` | - | 表单查询 |
| `data_query` | `data:read` | - | 通用数据查询 |
| `data_aggregate` | `data:read` | - | 聚合统计 |
| `config_get` | `config:read` | - | 读取配置 |
| `config_set` | `config:write` | - | 修改配置 |
| `role_list` | `role:read` | - | 角色查询 |
| `role_manage` | `role:write` | delete | 角色管理 |
| `audit_query` | `audit:read` | - | 审计日志查询 |
| `approval_submit` | `approval:write` | - | 发起审批 |
| `approval_review` | `approval:review` | reject | 审批/驳回 |
| `approval_query` | `approval:read` | - | 审批查询 |
| `self_permissions` | 无 | - | 查看自身权限 |
| `session_save` | 无 | - | 保存会话 |
| `session_load` | 无 | - | 加载会话 |
| `session_list` | 无 | - | 会话列表 |
| `session_delete` | 无 | delete | 删除会话 |

### 8.2 资源标识一览

以下资源标识用于 `getDataScopeRules` 和 `getFieldScopeRules` 的 `resource` 参数：

| 资源标识 | 对应表/实体 | 常用字段 |
|---------|-----------|---------|
| `users` | 用户表 | id, username, email, phone, roleId, status |
| `forms` | 表单表 | id, name, description, status, createdBy |
| `form_fields` | 表单字段表 | id, formId, label, type, options |
| `configs` | 配置表 | id, key, value, description |
| `approval` | 审批表 | id, title, type, status, submittedBy, reviewerId |

### 8.3 典型角色权限方案

```jsonc
{
  "admin": {
    "permissions": ["*"],  // 或列出全部
    "dataScope": { "*": [{ "scopeType": "all" }] },
    "fieldScope": {}  // 不限制
  },
  "editor": {
    "permissions": ["user:read", "form:read", "form:write", "data:read", "approval:read", "approval:write"],
    "dataScope": {
      "forms": [{ "scopeType": "own", "ownerField": "created_by" }],
      "users": [{ "scopeType": "condition", "conditionField": "status", "conditionOperator": "eq", "conditionValue": "active" }]
    },
    "fieldScope": {
      "users": [
        { "fieldName": "email", "visibility": "masked", "maskPattern": "email" }
      ]
    }
  },
  "viewer": {
    "permissions": ["user:read", "form:read", "data:read", "approval:read"],
    "dataScope": {
      "forms": [{ "scopeType": "condition", "conditionField": "status", "conditionOperator": "eq", "conditionValue": "published" }],
      "users": [{ "scopeType": "condition", "conditionField": "status", "conditionOperator": "eq", "conditionValue": "active" }]
    },
    "fieldScope": {
      "users": [
        { "fieldName": "email", "visibility": "masked", "maskPattern": "email" },
        { "fieldName": "phone", "visibility": "hidden" }
      ]
    }
  }
}
```

---

## 9. 安全规范

### 9.1 传输安全

| 层面 | 要求 |
|------|------|
| MCP HTTP | 生产环境必须使用 HTTPS，或通过反向代理（Nginx）终结 TLS |
| Token 传输 | 通过 `_context.token` 传递，不记录在审计日志的明文中 |
| CORS | `MCP_CORS_ORIGIN` 应限定为宿主前端的域名 |

### 9.2 认证链路

```
前端登录 → 获得宿主系统 Token → 传入 @bicli/embed
         → MCP 调用时作为 _context.token 传递
         → BiCLI MCP Server 收到请求
         → HttpPermissionAdapter.resolveIdentity() 调用宿主 /identity API
         → 宿主验证 Token 返回 userId + role
         → BiCLI 使用 role 进行权限检查
```

### 9.3 敏感操作

标记为 `destructive` 的工具（delete/批量操作）在 CLI/Web GUI 中会弹出二次确认对话框。前端嵌入时，可通过 `@bicli/embed` 的 `requestConfirmation` 回调实现。

### 9.4 速率限制

MCP Server 内置工具调用计数器（`maxToolCalls`），防止 LLM 无限循环。建议值：

| 场景 | maxToolCalls |
|------|-------------|
| 简单查询 | 5 |
| 复杂编排 | 20 |
| 批量操作 | 50 |

---

## 10. 运维与监控

### 10.1 审计日志

每次工具调用自动记录到 `audit_logs` 表：

| 字段 | 说明 |
|------|------|
| `user_id` | 操作用户 |
| `user_role` | 用户角色 |
| `tool_name` | 工具名 |
| `action` | 操作类型（create/read/update/delete） |
| `resource_type` | 资源类型 |
| `resource_id` | 资源 ID |
| `status` | success/failed/denied |
| `session_id` | 关联会话 |
| `duration_ms` | 耗时 |
| `created_at` | 时间 |

### 10.2 健康检查

```
GET http://mcp-server:3211/health

{
  "status": "ok",
  "version": "2.0.0",
  "transport": "http",
  "activeSessions": 3
}
```

### 10.3 日志级别

MCP Server 通过 `stderr` 输出运行日志，包括：
- `[auth]` — 适配器初始化 和 权限检查
- `[audit]` — 审计日志写入
- 工具调用入口和异常

---

## 11. FAQ

### Q: 宿主系统没有现成的 RBAC 怎么办？

A: 可以使用 `PERMISSION_MODE=local`，BiCLI 自带完整的 RBAC 数据库表。通过 `pnpm seed` 灌入角色和权限数据，即可独立运行。

### Q: 权限 API 延迟会影响工具调用性能吗？

A: 每次工具调用约增加 1-2 次权限 API 查询（getPermissions + getDataScopeRules）。建议：
- 宿主 API 响应 < 50ms
- 可在 `HttpPermissionAdapter` 中添加本地缓存层（LRU，TTL 30-60s）

### Q: 如何处理权限 API 不可用的情况？

A: `HttpPermissionAdapter` 设有超时机制（默认 5 秒）。超时后返回错误，工具调用会得到 `INTERNAL_ERROR`。建议在宿主 API 前加负载均衡和健康检查。

### Q: 我只想用 AI 对话，不需要 RBAC 怎么办？

A: 将所有工具的 `requiredPermissions` 设为 `[]`，并在 `getPermissions` 返回 `["*"]` 即可绕过权限检查。

### Q: 可以添加新的 scopeType 吗？

A: 可以。在 `applyDataScope` 函数中添加新的 case 分支，同时更新 `DataScopeRule` 类型定义。建议通过 PR 贡献回主项目。

### Q: 宿主系统使用的是非 RBAC 模型（如 ABAC）怎么办？

A: 只需在宿主的权限 API 中做转换：接收 BiCLI 的 `role` + `resource` 查询，内部按 ABAC 规则求值，返回 BiCLI 格式的结果。适配器模式的核心优势就是隔离了权限计算的具体实现。

---

*本文档随 BiCLI 版本迭代更新。如有疑问请联系项目维护者。*
