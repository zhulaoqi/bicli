# BiCLI MCP 权限协议规范 v1.0

## 概述

本文档定义了 BiCLI 生态中 MCP Server 必须遵循的权限协议。任何遵循此协议的 MCP Server 实现都可以无缝接入 `@bicli/core` 引擎，替换 demo MCP Server 即可对接生产系统。

### 架构定位

```
@bicli/cli (TUI/命令行)
       ↓
@bicli/core (引擎)          ← 不需要修改
       ↓ MCP 协议
MCP Server (遵循本协议)     ← 唯一需要替换的部分
       ↓
生产数据库 / 认证系统
```

Core 不关心 MCP Server 的内部实现细节（如何鉴权、如何过滤数据）。Core 只依赖本协议定义的接口契约。

---

## P1：Tool 元数据（listTools）

### 要求

`listTools()` 返回的每个工具**必须**包含 `_meta.requiredPermissions` 字段。

### 响应格式

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;   // 工具参数的 JSON Schema
  _meta: {
    requiredPermissions: string[];  // 功能权限字符串数组
  };
}
```

### 规则

| 场景 | `requiredPermissions` 值 | 说明 |
|------|-------------------------|------|
| 需要特定权限 | `["user:read"]` | Core 会根据用户权限过滤此工具 |
| 需要多个权限 | `["user:read", "user:write"]` | 必须全部满足 |
| 无权限限制 | `[]` | 任何角色均可调用 |

### 示例

```json
{
  "tools": [
    {
      "name": "user_list",
      "description": "分页查询用户列表",
      "inputSchema": { ... },
      "_meta": {
        "requiredPermissions": ["user:read"]
      }
    },
    {
      "name": "self_permissions",
      "description": "获取当前用户权限",
      "inputSchema": { ... },
      "_meta": {
        "requiredPermissions": []
      }
    }
  ]
}
```

---

## P2：身份上下文注入（_context）

### 要求

所有 `callTool` 调用的 `arguments` 中**必须**包含 `_context` 字段，MCP Server **必须**从此字段获取调用者身份。

### 标准模式（demo / 开发环境）

```typescript
interface ToolArguments {
  _context: {
    userId: number;   // 用户 ID
    role: string;     // 角色名称，如 "admin" / "editor" / "viewer"
  };
  // ...其他业务参数
}
```

### 生产模式（Token 认证）

```typescript
interface ToolArguments {
  _context: {
    token: string;    // 认证令牌，MCP Server 自行解析身份
  };
  // ...其他业务参数
}
```

### 实现规则

1. MCP Server **必须**从 `_context` 提取身份信息后，将其从业务参数中剥离
2. MCP Server **不能**信任除 `_context` 以外的身份来源
3. 生产环境的 MCP Server 需自行实现 token 解析逻辑（验签、查询用户信息等）
4. 缺少 `_context` 或格式非法时，**必须**返回错误响应

### 示例：参数分离

```typescript
function extractContext(args: Record<string, unknown>) {
  const { _context, ...cleanArgs } = args;
  if (!_context) throw new Error("Missing _context");
  // 标准模式
  return { context: _context as { userId: number; role: string }, cleanArgs };
  // 生产模式则需要解析 token
}
```

---

## P3：必须实现的协议工具

### self_permissions

任何 MCP Server 实现**必须**提供此工具，供 Core 引擎在初始化时获取当前用户的角色和功能权限。

| 属性 | 值 |
|------|-----|
| 工具名 | `self_permissions` |
| requiredPermissions | `[]`（无权限限制） |
| 输入 | `{ _context }` |
| 输出 | `ToolResponse<{ role: string; permissions: string[] }>` |

### 输入 Schema

```json
{
  "type": "object",
  "properties": {
    "_context": {
      "type": "object",
      "properties": {
        "userId": { "type": "number" },
        "role": { "type": "string" }
      },
      "required": ["userId", "role"]
    }
  },
  "required": ["_context"]
}
```

### 输出示例

```json
{
  "success": true,
  "data": {
    "role": "editor",
    "permissions": [
      "user:read",
      "form:read",
      "form:write",
      "data:read",
      "config:read"
    ]
  }
}
```

### 权限字符串约定

格式：`{resource}:{action}`

| resource | 含义 | 常见 action |
|----------|------|-------------|
| `user` | 用户管理 | `read`, `write` |
| `form` | 表单管理 | `read`, `write` |
| `data` | 通用数据 | `read` |
| `config` | 系统配置 | `read`, `write` |
| `role` | 角色管理 | `read`, `write` |

生产系统可自由扩展 resource 和 action，Core 做精确字符串匹配。

---

## P4：统一响应格式

所有工具调用**必须**返回以下格式：

### 类型定义

```typescript
interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### MCP 传输层封装

