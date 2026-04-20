# BiCLI 系统设计文档

> **版本:** 1.2  
> **日期:** 2026-04-16  
> **状态:** 待实现

---

## 1. 项目概述

BiCLI 是一个 AI 驱动的终端工具平台，包含三个独立子项目：

- **CLI** — TUI 终端界面 + CLI 内核，作为 MCP Client 与大模型编排交互
- **MCP Server** — 标准 MCP 协议服务端，提供 11 个业务工具接口
- **Skills** — 结构化知识文件，指导大模型精准使用 MCP 工具完成业务任务

三个子项目在 pnpm monorepo 中独立运行，通过标准 MCP 协议连接。

### 1.1 业务目标

- 通过自然语言完成用户管理、表单创建、数据查询、配置管理、权限管理等操作
- 支持 RBAC 权限模型，接口级别权限控制
- 全新开发的接口和数据库，自带 mock 数据，自包含可演示

### 1.2 技术目标

- CLI 支持 npm 全局安装，也可嵌入项目中使用
- MCP Server 遵循标准协议，可被 Cursor、Claude Desktop 等任意 MCP Client 复用
- 多模型适配（OpenAI / Anthropic / 阿里千问）
- Skill 系统可扩展，后续基于 Cursor 的"创建 Skill 的 Skill"迭代优化

### 1.3 安全边界声明

本项目为本地开发/演示项目，安全模型采用**信任本地客户端**模式：
- CLI 通过 stdio 拉起 MCP Server，两者在同一台机器同一用户下运行
- 用户身份通过 CLI 配置文件指定，MCP Server 信任 CLI 传递的身份信息
- 不涉及网络级别的身份认证（无 JWT/OAuth），权限校验在 MCP Server 进程内完成
- 如果未来需要远程部署，需引入 Token 认证机制（不在 v1.0 范围内）

---

## 2. 架构方案

采用 **标准 MCP 协议分离架构**：

```
@bicli/cli (MCP Client)
     │
     ├── 加载 @bicli/skills（Skill 定义文件）
     │
     └── 运行时通过 MCP 协议（stdio）连接
              │
              ▼
     @bicli/mcp-server (MCP Server，独立进程)
              │
              ▼
           MySQL 8.x
```

选择理由：
- 完全遵循 MCP 规范，MCP Server 可被任何 MCP Client 复用
- 三个子项目真正独立：MCP Server 可单独部署，CLI 可独立发布到 npm，Skills 可独立分发
- 社区兼容性最好，复杂度适中

---

## 3. 项目结构

```
bicli/
├── package.json                  # monorepo 根配置
├── pnpm-workspace.yaml
├── tsconfig.base.json            # 共享 TS 配置
├── .env.example                  # 环境变量模板
│
├── packages/
│   ├── cli/                      # @bicli/cli
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts          # 入口，命令注册
│   │   │   ├── tui/              # TUI 界面层（Ink）
│   │   │   ├── commands/         # CLI 命令定义
│   │   │   ├── llm/              # 大模型适配层
│   │   │   ├── mcp-client/       # MCP 客户端连接
│   │   │   ├── skill-loader/     # Skill 匹配与注入
│   │   │   │   ├── matcher.ts    # 根据用户输入匹配 Skill
│   │   │   │   └── injector.ts   # 将匹配的 Skill 注入 System Prompt
│   │   │   └── config/           # 用户配置管理
│   │   └── bin/
│   │       └── bicli.ts          # npm bin 入口
│   │
│   ├── mcp-server/               # @bicli/mcp-server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts          # MCP Server 启动入口
│   │   │   ├── tools/            # MCP Tools（11 个）
│   │   │   ├── resources/        # MCP Resources
│   │   │   ├── prompts/          # MCP Prompts
│   │   │   ├── db/               # 数据库层（MySQL + Drizzle ORM）
│   │   │   │   ├── schema.ts     # 表结构定义
│   │   │   │   ├── migrate.ts    # 迁移脚本
│   │   │   │   └── seed.ts       # Mock 数据填充
│   │   │   ├── auth/             # RBAC 权限模块
│   │   │   └── types/            # 共享类型定义
│   │   └── drizzle.config.ts
│   │
│   └── skills/                   # @bicli/skills
│       ├── package.json
│       ├── src/
│       │   ├── index.ts          # Skill 注册表 & 导出
│       │   └── parser.ts         # 解析 Markdown + YAML frontmatter
│       └── definitions/          # Skill 定义文件
│           ├── form-builder.md
│           ├── data-query.md
│           └── rbac-admin.md
│
├── docs/                         # 文档
└── scripts/                      # 开发脚本（setup、seed 等）
```

