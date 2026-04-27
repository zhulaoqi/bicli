# DataEye × BiCLI 集成技术白皮书

> 版本: 1.0 | 日期: 2026-04-16 | 状态: 实施中

## 1. 概述

### 1.1 项目背景

DataEye 是一个多租户数据分析平台（Java/Spring Boot），包含事件管理、数据表管理、SQL 查询等核心能力。BiCLI 是一个 AI 驱动的终端工具平台，通过 MCP 协议编排 LLM 与业务工具。

本方案将 BiCLI 的 AI 能力嵌入 DataEye，使用户能够通过自然语言与 DataEye 的数据交互。

### 1.2 目标

- 用户在 DataEye 界面内通过 AI 助手查询事件、探索数据表、执行 SQL 分析
- 权限完全复用 DataEye 现有的 RBAC 体系（JWT + 组织隔离）
- 零侵入 DataEye 核心业务逻辑，仅增量添加

### 1.3 技术决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| userId 类型 | `string \| number` | DataEye 用 `varchar(32)` 主键 |
| 后端对接方式 | 新增 `BicliAuthController` | 最小改动，独立模块 |
| LLM API Key 位置 | BiCLI MCP Server 持有 | 不侵入 DataEye 后端 |
| 前端嵌入方式 | 右侧 Drawer 面板 | 不影响现有布局 |
| 业务优先级 | 事件管理 + 数据表管理 → AI 问数 | 从基础数据探索到智能分析 |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    dataeye-frontend (React)                   │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────────┐    │
│  │ Sidebar  │  │   Main   │  │    BiCLI AI Panel       │    │
│  │          │  │ (Router) │  │  ┌───────────────────┐  │    │
│  │ - 事件   │  │          │  │  │   Chat Messages    │  │    │
│  │ - 数据表 │  │          │  │  ├───────────────────┤  │    │
│  │ - SQL    │  │          │  │  │   Input + Send     │  │    │
│  └──────────┘  └──────────┘  │  └───────────────────┘  │    │
│                               └─────────────────────────┘    │
│  JWT Token (Cookie: AUTHORIZATION_TOKEN)                      │
└──────────┬──────────────────────────────────┬────────────────┘
           │                                  │
           │ 业务 API                          │ /bicli-mcp/*
           ▼                                  ▼
┌──────────────────────┐      ┌─────────────────────────────┐
│  dataeye-server      │      │   BiCLI MCP HTTP Server     │
│  (Spring Boot)       │◄─────│   (Node.js)                 │
│                      │      │                             │
│  ┌────────────────┐  │  JWT │  ┌───────────────────────┐  │
│  │ BicliAuth      │◄─┼──────┼──│ DataeyePermission     │  │
│  │ Controller     │  │      │  │ Adapter               │  │
│  ├────────────────┤  │      │  ├───────────────────────┤  │
│  │ /identity      │  │      │  │ dataeye_event_list    │  │
│  │ /permissions   │  │proxy │  │ dataeye_event_property│  │
│  │ /datasources   │  │◄─────┼──│ dataeye_table_list    │  │
│  ├────────────────┤  │      │  │ dataeye_table_detail  │  │
│  │ EventManage    │  │      │  │ dataeye_dws_table     │  │
│  │ BiDataSource   │  │      │  │ dataeye_sql_query     │  │
│  │ SqlEditor      │  │      │  │ dataeye_project_list  │  │
│  └────────────────┘  │      │  └───────────────────────┘  │
│                      │      │                             │
│  UserContextHelper   │      │  LLM (API Key here)         │
│  JWT → UserExt       │      │  Skills + Context           │
└──────────────────────┘      └─────────────────────────────┘
                                        │
                                        ▼
                              ┌───────────────────┐
                              │   LLM Provider     │
                              │   (Qwen/GPT/...)   │
                              └───────────────────┘
```

---

## 3. 权限对接设计

### 3.1 DataEye 权限模型

```
Organization (org_id)
  ├── User (user.id: varchar(32))
  │     └── rel_org_user (user ↔ org)
  ├── Role (role.id: varchar(32), org_id)
  │     ├── rel_role_user (role ↔ user, org)
  │     └── rel_role_permission (role ↔ permission, org)
  ├── Permission (code, type: MENU/BUTTON)
  ├── UserGroup
  │     ├── rel_group_user
  │     └── rel_role_group
  └── Project → Product → Event/DataSource
```

### 3.2 BiCLI 权限模型

```
userId (string|number) + role (string)
  → permissions: string[]  (格式: resource:action)
  → dataScope: per-org isolation (orgId from JWT)
```

### 3.3 权限映射策略

| DataEye 概念 | BiCLI 映射 | 说明 |
|-------------|-----------|------|
| JWT userId | ToolContext.userId (string) | 透传，不转换 |
| JWT orgId | ToolContext.orgId (string) | 数据隔离维度 |
| Role.name | ToolContext.role | 取用户第一个角色 |
| Permission.code (MENU) | resource:read | 拥有菜单 = 可读 |
| Permission.code (BUTTON) | resource:write | 拥有按钮 = 可写 |
| OrgOwner role | 全部权限 | 管理员降级策略 |

### 3.4 适配器调用流程

```
用户发送消息
  → 前端附带 JWT (Cookie → Header)
  → BiCLI MCP Server 收到请求
  → DataeyePermissionAdapter.resolveIdentity()
    → GET /bicli/auth/identity (JWT passthrough)
    → dataeye-server 解析 JWT，返回 {id, orgId, roles}
  → DataeyePermissionAdapter.getPermissions()
    → GET /bicli/auth/permissions
    → dataeye-server 查 rel_role_permission，映射为 BiCLI 格式
  → 权限校验通过
  → 执行 MCP 工具 (代理 dataeye API)
```

### 3.5 降级策略

当 `BicliAuthController` 尚未部署时，`DataeyePermissionAdapter` 会降级：
- `resolveIdentity`: 使用 direct 模式（前端直传 userId + role）
- `getPermissions`: 根据角色名推断默认权限（admin → 全部，viewer → 只读）

---

## 4. MCP 工具设计

### 4.1 工具清单

| 工具名 | 代理 API | 功能 | 权限 |
|--------|---------|------|------|
| `dataeye_project_list` | `/tenant/project/list/user`, `/tenant/product/list/user` | 列出用户可访问的项目和产品 | data:read |
| `dataeye_event_list` | `POST /eventManage/event/page` | 按产品查询事件列表 | event:read |
| `dataeye_event_property` | `/eventManage/event/property/page`, `/eventManage/event/property/nopage` | 查询事件属性 | event:read |
| `dataeye_table_list` | `GET /biDataSource/pageByBiDataSource` | 查询数据表列表 | table:read |
| `dataeye_table_detail` | `GET /biDataSource/getByBiDataSource`, `GET /biDwsTable/getTableInfo` | 获取表结构和字段 | table:read |
| `dataeye_dws_table` | `GET /biDwsTable/listDwsTable`, `GET /biDwsTable/getTableInfo` | 查询 StarRocks 物理表 | table:read |
| `dataeye_sql_query` | `POST /sql-editor/execSql` | 执行只读 SQL 查询 | sql:execute |

### 4.2 工具代理原理

所有 dataeye 业务工具均为**代理模式**：

1. BiCLI MCP 工具接收 LLM 调用
2. 从 `ToolContext` 提取 JWT token
3. 转发到 DataEye 后端 API（`Authorization: Bearer <jwt>`）
4. DataEye 后端自行完成权限校验和数据隔离
5. 返回结果给 LLM 继续处理

```
LLM → dataeye_event_list(productId=42, _context={token: "jwt..."})
  → BiCLI proxy → POST dataeye-server/eventManage/event/page
    → dataeye AuthInterceptor validates JWT
    → dataeye EventManageService queries by productId
    → returns event list
  → BiCLI formats result → LLM generates response
```

### 4.3 安全约束

- **SQL 注入防护**: `dataeye_sql_query` 禁止 DDL/DML，只允许 SELECT
- **自动 LIMIT**: 未指定 LIMIT 的查询自动添加 LIMIT 100
- **双重权限**: BiCLI 层校验 `sql:execute` 权限，DataEye 后端再校验 JWT

---

## 5. Skill 设计

### 5.1 dataeye-event-explore

**目标**: 引导用户逐步探索事件体系

**编排流程**:
```
用户: "看看事件"
  → Skill 匹配 trigger: "事件"
  → Step 1: dataeye_project_list (获取项目)
  → Step 2: 展示项目，用户选择
  → Step 3: dataeye_project_list (type=product, 获取产品)
  → Step 4: dataeye_event_list (按产品查事件)
  → Step 5: 表格展示，用户可深入某事件
  → Step 6: dataeye_event_property (查属性详情)
```

### 5.2 dataeye-data-query

**目标**: 自然语言 → SQL → 数据结果

**编排流程**:
```
用户: "最近7天每天有多少活跃用户？"
  → Skill 匹配 trigger: "查询"/"统计"
  → Step 1: dataeye_project_list (确定项目)
  → Step 2: dataeye_dws_table (查看可用表和字段)
  → Step 3: LLM 根据表结构生成 SQL
  → Step 4: dataeye_sql_query (执行 SQL)
  → Step 5: LLM 解读结果，展示表格 + 洞察
```

---

## 6. 前端集成

### 6.1 组件设计

`BiCLIPanel.tsx` — 固定右下角悬浮按钮 + Drawer 面板

```
Layout (index.tsx)
  ├── HeaderWrapper → Navbar
  ├── Layout
  │     ├── Sidebar
  │     └── Layout
  │           └── ContentWrapper → Main
  └── BiCLIPanel  ← 新增（全局浮动）
        ├── FloatingButton (右下角气泡)
        └── Drawer (右侧抽屉 420px)
              ├── MessagesContainer (聊天记录)
              └── InputContainer (输入 + 发送)
```

### 6.2 认证流程（Token 完整链路）

```
用户登录 dataeye
  → Cookie: AUTHORIZATION_TOKEN = "eyJhbGciOi..."

用户点击 AI 助手按钮
  → BiCLIPanel.tsx: getToken() 从 Cookie 读取 JWT

用户发送消息
  → POST /bicli-mcp/chat
    Headers: { Authorization: "Bearer eyJhbGciOi..." }
    Body: { message: "看看有哪些事件", history: [...] }

Nginx 代理
  → 转发到 BiCLI MCP HTTP Server (Node.js)

/chat 端点处理
  ① extractBearerToken(req) → token
  ② adapter.resolveIdentity({type:"token", token})
     → GET dataeye:8080/api/bicli/auth/identity (JWT 透传)
     → dataeye AuthInterceptor 验证 JWT → 返回 {id, orgId, roles}
  ③ adapter.getPermissions(role)
     → GET dataeye:8080/api/bicli/auth/permissions
     → 返回 BiCLI 格式权限列表
  ④ 调用 LLM (OpenAI-compatible API, key 在服务端)
  ⑤ LLM 返回 tool_calls → 执行 MCP 工具
     → 工具内部: args._context = {token: "eyJhbGciOi..."}
     → dateyeRequest() 设置 Headers: { Authorization: "Bearer eyJhbGciOi..." }
     → 调用 dataeye 业务 API (如 /api/eventManage/event/page)
     → dataeye AuthInterceptor 再次验证 JWT → 返回业务数据
  ⑥ 工具结果 → LLM 生成最终回复 → 返回前端
```

**关键**: JWT 全程不存储在 BiCLI 服务端，每次请求都从前端传入，透传到 dataeye。

---

## 7. 部署架构

### 7.1 Nginx 配置

```nginx
server {
    listen 80;
    server_name dataeye.example.com;

    # DataEye 前端
    location / {
        proxy_pass http://frontend:3000;
    }

    # DataEye 后端 API
    location /api/ {
        proxy_pass http://backend:8080;
    }

    # BiCLI MCP HTTP Server
    location /bicli-mcp/ {
        proxy_pass http://bicli-mcp:3100/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
```

### 7.2 BiCLI MCP Server 环境变量

```bash
# 权限模式
PERMISSION_MODE=dataeye

# DataEye 后端地址（内网）
DATAEYE_API_URL=http://backend:8080
DATAEYE_API_TIMEOUT=5000

# LLM 配置
CUSTOM_API_URL=http://49.0.206.228:80/aihub/api/v1/
CUSTOM_MODEL=gpt-5.4
CUSTOM_API_KEY=your-key

# MCP HTTP Server
MCP_HTTP_PORT=3100
MCP_HTTP_HOST=0.0.0.0

# 数据库（BiCLI 内部数据：会话/审计）
DATABASE_URL=mysql://user:pass@mysql:3306/bicli
```

---

## 8. 改动清单

### 8.1 BiCLI 项目 (packages/mcp-server)

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/types/index.ts` | 修改 | userId: `number` → `number \| string`，新增 orgId |
| `src/auth/adapter.ts` | 修改 | resolveIdentity 返回 orgId，IdentityCredential 支持 orgId |
| `src/auth/dataeye-adapter.ts` | **新增** | DataEye 专属权限适配器 |
| `src/auth/create-adapter.ts` | 修改 | 新增 `dataeye` 模式 |
| `src/auth/local-adapter.ts` | 修改 | 适配新的返回类型 |
| `src/auth/http-adapter.ts` | 修改 | 适配新的返回类型 |
| `src/auth/rbac.ts` | 修改 | extractContext 支持 string userId + orgId |
| `src/tools/base.ts` | 修改 | resolvedContext 传递 orgId |
| `src/tools/dataeye-proxy.ts` | **新增** | dataeye API 代理基础设施 |
| `src/tools/dataeye-project-list.ts` | **新增** | 项目/产品列表工具 |
| `src/tools/dataeye-event-list.ts` | **新增** | 事件列表工具 |
| `src/tools/dataeye-event-property.ts` | **新增** | 事件属性工具 |
| `src/tools/dataeye-table-list.ts` | **新增** | 数据表列表工具 |
| `src/tools/dataeye-table-detail.ts` | **新增** | 数据表详情工具 |
| `src/tools/dataeye-dws-table.ts` | **新增** | DWS 物理表工具 |
| `src/tools/dataeye-sql-query.ts` | **新增** | SQL 查询工具 |
| `src/tools/register.ts` | 修改 | 注册 dataeye 工具（按环境变量条件加载） |
| 21 个已有工具文件 | 修改 | `Number(context.userId)` 适配 DB 写入 |

### 8.2 BiCLI 项目 (packages/skills)

| 文件 | 操作 | 说明 |
|------|------|------|
| `definitions/dataeye-event-explore/SKILL.md` | **新增** | 事件探索 Skill |
| `definitions/dataeye-event-explore/reference/event-model.md` | **新增** | 事件模型参考 |
| `definitions/dataeye-data-query/SKILL.md` | **新增** | AI 问数 Skill |
| `definitions/dataeye-data-query/reference/data-model.md` | **新增** | 数据模型参考 |

### 8.3 DataEye 后端 (dataeye-server)

| 文件 | 操作 | 说明 |
|------|------|------|
| `controller/BicliAuthController.java` | **新增** | 权限桥接 API（3 个端点） |

### 8.4 DataEye 前端 (dataeye-frontend)

| 文件 | 操作 | 说明 |
|------|------|------|
| `Layout/BiCLIPanel.tsx` | **新增** | AI 助手面板组件 |
| `Layout/index.tsx` | 修改 | 引入 BiCLIPanel |

---

## 9. 实施路线

### Phase A: 基础对接 ✅（当前）
- [x] BiCLI userId 适配 string
- [x] DataeyePermissionAdapter
- [x] 7 个 dataeye 代理工具
- [x] 2 个 dataeye Skills
- [x] BicliAuthController.java
- [x] BiCLIPanel.tsx + Layout 集成

### Phase B: 联调验证
- [ ] 部署 BiCLI MCP HTTP Server
- [ ] 配置 Nginx 代理
- [ ] DataEye 后端编译 + 部署 BicliAuthController
- [ ] DataEye 前端编译 + 验证 AI 面板
- [ ] 端到端测试：登录 → 打开 AI → 查事件 → 执行 SQL

### Phase C: 深度集成
- [ ] 事件分析报表工具（`/my-query-event/report`）
- [ ] 漏斗分析工具
- [ ] 数据看板 AI 解读
- [ ] 用户画像查询
- [ ] AI 生成的分析结果保存为"自助分析"

### Phase D: 产品化
- [ ] 对话历史持久化到 DataEye DB
- [ ] 审计日志集成
- [ ] 多模型切换 UI
- [ ] 快捷指令面板
- [ ] 流式响应支持

---

## 10. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| DataEye API 无统一前缀 | 代理配置复杂 | 在 BiCLI proxy 层硬编码路径映射 |
| JWT 过期 | AI 交互中断 | 前端检测 401 → 提示重新登录 |
| StarRocks 查询超时 | 用户等待过长 | 设置 10s 超时 + 友好提示 |
| 权限映射不精确 | 过度/不足授权 | 降级策略 + 日志审计 |
| 并发量大 | MCP Server 压力 | 水平扩展 + 连接池 |

---

## 附录

### A. 环境变量完整清单

```bash
# === BiCLI MCP Server ===
PERMISSION_MODE=dataeye          # 启用 dataeye 适配器
DATAEYE_API_URL=http://backend:8080  # dataeye 后端内网地址
DATAEYE_API_TIMEOUT=5000         # 权限 API 超时(ms)
DATABASE_URL=mysql://...         # BiCLI 内部 DB
MCP_HTTP_PORT=3100               # HTTP 端口
MCP_HTTP_HOST=0.0.0.0            # 监听地址

# LLM 配置（二选一）
ALIBABA_API_KEY=sk-xxx           # 阿里千问
CUSTOM_API_URL=http://...        # 自定义 OpenAI 兼容
CUSTOM_MODEL=gpt-5.4
CUSTOM_API_KEY=xxx
```

### B. DataEye 权限表速查

| 表 | 说明 | 关键字段 |
|----|------|---------|
| user | 用户 | id(varchar32), email, name |
| organization | 组织 | id, code, name, type |
| role | 角色 | id, org_id, name, type |
| rel_role_user | 角色-用户 | user_id, role_id, org_id |
| rel_role_permission | 角色-权限 | role_id, permission_id, org_id |
| rel_org_user | 组织-用户 | org_id, user_id, type |
| user_group | 用户组 | org_id, name, parent_id |
| rel_group_user | 组-用户 | group_id, user_id, org_id |
| rel_role_group | 角色-组 | role_id, group_id, org_id |