ToolResponse 需要被包装为 MCP 协议的标准返回格式：

```typescript
// 成功
{
  content: [{ type: "text", text: JSON.stringify(toolResponse) }]
}

// 错误
{
  content: [{ type: "text", text: JSON.stringify(toolResponse) }],
  isError: true
}
```

### 标准错误码

| 错误码 | 含义 | 何时使用 |
|--------|------|---------|
| `PERMISSION_DENIED` | 权限不足 | 功能权限校验失败 |
| `VALIDATION_ERROR` | 参数校验失败 | 输入格式或值非法 |
| `NOT_FOUND` | 资源不存在 | 查询主键不存在 |
| `TOOL_NOT_FOUND` | 工具不存在 | 调用了未注册的工具 |
| `INTERNAL_ERROR` | 内部错误 | 数据库异常等不可预期错误 |

### 成功响应示例

```json
{
  "success": true,
  "data": [
    { "id": 1, "username": "admin", "status": "active" },
    { "id": 2, "username": "alice", "status": "active" }
  ],
  "meta": { "total": 10, "page": 1, "pageSize": 20 }
}
```

### 错误响应示例

```json
{
  "success": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "需要权限: user:write，当前角色 viewer 不具备"
  }
}
```

---

## P5：数据过滤（MCP Server 内部行为）

数据过滤对 Core 完全透明。Core 不知道也不关心 MCP Server 内部如何过滤数据。以下是对 MCP Server 实现者的指导。

### 5.1 三层过滤管线

```
请求进入
  ↓
① 功能权限校验：检查 _context.role 是否有调用此工具所需的权限
  ↓ (通过)
② 行级过滤：根据角色在当前资源上的数据范围规则，注入 WHERE 条件
  ↓
③ 字段级过滤：在查询结果中，按角色-资源规则隐藏或脱敏特定字段
  ↓
返回过滤后的数据
```

### 5.2 行级过滤（data_scope_rules）

每个角色在每种资源上可以有不同的数据可见范围。

#### scope_type

| 类型 | 含义 | 示例 |
|------|------|------|
| `all` | 看到全部数据 | admin 对所有资源 |
| `condition` | 按条件过滤 | viewer 对 forms 只看 `status = 'published'` |
| `deny` | 禁止访问 | 无匹配规则时的默认行为 |

#### 决策逻辑

```
1. 查找当前角色 + 当前资源的所有规则
2. 按 priority 降序排列
3. 取第一条匹配的规则（First Match Wins）
4. 如果无规则匹配 → 返回 deny（最小权限原则）
```

#### 参考表结构（data_scope_rules）

```sql
CREATE TABLE data_scope_rules (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id          BIGINT UNSIGNED NOT NULL REFERENCES roles(id),
  resource         VARCHAR(50) NOT NULL,
  scope_type       ENUM('all', 'own', 'condition', 'deny') NOT NULL,
  owner_field      VARCHAR(50),
  condition_field  VARCHAR(50),
  condition_operator ENUM('eq', 'in', 'ne') DEFAULT 'eq',
  condition_value  JSON,
  priority         INT NOT NULL DEFAULT 0
);
```

### 5.3 字段级过滤（field_scope_rules）

控制每个角色对每种资源中哪些字段可见、隐藏或脱敏。

#### visibility 策略

| 策略 | 含义 | 示例 |
|------|------|------|
| `visible` | 字段正常返回 | 默认行为 |
| `hidden` | 字段从结果中删除 | viewer 看不到 configs 的 `value` |
| `masked` | 字段值替换为脱敏值 | viewer 看到用户邮箱为 `a***@bicli.dev` |

#### 默认行为

- 如果某角色对某资源没有任何 field_scope_rules 记录 → **全部字段可见**
- 只需声明要隐藏或脱敏的字段

#### 参考表结构（field_scope_rules）