### 3.1 包间依赖关系

```
@bicli/cli  ──依赖──▸  @bicli/skills（加载 skill 定义 + 解析）
     │
     └── 运行时通过 MCP 协议连接 ──▸  @bicli/mcp-server（独立进程）

@bicli/skills  ──无依赖──  独立包，定义文件 + 解析器
@bicli/mcp-server  ──无依赖──  独立服务
```

### 3.2 模块职责划分

| 模块 | 所属包 | 职责 |
|------|--------|------|
| `skills/src/parser.ts` | `@bicli/skills` | 解析 Markdown + YAML frontmatter，导出结构化 Skill 对象 |
| `skills/src/index.ts` | `@bicli/skills` | Skill 注册表，扫描 definitions/ 并导出所有 Skill |
| `cli/src/skill-loader/matcher.ts` | `@bicli/cli` | 根据用户输入匹配 Skill（关键词匹配 triggers） |
| `cli/src/skill-loader/injector.ts` | `@bicli/cli` | 将匹配的 Skill 注入到 System Prompt，筛选 Tools |

---

## 4. 技术选型

| 层面 | 选型 | 理由 |
|------|------|------|
| Monorepo | pnpm workspace | 磁盘效率高，依赖隔离好 |
| 语言 | TypeScript 5.x | 全栈统一 |
| MCP SDK | `@modelcontextprotocol/sdk` | 官方 SDK |
| CLI 框架 | Commander.js | 成熟稳定的命令行框架 |
| TUI 渲染 | Ink (React for CLI) | React 模型渲染终端 UI，生态最好 |
| ORM | Drizzle ORM | 类型安全、轻量、SQL-first |
| 数据库 | MySQL 8.x | 正式关系型数据库 |
| LLM SDK | Vercel AI SDK (`ai`) | 统一多模型接口，原生支持 OpenAI/Anthropic/千问 |
| 测试框架 | Vitest | 与 Vite 生态统一，原生 TypeScript 支持，速度快 |

### 4.1 环境变量

项目所需的全部环境变量（`.env.example`）：

| 变量名 | 必填 | 默认值 | 用途 |
|--------|------|--------|------|
| `DB_HOST` | 否 | `localhost` | MySQL 主机 |
| `DB_PORT` | 否 | `3306` | MySQL 端口 |
| `DB_USER` | 是 | — | MySQL 用户名 |
| `DB_PASSWORD` | 是 | — | MySQL 密码 |
| `DB_NAME` | 否 | `bicli` | MySQL 数据库名 |
| `OPENAI_API_KEY` | 否 | — | OpenAI API Key |
| `ANTHROPIC_API_KEY` | 否 | — | Anthropic API Key |
| `DASHSCOPE_API_KEY` | 否 | — | 阿里千问 API Key（通过灵积平台） |

至少需要配置一个 LLM API Key。

### 4.2 配置优先级

**LLM API Key** 读取优先级（高 → 低）：

1. 环境变量（`OPENAI_API_KEY` 等）
2. 项目 `.env` 文件

API Key 不存入 `~/.bicli/config.json`，避免明文泄露。

**其他配置项**（model、transport、user 等）读取优先级（高 → 低）：

1. 环境变量
2. 用户配置文件（`~/.bicli/config.json`）
3. 项目 `.env` 文件

---

## 5. MCP Server 设计

### 5.1 数据库表设计（6 张表）

#### users — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| username | VARCHAR(50) UNIQUE | 用户名 |
| email | VARCHAR(100) UNIQUE | 邮箱 |
| role_id | INT FK → roles.id | 角色外键 |
| status | ENUM('active','inactive') | 状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### roles — 角色表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| name | VARCHAR(50) UNIQUE | 角色名 |
| description | VARCHAR(200) | 描述 |
| created_at | TIMESTAMP | 创建时间 |

#### role_permissions — 角色权限表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| role_id | INT FK → roles.id | 角色外键 |
| permission | VARCHAR(50) | 权限标识（如 user:read） |
| resource | VARCHAR(50) | 资源标识（如 user） |

