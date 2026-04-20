# BiCLI 完整使用指南

> AI 驱动的终端工具平台 — 可嵌入任何软件系统的 AI 能力层。

---

## 目录

1. [项目概览](#1-项目概览)
2. [项目架构](#2-项目架构)
3. [环境准备](#3-环境准备)
4. [安装与初始化](#4-安装与初始化)
5. [启动方式](#5-启动方式)
6. [CLI 命令参考](#6-cli-命令参考)
7. [斜杠命令参考](#7-斜杠命令参考)
8. [模型管理](#8-模型管理)
9. [权限体系](#9-权限体系)
10. [MCP 工具一览](#10-mcp-工具一览)
11. [Skills 系统](#11-skills-系统)
12. [数据库表结构](#12-数据库表结构)
13. [嵌入式集成（Phase 4）](#13-嵌入式集成phase-4)
14. [系统集成（生产对接）](#14-系统集成生产对接)
15. [项目命令速查](#15-项目命令速查)
16. [常见问题](#16-常见问题)

---

## 1. 项目概览

BiCLI 是一个 AI 驱动的终端工具平台，包含三大核心元素：

| 元素 | 说明 |
|------|------|
| **CLI** | 终端交互层。通过 TUI / Web GUI / 嵌入式 Widget 与用户交互，内部调用 LLM 编排工具 |
| **MCP Server** | 软件能力层。提供 20 个标准化工具接口，含 RBAC 权限、数据过滤、审计、审批 |
| **Skills** | 知识引导层。25 个 Skill 定义，指导 LLM 精准命中工具、组合多步操作 |

核心价值：**MCP 可独立剥离替换为生产系统接口**，使 AI 能力无缝嵌入任何软件。

---

## 2. 项目架构

```
bicli/
├── packages/
│   ├── core/          @bicli/core       无头引擎（LLM 编排、MCP 客户端、权限、会话、斜杠命令）
│   ├── cli/           @bicli/cli        TUI 界面 + 命令行入口（Commander.js + Ink）
│   ├── mcp-server/    @bicli/mcp-server MCP 服务端（stdio + HTTP 双传输，Drizzle ORM + MySQL）
│   ├── skills/        @bicli/skills     Skill 定义加载与匹配
│   ├── web/           @bicli/web        Web GUI（Express + WebSocket，内嵌 HTML 客户端）
│   ├── embed/         @bicli/embed      浏览器 SDK（轻量编排，不依赖 Node.js）
│   └── widget/        @bicli/widget     React Chat 组件（即插即用，消费 @bicli/embed）
├── docs/                                设计文档、协议规范
├── .env                                 环境变量（数据库 + LLM Key）
└── pnpm-workspace.yaml                  Monorepo 配置
```

**两种运行模式**：

| 模式 | 架构 | 适用场景 |
|------|------|---------|
| CLI 模式 | `CLI → Core → MCP(stdio)` | 开发者本地使用，TUI / Web GUI |
| 嵌入模式 | `前端 → Embed SDK → MCP(HTTP) + LLM API` | 集成到任意前端应用，多用户 |

---

## 3. 环境准备

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 22.0.0 | 推荐使用 nvm 管理版本 |
| pnpm | >= 10.0.0 | `npm install -g pnpm` |
| MySQL | 8.x | 本地或远程均可 |

---

## 4. 安装与初始化

### 4.1 安装依赖

```bash
pnpm install
```

### 4.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
# MySQL 连接（必填）
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=bicli

# LLM API Key（至少配置一个）
ALIBABA_API_KEY=sk-xxxx
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

| 变量 | 说明 | 必填 |
|------|------|------|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接信息 | 是 |
| `ALIBABA_API_KEY` | 阿里通义千问 API Key | 三选一 |
| `OPENAI_API_KEY` | OpenAI API Key | 三选一 |
| `ANTHROPIC_API_KEY` | Anthropic API Key | 三选一 |

> 默认使用阿里千问（qwen-plus）。也支持通过 `/model add` 添加自定义模型端点。

### 4.3 初始化数据库

```sql
CREATE DATABASE IF NOT EXISTS bicli DEFAULT CHARACTER SET utf8mb4;
```

```bash
# 推送 14 张表结构到数据库
pnpm db:push

# 灌入 Mock 数据
pnpm seed
```

Mock 数据包含：
- 3 个角色（admin / editor / viewer）+ 对应权限
- 10 个用户
- 3 个表单 + 字段
- 5 条系统配置
- 行级数据范围规则 + 字段级可见性规则
- 3 条审批数据（已通过 / 待审批 / 已驳回）

### 4.4 验证 MCP Server

```bash
npx tsx packages/cli/bin/bicli.ts mcp status
```

预期输出：

```
MCP Server: ● Connected
Available tools: 20
  - user_list, user_manage, form_create, form_manage, form_query
  - data_query, data_aggregate, config_get, config_set
  - role_list, role_manage, self_permissions
  - audit_query, approval_submit, approval_review, approval_query
  - session_save, session_load, session_list, session_delete
```

---

## 5. 启动方式

### 5.1 交互式 TUI

```bash
pnpm dev:cli
```

进入富文本终端界面，顶部状态栏显示模型、MCP 连接状态和当前角色，底部输入框可直接对话或输入斜杠命令。

### 5.2 单条消息模式

```bash
npx tsx packages/cli/bin/bicli.ts chat -m "查询所有用户"
npx tsx packages/cli/bin/bicli.ts chat -m "创建一个员工登记表单，包含姓名、邮箱、部门"
npx tsx packages/cli/bin/bicli.ts chat -m "统计各角色的用户数量"
```

### 5.3 Web GUI

```bash
npx tsx packages/cli/bin/bicli.ts web
```

浏览器打开 **http://127.0.0.1:3210**，功能与 TUI 完全一致（对话、模型切换、用户切换、Skill、工具调用展示、斜杠命令等）。

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-p, --port` | 3210 | 监听端口 |
| `--host` | 127.0.0.1 | 绑定地址 |

### 5.4 嵌入式 Demo（Phase 4）

```bash
pnpm dev:mcp-http
```

浏览器打开 **http://localhost:3211**，体验嵌入式 AI 能力。与 5.1~5.3 的区别：

| 对比项 | CLI / Web GUI | 嵌入式 Demo |
|--------|--------------|-------------|
| MCP 通信 | stdio（进程间通信） | HTTP（网络请求） |
| LLM 调用 | Node.js 后端 | 浏览器直接调用 |
| 会话存储 | 本地文件 `~/.bicli/sessions/` | MySQL 数据库 |
| 多用户 | 单用户 | 支持多用户隔离 |
| 使用场景 | 开发者本地 | 集成到任意前端 |

Demo 页面左侧可配置 LLM 端点、API Key、User ID、角色，可动态切换身份验证权限差异。

---

## 6. CLI 命令参考

```bash
npx tsx packages/cli/bin/bicli.ts <command>
```

| 命令 | 说明 |
|------|------|
| `chat` | 启动交互式 AI 对话（TUI 模式） |
| `chat -m "消息"` | 单条消息模式（非交互） |
| `web` | 启动 Web GUI |
| `mcp status` | 查看 MCP Server 连接状态和工具列表 |
| `config show` | 查看当前配置 |
| `config set <key> <value>` | 设置配置项（如 `user.userId 2`） |
| `config reset` | 重置为默认配置 |
| `login --token <token>` | 保存认证 Token |
| `logout` | 清除认证 Token |
| `whoami` | 查看当前认证状态 |

---

## 7. 斜杠命令参考

在 TUI、Web GUI 或嵌入式 Demo 的对话框中输入，以 `/` 开头：

| 命令 | 说明 |
|------|------|
| `/help` | 显示所有可用命令 |
| `/model` | 列出可用模型 |
| `/model <id或编号>` | 切换模型 |
| `/model add <endpoint> <model> <apiKey>` | 添加自定义模型 |
| `/model remove <id>` | 删除自定义模型 |
| `/user` | 列出所有用户（含角色信息） |
| `/user <id或用户名>` | 切换用户身份（测试不同权限） |
| `/role` | 查看当前角色和权限列表 |
| `/tools` | 显示可用工具列表 |
| `/skill` | 列出已加载的 Skill |
| `/skill create <name>` | 创建新 Skill |
| `/history` | 查看历史会话列表 |
| `/save [标题]` | 保存当前会话 |
| `/title <标题>` | 设置当前会话标题 |
| `/clear` | 清空对话历史 |

---

## 8. 模型管理

模型注册表存储在 `~/.bicli/models.json`。

### 内置模型

| ID | 名称 | 提供商 | 模型标识 |
|----|------|--------|---------|
| `qwen-plus` | 通义千问 Plus | alibaba | qwen-plus |
| `qwen-max` | 通义千问 Max | alibaba | qwen-max |
| `gpt-4` | GPT-4 | openai | gpt-4 |
| `claude-sonnet` | Claude Sonnet | anthropic | claude-sonnet-4-20250514 |

### 添加自定义模型

**方式一：斜杠命令（推荐）**

```
/model add https://your-endpoint.com/v1 model-name your-api-key
```

**方式二：编辑配置文件**

在 `~/.bicli/models.json` 的 `models` 数组中追加：

```json
{
  "id": "my-model",
  "name": "我的私有模型",
  "provider": "custom",
  "model": "model-name",
  "endpoint": "https://host:port/v1",
  "apiKey": "env:MY_API_KEY"
}
```

> `apiKey` 支持 `env:` 前缀从环境变量读取，避免明文存储。

---

## 9. 权限体系

BiCLI 实现了三层权限过滤，模拟生产级 RBAC：

| 层级 | 位置 | 作用 |
|------|------|------|
| Layer 1 | Core — Skill 匹配 | 根据用户权限过滤可用 Skill |
| Layer 2 | Core — Tool 过滤 | 根据 `requiredPermissions` 过滤可用工具 |
| Layer 3 | MCP Server — 数据过滤 | 行级过滤（data_scope_rules）+ 字段级过滤（field_scope_rules） |

### 角色定义

| 角色 | 定位 | 关键权限 |
|------|------|---------|
| admin | 超级管理员 | 所有资源的 read/write/delete + 审计查看 + 审批 |
| editor | 编辑者 | 表单/用户/配置的 read/write + 审批 |
| viewer | 只读用户 | 只有 read 权限，数据受条件过滤 |

### 行级数据范围（data_scope_rules）

| 角色 | 资源 | 策略 | 说明 |
|------|------|------|------|
| admin | * | all | 看到所有数据 |
| editor | forms / users / configs | all | 看到所有数据 |
| viewer | forms | condition: status=published | 只看已发布表单 |
| viewer | users | condition: status=active | 只看活跃用户 |
| admin / editor | approval | own: submitted_by,reviewer_id | 看到自己提交或审批的 |

### 字段级可见性（field_scope_rules）

| 角色 | 资源 | 字段 | 效果 |
|------|------|------|------|
| viewer | users | email | 脱敏显示 `a***@bicli.dev` |
| viewer | users | roleId | 隐藏 |
| viewer | configs | value / updatedBy | 隐藏 |
| viewer | forms | createdBy | 隐藏 |
| admin / editor | * | * | 全部可见 |

### 测试权限差异

在 TUI / Web GUI 中用 `/user` 切换身份，同一个查询在不同角色下会得到不同结果：

```
/user 1          → admin，看到所有数据
/user 4          → viewer，看到过滤后的数据 + 字段脱敏
```

> 详细权限协议规范参见 [MCP 权限协议文档](./mcp-permission-protocol.md)。

---

## 10. MCP 工具一览

共 20 个工具（`audit_write` 为内部工具，不对外暴露）：

### 基础业务工具（12 个）

| 工具 | 权限 | 说明 |
|------|------|------|
| `user_list` | user:read | 分页查询用户，支持状态/角色/关键词筛选 |
| `user_manage` | user:write | 创建/更新/删除用户 ⚠️ 删除需确认 |
| `form_create` | form:write | 根据描述创建表单及字段定义 |
| `form_manage` | form:write | 更新/删除表单 ⚠️ 删除需确认 |
| `form_query` | form:read | 查询表单列表或详情（含字段） |
| `data_query` | data:read | 通用数据查询，条件筛选/排序/分页 |
| `data_aggregate` | data:read | 聚合统计（COUNT/SUM/AVG），支持 GROUP BY |
| `config_get` | config:read | 读取系统配置项 |
| `config_set` | config:write | 创建或更新配置项 |
| `role_list` | role:read | 查询角色及权限列表 |
| `role_manage` | role:write | 创建/更新/删除角色 ⚠️ 删除需确认 |
| `self_permissions` | 无 | 获取当前用户的角色和权限 |

### 审计 & 审批工具（4 个）

| 工具 | 权限 | 说明 |
|------|------|------|
| `audit_query` | audit:read | 查询操作审计日志，支持多维筛选 |
| `approval_submit` | approval:write | 提交审批申请 |
| `approval_review` | approval:review | 通过/驳回/转审 ⚠️ 驳回需确认 |
| `approval_query` | approval:read | 查询审批列表和详情 |

### 会话工具（4 个）

| 工具 | 权限 | 说明 |
|------|------|------|
| `session_save` | 无（自身数据） | 创建新会话或追加消息 |
| `session_load` | 无 | 加载指定会话的消息列表 |
| `session_list` | 无 | 列出当前用户的历史会话 |
| `session_delete` | 无 | 删除指定会话 ⚠️ 需确认 |

> ⚠️ 标记表示该工具为敏感操作（`destructive`），在 TUI/Web GUI 中执行前会弹出二次确认。

---

## 11. Skills 系统

共 25 个预装 Skill，分为三类：

### 核心业务 Skill

| Skill | 说明 | 所需工具 |
|-------|------|---------|
| form-builder | 多步骤表单创建 | form_create, form_query |
| form-lifecycle | 表单全生命周期管理 | form_create, form_manage, form_query |
| data-query | 智能数据查询 | data_query, data_aggregate |
| data-analysis | 数据分析与可视化建议 | data_query, data_aggregate |
| user-onboarding | 用户入职流程 | user_manage, role_manage |
| user-offboarding | 用户离职流程 | user_manage |
| rbac-admin | 角色权限管理 | role_list, role_manage, self_permissions |
| config-manager | 系统配置管理 | config_get, config_set |
| batch-operations | 批量操作 | user_manage, form_manage |

### 办公协作 Skill

| Skill | 说明 |
|-------|------|
| docx | Word 文档处理 |
| xlsx | Excel 表格处理 |
| pptx | PPT 演示文稿处理 |
| pdf | PDF 文档处理 |
| internal-comms | 内部通讯/通知 |
| doc-coauthoring | 文档协同编辑 |

### 系统管理 Skill

| Skill | 说明 |
|-------|------|
| approval-workflow | 审批工作流操作 |
| audit-viewer | 审计日志查看 |
| session-manager | 会话历史管理 |
| security-audit | 安全审计 |
| system-dashboard | 系统仪表盘 |
| report-generator | 报表生成 |
| smart-search | 智能搜索 |
| help-guide | 帮助引导 |
| mcp-builder | MCP 工具构建 |
| skill-creator | Skill 创建引导 |

Skill 定义位于 `packages/skills/definitions/<skill-name>/SKILL.md`，部分 Skill 含 `reference/` 目录提供详细参考文档。

---

## 12. 数据库表结构

共 14 张表：

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `roles` | 角色定义 | name, description |
| `users` | 用户表 | username, email, roleId, status |
| `role_permissions` | 角色-权限映射 | roleId, permission, resource |
| `forms` | 表单定义 | name, description, createdBy, status |
| `form_fields` | 表单字段 | formId, label, type, fieldOrder, required |
| `configs` | 系统配置 | key, value(JSON), updatedBy |
| `data_scope_rules` | 行级数据范围规则 | roleId, resource, scopeType, ownerField |
| `field_scope_rules` | 字段级可见性规则 | roleId, resource, fieldName, visibility |
| `audit_logs` | 操作审计日志 | userId, toolName, action, status, sessionId |
| `approvals` | 审批单 | title, type, submittedBy, reviewerId, status |
| `approval_actions` | 审批操作记录 | approvalId, actorId, action, comment |
| `sessions` | 会话（嵌入模式） | userId, title, status |
| `session_messages` | 会话消息 | sessionId, role, content, toolName, durationMs |

---

## 13. 嵌入式集成（Phase 4）

将 BiCLI 的 AI 能力嵌入到任何前端应用中。

### 13.1 MCP HTTP Server

MCP Server 支持 stdio 和 HTTP 双传输模式。嵌入式场景使用 HTTP：

```bash
pnpm dev:mcp-http
# 监听 http://0.0.0.0:3211
# Demo 页面: http://localhost:3211
# 健康检查: http://localhost:3211/health
# MCP 端点: POST http://localhost:3211/mcp
```

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `MCP_HTTP_PORT` | 3211 | HTTP 端口 |
| `MCP_HTTP_HOST` | 0.0.0.0 | 绑定地址 |
| `MCP_CORS_ORIGIN` | * | CORS 允许的 origin |

### 13.2 @bicli/embed — 浏览器 SDK

轻量级编排引擎，在浏览器内运行，不依赖 Node.js：

```typescript
import { EmbedEngine } from "@bicli/embed";

const engine = new EmbedEngine({
  mcpEndpoint: "http://localhost:3211/mcp",
  llmConfig: {
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    apiKey: "sk-xxx",
  },
  userId: 1,
  userRole: "admin",
});

await engine.initialize(); // 连接 MCP，获取工具列表

for await (const event of engine.chat("查询所有用户")) {
  // event.type: text_delta / tool_call_start / tool_call_end / error / done
  console.log(event);
}

await engine.saveSession("我的会话"); // 保存到数据库
await engine.dispose();
```

### 13.3 @bicli/widget — React Chat 组件

即插即用的 React 聊天组件，消费 `@bicli/embed`：

```tsx
import { BiCLIChat } from "@bicli/widget";

function App() {
  return (
    <BiCLIChat
      mcpEndpoint="http://localhost:3211/mcp"
      llmConfig={{
        endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "qwen-plus",
        apiKey: currentUser.apiKey,
      }}
      userId={currentUser.id}
      userRole={currentUser.role}
      token={authToken}
      theme="dark"
    />
  );
}
```

### 13.4 会话持久化（DB）

嵌入模式下会话存储在 MySQL 数据库（非本地文件），通过 MCP Session 工具实现，所有数据按 `userId` 严格隔离：

- `session_save` — 创建新会话或追加消息
- `session_load` — 加载指定会话
- `session_list` — 列出用户历史会话
- `session_delete` — 删除会话

### 13.5 数据隔离总结

| 数据类型 | 隔离方式 | 说明 |
|---------|---------|------|
| 会话消息 | `sessions.userId` 硬编码过滤 | 只能看自己的会话 |
| 审计日志 | `audit_logs.userId` + `audit:read` 权限 | admin 可看全部 |
| 业务数据 | `data_scope_rules` + `field_scope_rules` | 按角色过滤行和字段 |
| 审批单 | `data_scope_rules` (own: submitted_by,reviewer_id) | 按参与关系过滤 |

---

## 14. 系统集成（生产对接）

BiCLI 设计为**可嵌入的 AI 能力层**，支持与任何已有软件系统对接。核心机制是 **PermissionAdapter 适配器模式**：

### 权限适配器

| 模式 | 环境变量 | 用途 |
|------|---------|------|
| `local` | `PERMISSION_MODE=local`（默认） | 使用 BiCLI 自身数据库做权限校验，适合 Demo / 独立部署 |
| `http` | `PERMISSION_MODE=http` | 通过 HTTP 调用宿主系统的权限 API，适合生产集成 |

### 生产对接三步走

1. **权限对接** — 在宿主后端实现 4 个标准 API（身份解析 / 权限查询 / 数据范围 / 字段可见性）
2. **业务 MCP 接入** — 将宿主业务接口按 MCP 工具规范封装，注册到 BiCLI
3. **前端嵌入** — 使用 `@bicli/embed` + `@bicli/widget` 集成到宿主前端

### 配置示例

```bash
# .env
PERMISSION_MODE=http
PERMISSION_API_URL=https://your-backend.example.com/api/bicli-auth
PERMISSION_API_TIMEOUT=5000
```

> **详细内容请参阅 → [系统集成技术白皮书 (integration-guide.md)](./integration-guide.md)**
>
> 包含：完整接口规范、权限映射表、代码示例、安全规范、FAQ 等。

---

## 15. 项目命令速查

### pnpm 脚本

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有依赖 |
| `pnpm db:push` | 推送表结构到数据库 |
| `pnpm seed` | 灌入 Mock 数据 |
| `pnpm dev:cli` | 启动 CLI（TUI 模式） |
| `pnpm dev:mcp` | 单独启动 MCP Server（stdio，调试用） |
| `pnpm dev:mcp-http` | 启动 MCP HTTP Server + Demo 页面 |
| `pnpm build` | 编译全部包 |
| `pnpm test` | 运行全部测试 |

### CLI 命令

| 命令 | 说明 |
|------|------|
| `npx tsx packages/cli/bin/bicli.ts chat` | 交互式 TUI |
| `npx tsx packages/cli/bin/bicli.ts chat -m "消息"` | 单条消息 |
| `npx tsx packages/cli/bin/bicli.ts web` | 启动 Web GUI |
| `npx tsx packages/cli/bin/bicli.ts mcp status` | MCP 状态 |
| `npx tsx packages/cli/bin/bicli.ts config show` | 查看配置 |
| `npx tsx packages/cli/bin/bicli.ts login --token <token>` | 保存 Token |
| `npx tsx packages/cli/bin/bicli.ts whoami` | 查看认证状态 |

---

## 16. 常见问题

### Q: `pnpm db:push` 报连接错误

检查 `.env` 中的数据库连接信息是否正确，MySQL 是否已启动。

### Q: `chat -m` 报 API Key 错误

确认 `.env` 中至少配置了一个有效的 LLM API Key。默认使用 `qwen-plus`，需要 `ALIBABA_API_KEY`。可通过 `/model` 切换到其他模型。

### Q: MCP Server 连接失败

运行 `pnpm dev:mcp` 单独启动 MCP Server 查看错误日志，通常是数据库连接问题。

### Q: 权限不足（Permission denied）

当前用户角色没有对应权限。在对话中输入 `/user` 查看可用用户，`/user 1` 切换到 admin 角色。

### Q: 添加自定义模型失败（Forbidden / Not Found）

确保 endpoint 以 `/v1` 结尾（OpenAI 兼容格式），API Key 正确，模型名称与服务端一致。示例：

```
/model add https://dashscope.aliyuncs.com/compatible-mode/v1 qwen-plus sk-xxx
```

### Q: 嵌入式 Demo 无法连接 MCP

确保先启动 `pnpm dev:mcp-http`（端口 3211），然后在 Demo 页面左侧点击「连接」。

### Q: 浏览器调用 LLM 时 CORS 报错

确保 LLM API 端点支持 CORS。阿里千问的 `dashscope.aliyuncs.com` 默认支持。如使用私有部署模型，需在模型网关配置 `Access-Control-Allow-Origin`。

---

> 更多设计文档：
> - [系统设计文档](./2026-04-16-bicli-system-design.md)
> - [Phase 2 权限设计](./2026-04-16-bicli-phase2-design.md)
> - [Phase 3 安全 & 审计设计](./2026-04-16-bicli-phase3-design.md)
> - [MCP 权限协议规范](./mcp-permission-protocol.md)