```sql
CREATE TABLE field_scope_rules (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id       BIGINT UNSIGNED NOT NULL REFERENCES roles(id),
  resource      VARCHAR(50) NOT NULL,
  field_name    VARCHAR(50) NOT NULL,
  visibility    ENUM('visible', 'hidden', 'masked') NOT NULL DEFAULT 'visible',
  mask_pattern  VARCHAR(50) DEFAULT NULL,
  priority      INT NOT NULL DEFAULT 0
);
```

#### 脱敏模式（mask_pattern）

| 模式 | 输入 | 输出 |
|------|------|------|
| `email` | `alice@bicli.dev` | `a***@bicli.dev` |
| `phone` | `13812345678` | `138****5678` |
| (默认) | `secret_data` | `s**********a` |

### 5.4 适用工具清单

以下标记了 demo MCP Server 中每个工具是否应用行级/字段级过滤：

| 工具 | 资源 | 行级过滤 | 字段级过滤 |
|------|------|---------|-----------|
| `user_list` | users | ✅ | ✅ |
| `user_manage` | users | — | — |
| `form_create` | forms | — | — |
| `form_manage` | forms | — | — |
| `form_query` | forms + form_fields | ✅ | ✅ |
| `data_query` | users/forms/form_fields/configs | ✅ | ✅ |
| `data_aggregate` | users/forms/form_fields/configs | ✅ | ✅ |
| `config_get` | configs | — | ✅ |
| `config_set` | configs | — | — |
| `role_list` | roles | — | — |
| `role_manage` | roles | — | — |
| `self_permissions` | — | — | — |

> 写操作（manage/create/set）依赖功能权限控制（Layer 1-2），不做行级/字段级过滤。

---

## 生产 MCP Server 替换步骤

### 第一步：实现协议接口

1. 实现 `listTools()` → 返回所有工具，每个工具带 `_meta.requiredPermissions`
2. 实现 `self_permissions` 工具 → 无权限限制，返回当前用户角色和权限
3. 实现业务工具 → 接受 `_context`，返回 `ToolResponse` 格式

### 第二步：实现数据过滤

4. 在查询工具中实现行级过滤（基于角色的数据范围规则）
5. 在查询工具中实现字段级过滤（基于角色的字段可见性规则）

### 第三步：接入 Core

6. 修改启动配置，将 `EngineOptions.mcpServerPath` 指向新的 MCP Server
7. 如果使用 Token 认证，修改 `_context` 结构为 `{ token: string }`

### 验证清单

- [ ] `listTools()` 返回带 `_meta.requiredPermissions` 的工具列表
- [ ] `self_permissions` 工具能返回任意用户的角色和权限
- [ ] 所有工具正确解析 `_context` 并进行功能权限校验
- [ ] 读取类工具对不同角色返回不同范围的数据（行级）
- [ ] 读取类工具对不同角色隐藏/脱敏敏感字段（字段级）
- [ ] 所有响应遵循 `ToolResponse` 统一格式
- [ ] 缺少 `_context` 时返回明确错误
- [ ] CLI/Core/Skills 代码零修改

---

## 附录：Demo MCP Server 中的角色权限矩阵

### 功能权限

| 权限 | admin | editor | viewer |
|------|-------|--------|--------|
| user:read | ✅ | ✅ | ✅ |
| user:write | ✅ | — | — |
| form:read | ✅ | ✅ | ✅ |
| form:write | ✅ | ✅ | — |
| data:read | ✅ | ✅ | ✅ |
| config:read | ✅ | ✅ | ✅ |
| config:write | ✅ | — | — |
| role:read | ✅ | — | — |
| role:write | ✅ | — | — |

### 行级数据范围

| 角色 | 资源 | 范围 |
|------|------|------|
| admin | * | all |
| editor | forms / form_fields / users / configs | all |
| viewer | forms | condition: status = 'published' |
| viewer | form_fields | all |
| viewer | users | condition: status = 'active' |
| viewer | configs | all |

### 字段级可见性

| 角色 | 资源 | 字段 | 策略 | 脱敏模式 |
|------|------|------|------|---------|
| viewer | users | email | masked | email |
| viewer | users | roleId | hidden | — |
| viewer | configs | value | hidden | — |
| viewer | configs | updatedBy | hidden | — |
| viewer | forms | createdBy | hidden | — |
| admin | * | * | (无规则 = 全可见) | — |
| editor | * | * | (无规则 = 全可见) | — |