#### forms — 表单表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | 表单名称 |
| description | TEXT | 表单描述 |
| created_by | INT FK → users.id | 创建者 |
| status | ENUM('draft','published','archived') | 状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### form_fields — 表单字段表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| form_id | INT FK → forms.id | 表单外键 |
| label | VARCHAR(100) | 字段标签 |
| type | ENUM('text','email','number','select','date','textarea') | 字段类型 |
| field_order | INT | 排序序号 |
| required | BOOLEAN | 是否必填 |
| validation | JSON | 校验规则 |
| options | JSON | 选项（select 类型用） |

`validation` JSON 结构：

```json
{
  "minLength": 2,
  "maxLength": 50,
  "pattern": "^[a-zA-Z0-9_]+$",
  "min": 0,
  "max": 200
}
```

`options` JSON 结构（仅 select 类型）：

```json
[
  { "label": "男", "value": "male" },
  { "label": "女", "value": "female" }
]
```

#### configs — 系统配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| key | VARCHAR(100) UNIQUE | 配置键 |
| value | JSON | 配置值 |
| description | VARCHAR(200) | 描述 |
| updated_by | INT FK → users.id | 最后更新者 |
| updated_at | TIMESTAMP | 更新时间 |

### 5.2 身份与权限传递机制

MCP 协议的 `tools/call` 请求体只有 `name` 和 `arguments`，没有原生的身份字段。本项目采用 **Tool 参数注入** 方案：

1. CLI 在用户配置中维护当前用户身份（`userId` + `role`）
2. CLI 启动时通过 `user_list` 工具验证用户存在性，确认 userId 和 role 匹配
3. 每次 Tool Call 时，CLI 自动在 `arguments` 中注入 `_context` 字段：

```typescript
{
  name: "form_create",
  arguments: {
    // 用户通过 LLM 构造的业务参数
    name: "员工入职表",
    fields: [...],
    // CLI 自动注入的身份上下文（LLM 不感知）
    _context: {
      userId: 1,
      role: "admin"
    }
  }
}
```

4. MCP Server 端每个 Tool 执行前，先从 `_context` 提取身份信息，校验权限，再执行业务逻辑
5. `_context` 字段不出现在 Tool 的 `inputSchema` 中（对 LLM 透明），由 CLI 的 `tool-caller.ts` 在发送前自动附加

**安全假设**：本地 stdio 传输模式下，信任 CLI 传递的 `_context`（见 §1.3 安全边界声明）。

### 5.3 MCP Tools（11 个）

#### 5.3.1 用户管理

**`user_list`** — 分页查询用户列表

```typescript
// inputSchema
{
  status?: "active" | "inactive",     // 按状态筛选
  role_id?: number,                    // 按角色筛选
  keyword?: string,                    // 按用户名/邮箱模糊搜索
  page?: number,                       // 页码，默认 1
  pageSize?: number                    // 每页条数，默认 20
}
// 权限: user:read
```

**`user_manage`** — 创建/更新/删除用户

```typescript
// inputSchema
{
  action: "create" | "update" | "delete",
  userId?: number,                     // update/delete 时必填
  data?: {                             // create/update 时必填
    username?: string,
    email?: string,
    role_id?: number,
    status?: "active" | "inactive"
  }
}
// 权限: user:write
```

#### 5.3.2 表单引擎

**`form_create`** — 创建表单及字段

```typescript
// inputSchema
{
  name: string,                        // 表单名称
  description?: string,                // 表单描述
  fields: Array<{
    label: string,                     // 字段标签
    type: "text" | "email" | "number" | "select" | "date" | "textarea",
    required?: boolean,                // 默认 false
    validation?: {                     // 校验规则
      minLength?: number,
      maxLength?: number,
      pattern?: string,
      min?: number,
      max?: number
    },
    options?: Array<{                  // select 类型的选项
      label: string,
      value: string
    }>
  }>
}
// 权限: form:write
```

**`form_manage`** — 更新/删除表单

```typescript
// inputSchema
{
  action: "update" | "delete",
  formId: number,                      // 目标表单 ID
  data?: {                             // update 时可选
    name?: string,
    description?: string,
    status?: "draft" | "published" | "archived"
  }
}
// 权限: form:write
```

**`form_query`** — 查询表单列表/详情

```typescript
// inputSchema
{
  formId?: number,                     // 指定则返回详情（含字段），否则返回列表
  status?: "draft" | "published" | "archived",
  page?: number,
  pageSize?: number
}
// 权限: form:read
```

#### 5.3.3 数据查询

**`data_query`** — 通用数据查询

