# BiCLI

> AI 驱动的终端工具平台 —— 可嵌入任何软件系统的 AI 能力层。

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10.0.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-~6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![MCP](https://img.shields.io/badge/MCP-1.x-black)](https://modelcontextprotocol.io/)
[![License](https://img.shields.io/badge/license-Private-lightgrey)](#license)

BiCLI 将 **CLI 交互 + MCP 工具 + Skills 知识** 组合为一套可复用的 AI 能力底座，既可作为开发者的终端 AI 工具使用，也可作为 SDK 嵌入到任意 Web 应用中。

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Running Modes](#running-modes)
- [CLI Commands](#cli-commands)
- [Slash Commands](#slash-commands)
- [Permission Model](#permission-model)
- [MCP Tools](#mcp-tools)
- [Skills](#skills)
- [Embedding into Your App](#embedding-into-your-app)
- [Production Integration](#production-integration)
- [Scripts](#scripts)
- [Documentation](#documentation)
- [FAQ](#faq)
- [License](#license)

---

## Overview

BiCLI 包含三个核心元素：

| 元素 | 作用 |
|------|------|
| **CLI** | 终端交互层。通过 TUI / Web GUI / 嵌入式 Widget 与用户交互，内部调用 LLM 编排工具 |
| **MCP Server** | 软件能力层。提供 20 个标准化工具接口，内置 RBAC 权限、数据过滤、审计、审批 |
| **Skills** | 知识引导层。25 个 Skill 定义，指导 LLM 精准命中工具、组合多步操作 |

核心价值：**MCP 可独立剥离替换为生产系统接口**，使 AI 能力无缝嵌入任何软件。

---

## Features

- **双运行模式**：CLI（stdio）+ 嵌入式（HTTP），一次实现、多处复用。
- **多 LLM 适配**：默认阿里通义千问，支持 OpenAI、Anthropic 与任意 OpenAI 兼容端点。
- **20 个 MCP 工具**：覆盖用户、表单、数据、配置、角色、审计、审批、会话。
- **25 个预装 Skills**：核心业务、办公协作、系统管理三大类。
- **三层权限过滤**：Skill 匹配 → Tool 过滤 → 行级/字段级数据过滤。
- **审计与审批**：所有敏感操作记录日志，支持工作流审批。
- **富 TUI 与 Web GUI**：基于 Ink 的终端界面、基于 Express + WebSocket 的 Web 客户端。
- **浏览器 SDK**：`@bicli/embed` 轻量编排引擎，不依赖 Node.js。
- **即插即用 React 组件**：`@bicli/widget` 提供完整聊天界面。
- **PermissionAdapter**：`local` / `http` 两种模式，便于对接宿主系统 RBAC。

---

## Architecture

```
                        +---------------------------+
                        |     User / Host System    |
                        +------------+--------------+
                                     |
        +----------------------------+----------------------------+
        |                            |                            |
+-------v--------+         +---------v---------+         +--------v--------+
|   CLI (TUI)    |         |     Web GUI       |         |  Embed Widget   |
|  @bicli/cli    |         |   @bicli/web      |         | @bicli/widget   |
+-------+--------+         +---------+---------+         +--------+--------+
        |                            |                            |
        +--------------+-------------+--------------+-------------+
                       |                            |
               +-------v---------+          +-------v--------+
               |  @bicli/core    |          | @bicli/embed   |
               |  LLM Orchestr.  |          | Browser SDK    |
               +-------+---------+          +-------+--------+
                       | stdio                      | HTTP
                       +-------------+--------------+
                                     |
                         +-----------v-----------+
                         |   @bicli/mcp-server   |
                         |   (MCP + RBAC + DB)   |
                         +-----------+-----------+
                                     |
                              +------v------+
                              |    MySQL    |
                              +-------------+
```

两种运行模式：

| 模式 | 调用链 | 适用场景 |
|------|--------|---------|
| CLI 模式 | `CLI → Core → MCP(stdio)` | 开发者本地使用、TUI / Web GUI |
| 嵌入模式 | `前端 → Embed SDK → MCP(HTTP) + LLM API` | 集成到任意前端应用，多用户 |

---

## Repository Layout

```
bicli/
├── packages/
│   ├── core/          @bicli/core        无头引擎（LLM 编排、MCP 客户端、权限、会话、斜杠命令）
│   ├── cli/           @bicli/cli         TUI 界面 + 命令行入口（Commander.js + Ink）
│   ├── mcp-server/    @bicli/mcp-server  MCP 服务端（stdio + HTTP 双传输，Drizzle ORM + MySQL）
│   ├── skills/        @bicli/skills      Skill 定义加载与匹配
│   ├── web/           @bicli/web         Web GUI（Express + WebSocket，内嵌 HTML 客户端）
│   ├── embed/         @bicli/embed       浏览器 SDK（轻量编排，不依赖 Node.js）
│   └── widget/        @bicli/widget      React Chat 组件（即插即用，消费 @bicli/embed）
├── docs/                                 设计文档与协议规范
├── .env.example                          环境变量示例
└── pnpm-workspace.yaml                   Monorepo 配置
```

---

## Requirements

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | `>= 22.0.0` | 推荐使用 nvm 管理 |
| pnpm | `>= 10.0.0` | `npm install -g pnpm` |
| MySQL | `8.x` | 本地或远程均可 |

---

## Quick Start

### 1. 克隆并安装

```bash
git clone <your-repo-url> bicli
cd bicli
pnpm install
```

### 2. 配置环境变量

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

### 3. 初始化数据库

```sql
CREATE DATABASE IF NOT EXISTS bicli DEFAULT CHARACTER SET utf8mb4;
```

```bash
pnpm db:push   # 推送 14 张表结构
pnpm seed      # 灌入 Mock 数据
```

### 4. 启动并验证

```bash
# 交互式 TUI
pnpm dev:cli

# 或者快速验证 MCP
npx tsx packages/cli/bin/bicli.ts mcp status
```

预期输出：

```
MCP Server: Connected
Available tools: 20
```

---

## Running Modes

### Interactive TUI

```bash
pnpm dev:cli
```

### 单条消息（Headless）

```bash
npx tsx packages/cli/bin/bicli.ts chat -m "查询所有用户"
npx tsx packages/cli/bin/bicli.ts chat -m "创建一个员工登记表单，包含姓名、邮箱、部门"
```

### Web GUI

```bash
npx tsx packages/cli/bin/bicli.ts web
# 默认 http://127.0.0.1:3210
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `-p, --port` | `3210` | 监听端口 |
| `--host` | `127.0.0.1` | 绑定地址 |

### Embed Demo（HTTP MCP）

```bash
pnpm dev:mcp-http
# 浏览器打开 http://localhost:3211
```

| 对比项 | CLI / Web GUI | 嵌入式 Demo |
|--------|--------------|-------------|
| MCP 通信 | stdio（进程间） | HTTP（网络） |
| LLM 调用 | Node.js 后端 | 浏览器直接调用 |
| 会话存储 | 本地文件 `~/.bicli/sessions/` | MySQL 数据库 |
| 多用户 | 单用户 | 按 `userId` 隔离 |

---

## CLI Commands

```bash
npx tsx packages/cli/bin/bicli.ts <command>
```

| 命令 | 说明 |
|------|------|
| `chat` | 启动交互式 AI 对话（TUI） |
| `chat -m "消息"` | 单条消息模式 |
| `web` | 启动 Web GUI |
| `mcp status` | 查看 MCP 连接状态和工具列表 |
| `config show` | 查看当前配置 |
| `config set <key> <value>` | 设置配置项 |
| `config reset` | 重置为默认配置 |
| `login --token <token>` | 保存认证 Token |
| `logout` | 清除认证 Token |
| `whoami` | 查看当前认证状态 |

---

## Slash Commands

在 TUI / Web GUI / 嵌入式 Demo 的对话框中使用，以 `/` 开头：

| 命令 | 说明 |
|------|------|
| `/help` | 显示所有可用命令 |
| `/model` | 列出可用模型 |
| `/model <id 或编号>` | 切换模型 |
| `/model add <endpoint> <model> <apiKey>` | 添加自定义模型 |
| `/model remove <id>` | 删除自定义模型 |
| `/user` | 列出所有用户（含角色） |
| `/user <id 或用户名>` | 切换用户身份 |
| `/role` | 查看当前角色和权限 |
| `/tools` | 显示可用工具列表 |
| `/skill` | 列出已加载的 Skill |
| `/skill create <name>` | 创建新 Skill |
| `/history` | 查看历史会话 |
| `/save [标题]` | 保存当前会话 |
| `/title <标题>` | 设置会话标题 |
| `/clear` | 清空对话历史 |

---

## Permission Model

BiCLI 实现三层权限过滤，模拟生产级 RBAC：

| 层级 | 位置 | 作用 |
|------|------|------|
| Layer 1 | Core - Skill 匹配 | 根据用户权限过滤可用 Skill |
| Layer 2 | Core - Tool 过滤 | 根据 `requiredPermissions` 过滤可用工具 |
| Layer 3 | MCP Server - 数据过滤 | 行级（`data_scope_rules`）+ 字段级（`field_scope_rules`） |

内置角色：

| 角色 | 定位 | 关键权限 |
|------|------|---------|
| `admin` | 超级管理员 | 所有资源 read/write/delete + 审计 + 审批 |
| `editor` | 编辑者 | 表单/用户/配置 read/write + 审批 |
| `viewer` | 只读用户 | 仅 read，数据受条件过滤与字段脱敏 |

> 详见 [`docs/mcp-permission-protocol.md`](./docs/mcp-permission-protocol.md)。

---

## MCP Tools

共 20 个工具（`audit_write` 为内部工具，不对外暴露）。

**业务工具（12）**

| 工具 | 权限 | 说明 |
|------|------|------|
| `user_list` | `user:read` | 分页查询用户 |
| `user_manage` | `user:write` | 创建 / 更新 / 删除用户（删除需确认） |
| `form_create` | `form:write` | 根据描述创建表单及字段 |
| `form_manage` | `form:write` | 更新 / 删除表单（删除需确认） |
| `form_query` | `form:read` | 查询表单列表或详情 |
| `data_query` | `data:read` | 通用数据查询 |
| `data_aggregate` | `data:read` | 聚合统计（COUNT/SUM/AVG，支持 GROUP BY） |
| `config_get` | `config:read` | 读取系统配置 |
| `config_set` | `config:write` | 创建 / 更新配置 |
| `role_list` | `role:read` | 查询角色与权限 |
| `role_manage` | `role:write` | 创建 / 更新 / 删除角色（删除需确认） |
| `self_permissions` | - | 获取当前用户角色与权限 |

**审计与审批（4）**

| 工具 | 权限 | 说明 |
|------|------|------|
| `audit_query` | `audit:read` | 查询操作审计日志 |
| `approval_submit` | `approval:write` | 提交审批申请 |
| `approval_review` | `approval:review` | 通过 / 驳回 / 转审（驳回需确认） |
| `approval_query` | `approval:read` | 查询审批列表与详情 |

**会话（4）**

| 工具 | 权限 | 说明 |
|------|------|------|
| `session_save` | - | 创建新会话或追加消息 |
| `session_load` | - | 加载指定会话 |
| `session_list` | - | 列出当前用户的历史会话 |
| `session_delete` | - | 删除会话（需确认） |

---

## Skills

共 25 个预装 Skill，分为三类。Skill 定义位于 `packages/skills/definitions/<skill-name>/SKILL.md`。

**核心业务**：`form-builder`, `form-lifecycle`, `data-query`, `data-analysis`, `user-onboarding`, `user-offboarding`, `rbac-admin`, `config-manager`, `batch-operations`

**办公协作**：`docx`, `xlsx`, `pptx`, `pdf`, `internal-comms`, `doc-coauthoring`

**系统管理**：`approval-workflow`, `audit-viewer`, `session-manager`, `security-audit`, `system-dashboard`, `report-generator`, `smart-search`, `help-guide`, `mcp-builder`, `skill-creator`

---

## Embedding into Your App

将 BiCLI 的 AI 能力嵌入任意前端应用。

### 1. 启动 MCP HTTP Server

```bash
pnpm dev:mcp-http
# 监听 http://0.0.0.0:3211
# MCP 端点: POST http://localhost:3211/mcp
# 健康检查: GET  http://localhost:3211/health
```

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `MCP_HTTP_PORT` | `3211` | HTTP 端口 |
| `MCP_HTTP_HOST` | `0.0.0.0` | 绑定地址 |
| `MCP_CORS_ORIGIN` | `*` | CORS 允许的 origin |

### 2. `@bicli/embed` - 浏览器 SDK

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

await engine.initialize();

for await (const event of engine.chat("查询所有用户")) {
  // event.type: text_delta | tool_call_start | tool_call_end | error | done
  console.log(event);
}

await engine.saveSession("我的会话");
await engine.dispose();
```

### 3. `@bicli/widget` - React Chat 组件

```tsx
import { BiCLIChat } from "@bicli/widget";

export function App() {
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

---

## Production Integration

BiCLI 设计为**可嵌入的 AI 能力层**。核心机制是 **PermissionAdapter**：

| 模式 | 环境变量 | 用途 |
|------|---------|------|
| `local` | `PERMISSION_MODE=local`（默认） | 使用 BiCLI 自身数据库校验，适合 Demo / 独立部署 |
| `http` | `PERMISSION_MODE=http` | 通过 HTTP 调用宿主系统权限 API，适合生产集成 |

```dotenv
PERMISSION_MODE=http
PERMISSION_API_URL=https://your-backend.example.com/api/bicli-auth
PERMISSION_API_TIMEOUT=5000
```

生产对接三步走：

1. **权限对接** - 在宿主后端实现 4 个标准 API（身份解析 / 权限查询 / 数据范围 / 字段可见性）。
2. **业务 MCP 接入** - 将宿主业务接口按 MCP 工具规范封装，注册到 BiCLI。
3. **前端嵌入** - 使用 `@bicli/embed` + `@bicli/widget` 集成到宿主前端。

> 详见 [`docs/integration-guide.md`](./docs/integration-guide.md)。

---

## Scripts

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装所有依赖 |
| `pnpm db:push` | 推送表结构到数据库 |
| `pnpm db:generate` | 生成 Drizzle migration |
| `pnpm seed` | 灌入 Mock 数据 |
| `pnpm dev:cli` | 启动 CLI（TUI 模式） |
| `pnpm dev:mcp` | 单独启动 MCP Server（stdio，调试用） |
| `pnpm dev:mcp-http` | 启动 MCP HTTP Server + Demo 页面 |
| `pnpm build` | 编译全部包 |
| `pnpm test` | 运行全部测试 |

---

## Documentation

| 文档 | 说明 |
|------|------|
| [`docs/getting-started.md`](./docs/getting-started.md) | 完整使用指南（中文） |
| [`docs/integration-guide.md`](./docs/integration-guide.md) | 系统集成技术白皮书 |
| [`docs/mcp-permission-protocol.md`](./docs/mcp-permission-protocol.md) | MCP 权限协议规范 |
| [`docs/2026-04-16-bicli-system-design.md`](./docs/2026-04-16-bicli-system-design.md) | 系统设计文档 |
| [`docs/2026-04-16-bicli-phase2-design.md`](./docs/2026-04-16-bicli-phase2-design.md) | Phase 2 权限设计 |
| [`docs/2026-04-16-bicli-phase3-design.md`](./docs/2026-04-16-bicli-phase3-design.md) | Phase 3 安全与审计设计 |

---

## FAQ

**Q: `pnpm db:push` 报连接错误？**
A: 检查 `.env` 中的数据库连接信息，并确认 MySQL 已启动。

**Q: `chat -m` 报 API Key 错误？**
A: 确认 `.env` 中至少配置了一个有效的 LLM API Key，默认使用 `qwen-plus`（需要 `ALIBABA_API_KEY`）。

**Q: MCP Server 连接失败？**
A: 运行 `pnpm dev:mcp` 单独启动 MCP Server 查看错误日志，通常是数据库连接问题。

**Q: 权限不足（Permission denied）？**
A: 当前用户角色没有对应权限。在对话中输入 `/user` 查看可用用户，`/user 1` 切换到 admin。

**Q: 添加自定义模型失败？**
A: 确保 endpoint 以 `/v1` 结尾（OpenAI 兼容格式），例如：

```
/model add https://dashscope.aliyuncs.com/compatible-mode/v1 qwen-plus sk-xxx
```

**Q: 嵌入式 Demo 无法连接 MCP？**
A: 确保先启动 `pnpm dev:mcp-http`（端口 3211），然后在 Demo 页面左侧点击「连接」。

**Q: 浏览器调用 LLM 时 CORS 报错？**
A: 确保 LLM API 端点支持 CORS。阿里千问 `dashscope.aliyuncs.com` 默认支持；私有部署模型需在网关配置 `Access-Control-Allow-Origin`。

---

## License

Private - Internal use only.