```typescript
// inputSchema
{
  table: "users" | "forms" | "form_fields" | "configs",  // 白名单限制
  where?: Record<string,               // 条件筛选，通过 Drizzle query builder 构造
    | string | number | boolean          // 等值匹配: { status: "active" }
    | { $in: (string | number)[] }       // IN 查询: { role_id: { $in: [1, 2] } }
    | { $like: string }                  // 模糊匹配: { username: { $like: "%test%" } }
    | { $gte?: number | string; $lte?: number | string }  // 范围查询: { created_at: { $gte: "2026-01-01" } }
  >,
  orderBy?: {
    field: string,
    direction: "asc" | "desc"
  },
  page?: number,
  pageSize?: number
}
// 权限: data:read + 对应表的 read 权限（见 §5.4 权限穿透规则）
```

**`data_aggregate`** — 聚合统计

```typescript
// inputSchema
{
  table: "users" | "forms" | "form_fields" | "configs",  // 白名单限制
  metric: "count" | "sum" | "avg",
  field?: string,                      // sum/avg 时必填（须为数值字段）
  groupBy?: string,                    // 分组字段
  where?: Record<string,
    | string | number | boolean
    | { $in: (string | number)[] }
    | { $like: string }
    | { $gte?: number | string; $lte?: number | string }
  >
}
// 权限: data:read + 对应表的 read 权限
```

**安全约束**：
- `table` 参数为枚举白名单，禁止访问 `roles` 和 `role_permissions` 表（通过专用的 `role_list` 工具访问）
- 所有查询通过 Drizzle query builder 构造，禁止原始 SQL 输入
- `where` 条件的字段名会校验是否属于目标表的合法字段

#### 5.3.4 配置管理

**`config_get`** — 读取系统配置

```typescript
// inputSchema
{
  key?: string,                        // 指定则返回单条，否则返回全部
  keyword?: string                     // 按 key/description 模糊搜索
}
// 权限: config:read
```

**`config_set`** — 创建/更新配置项

```typescript
// inputSchema
{
  key: string,
  value: any,                          // JSON 值
  description?: string
}
// 权限: config:write
```

#### 5.3.5 权限管理

**`role_list`** — 查询角色及权限

```typescript
// inputSchema
{
  roleId?: number                      // 指定则返回详情（含权限列表），否则返回全部角色
}
// 权限: role:read
```

**`role_manage`** — 创建/更新角色，分配权限

```typescript
// inputSchema
{
  action: "create" | "update" | "delete",
  roleId?: number,                     // update/delete 时必填
  data?: {
    name?: string,
    description?: string,
    permissions?: string[]             // 如 ["user:read", "form:write"]
  }
}
// 权限: role:write
```

### 5.4 RBAC 权限模型

权限粒度采用 `resource:action` 格式：

```
user:read / user:write
form:read / form:write
data:read
config:read / config:write
role:read / role:write
```

预置角色：

| 角色 | 权限 |
|------|------|
| admin | 全部权限 |
| editor | user:read, form:read, form:write, data:read, config:read |
| viewer | user:read, form:read, data:read, config:read |

#### 权限穿透规则

`data_query` 和 `data_aggregate` 除了需要 `data:read` 权限外，还需要查询目标表对应的 `read` 权限：

| 查询 table | 额外需要的权限 |
|-----------|--------------|
| `users` | `user:read` |
| `forms` | `form:read` |
| `form_fields` | `form:read` |
| `configs` | `config:read` |

MCP Server 在执行 `data_query` / `data_aggregate` 时，先检查 `data:read`，再根据 `table` 参数动态检查对应资源的 `read` 权限。

### 5.5 传输方式

- **stdio**（v1.0，唯一支持）：CLI 通过子进程启动 MCP Server
- **SSE**（v2.0 规划）：HTTP Server-Sent Events，远程部署场景。需额外设计 Token 认证、CORS、端口配置等，不在当前版本范围内

### 5.6 Mock 数据

`seed.ts` 填充以下测试数据：

- 3 个角色（admin / editor / viewer）+ 对应权限
- 10 个测试用户（分布在不同角色）
- 3 个示例表单（含字段定义）
- 5 条系统配置

### 5.7 统一响应格式

```typescript
// 成功
{
  content: [{ type: "text", text: JSON.stringify({
    success: true,
    data: { ... },
    meta: { total: 100, page: 1, pageSize: 20 }
  })}]
}

// 失败
{
  content: [{ type: "text", text: JSON.stringify({
    success: false,
    error: { code: "PERMISSION_DENIED", message: "需要 form:write 权限" }
  })}],
  isError: true
}
```

---

## 6. CLI 设计

### 6.1 命令体系

```
bicli                        # 默认启动 TUI 交互界面
bicli chat                   # 进入对话模式（TUI）
bicli chat -m "查询所有用户"   # 单次命令模式（非 TUI，直接输出结果）
bicli config                 # 管理配置（API Key、模型选择等）
bicli config set model gpt-4
bicli config set api-key sk-xxx
bicli mcp start              # 手动启动 MCP Server
bicli mcp status             # 查看 MCP Server 连接状态
bicli seed                   # 初始化数据库 & 填充 mock 数据
```

### 6.2 TUI 界面布局

```
┌─────────────────────────────────────────────────────┐
│  bicli v1.0.0          Model: gpt-4    MCP: ● 连接中 │  ← 状态栏
├─────────────────────────────────────────────────────┤
│                                                     │
│  AI: 你好！我可以帮你管理用户、创建表单、查询数据。    │  ← 对话区
│      当前角色：admin（拥有全部权限）                   │
│                                                     │
│  You: 帮我创建一个用户注册表单                        │
│                                                     │
│  AI: 正在调用 form_create...                         │
│      ✅ 表单「用户注册」已创建，包含 5 个字段：        │
│      - 用户名 (text, 必填)                           │
│      - 邮箱 (email, 必填)                            │
│      - ...                                          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Tab] 切换面板  [Ctrl+C] 退出  [↑↓] 滚动           │  ← 快捷键栏
├─────────────────────────────────────────────────────┤
│  > 请输入...                                        │  ← 输入栏
└─────────────────────────────────────────────────────┘
```

### 6.3 大模型适配层

基于 Vercel AI SDK (`ai`) 实现统一多模型接口：

```
llm/
├── provider.ts         # 统一 Provider 接口
├── providers/
│   ├── openai.ts       # OpenAI (GPT-4, GPT-4o 等)
│   ├── anthropic.ts    # Anthropic (Claude 3.5/4 等)
│   └── qwen.ts         # 阿里千问 (qwen-plus, qwen-max 等)
├── tool-caller.ts      # MCP Tool → AI Function Calling 桥接 + _context 注入
└── session.ts          # 会话管理（历史消息、上下文窗口）
```

核心流程：

```
用户输入 → Skill 注入 System Prompt → LLM 推理
    → 需要调用工具? → tool-caller 注入 _context → MCP Client 发起 tool call
    → MCP Server 校验权限并执行 → 返回结果
    → LLM 基于结果生成最终回复 → TUI 渲染输出
```

### 6.4 MCP Client 连接管理

- CLI 启动时自动通过 stdio 拉起 MCP Server 子进程
- 维持连接，支持断线重连
- 工具发现：启动时调用 `tools/list` 获取可用工具列表，传递给 LLM 作为 function 定义
- 身份注入：`tool-caller.ts` 在每次 Tool Call 发送前自动附加 `_context`（见 §5.2）

### 6.5 会话管理

- **存储方式**：纯内存，不跨 CLI 重启持久化（v1.0 保持简单）
- **上下文窗口**：保留最近 20 轮对话（可通过 `~/.bicli/config.json` 的 `session.maxTurns` 配置）
- **Token 超限处理**：当消息历史接近模型 token 上限时，从最早的消息开始截断，始终保留 System Prompt 和最近 5 轮

### 6.6 配置管理

用户配置持久化到 `~/.bicli/config.json`：

```json
{
  "model": {
    "provider": "openai",
    "model": "gpt-4"
  },
  "mcp": {
    "transport": "stdio",
    "command": "bicli-mcp-server"
  },
  "user": {
    "userId": 1,
    "role": "admin"
  },
  "session": {
    "maxTurns": 20
  }
}
```

注意：API Key **不存储**在配置文件中，统一通过环境变量或 `.env` 文件管理（见 §4.2 配置优先级），避免明文泄露风险。

---

## 7. Skills 设计

### 7.1 定位

Skill 是结构化的知识文件（Markdown + YAML frontmatter），告诉大模型"在什么场景下、用哪些 MCP 工具、按什么步骤完成业务任务"。本质上是精调过的 System Prompt 片段。

先做几个默认 Skill 占位，后续依赖 Cursor 的"创建 Skill 的 Skill"基于实际 MCP 能力迭代优化。

### 7.2 Skill 定义格式

```markdown
---
name: form-builder
title: 智能表单创建
description: 根据用户需求创建动态表单
triggers:
  - 创建表单
  - 新建表单
required_tools:
  - form_create
  - form_query
required_permissions:
  - form:write
  - form:read
---

# 智能表单创建

（Skill 正文：角色定义、操作步骤、示例等）
```

### 7.3 默认 Skill 列表

| Skill | 文件 | 关联工具 | 场景 |
|-------|------|---------|------|
| 智能表单创建 | `form-builder.md` | `form_create`, `form_manage`, `form_query` | 自然语言 → 创建/管理表单 |
| 数据查询助手 | `data-query.md` | `data_query`, `data_aggregate`, `user_list` | 自然语言 → 灵活查询 |
| 权限管理向导 | `rbac-admin.md` | `role_list`, `role_manage`, `user_manage` | 引导式权限管理 |

Skill 内容为初始占位版本，后续通过"创建 Skill 的 Skill"持续优化。

### 7.4 加载机制

模块职责划分见 §3.2。加载流程：

1. CLI 启动 → 调用 `@bicli/skills` 的 `index.ts`，扫描 `definitions/*.md`，通过 `parser.ts` 解析 frontmatter
2. 返回结构化 Skill 对象数组给 CLI
3. CLI 的 `matcher.ts` 建立内存索引
4. 用户输入消息 → `matcher.ts` 检查是否命中 Skill 的 triggers
5. 命中 → 校验当前用户是否拥有 `required_permissions`
6. 权限通过 → `injector.ts` 将 Skill 正文注入本轮对话的 System Prompt，同时只传递 `required_tools` 给 LLM
7. 未命中 → 使用默认 System Prompt + 全部可用工具

---

## 8. 数据流

### 8.1 端到端流程

```
用户在 TUI 输入
       │
       ▼
  Skill Matcher — 匹配 Skill → 注入 System Prompt + 筛选 Tools
       │
       ▼
  LLM Provider — 携带 System Prompt + 消息历史 + Tools 定义，调用大模型 API
       │
       ├── 纯文本回复 → TUI 渲染
       │
       └── Tool Call 请求
              │
              ▼
         tool-caller.ts — 注入 _context（userId, role）
              │
              ▼
         MCP Client — 通过 stdio 转发
              │
              ▼
         MCP Server
           ├── 提取 _context，RBAC 权限校验
           ├── 执行具体业务逻辑（Drizzle query builder）
           └── MySQL 数据读写
              │
         Tool 执行结果返回
              │
              ▼
         LLM 基于结果生成自然语言回复
              │
              ▼
         TUI 渲染最终输出
```

### 8.2 错误处理

| 错误层级 | 场景 | 处理方式 |
|---------|------|---------|
| 网络层 | LLM API 超时/不可达 | 重试 2 次，失败后提示切换模型或检查网络 |
| 网络层 | MCP Server 连接断开 | 自动重连，3 次失败后提示 `bicli mcp start` |
| 认证层 | API Key 无效/过期 | 提示通过环境变量配置正确的 API Key |
| 权限层 | RBAC 校验不通过 | MCP Server 返回权限错误，LLM 向用户解释缺少哪些权限 |
| 业务层 | 数据库操作失败 | MCP Tool 返回结构化错误，LLM 翻译为用户友好提示 |
| 模型层 | Token 超限 | 自动截断历史消息，保留 System Prompt + 最近 5 轮 |

---

## 9. 测试策略

### 9.1 框架选择

使用 **Vitest** 作为统一测试框架，原生 TypeScript 支持，与 pnpm monorepo 兼容良好。

### 9.2 各包测试重点

| 包 | 测试类型 | 重点 |
|----|---------|------|
| `@bicli/mcp-server` | 单元测试 + 集成测试 | 每个 Tool 的参数校验、权限校验、业务逻辑；集成测试使用真实 MySQL（测试数据库） |
| `@bicli/skills` | 单元测试 | parser 解析 frontmatter 的正确性、异常文件处理 |
| `@bicli/cli` | 单元测试 | Skill matcher 匹配逻辑、_context 注入逻辑、配置加载 |

### 9.3 测试数据库

MCP Server 的集成测试使用独立的测试数据库（`bicli_test`），每次测试前通过 `seed.ts` 重置数据。

通过环境变量 `DB_NAME=bicli_test` 切换测试库，避免污染开发数据。
