# DataEye AI 助手增强 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DataEye 系统构建智能 AI 助手，新增 13 个写操作 MCP 工具、权限体系 Skill、3 个流程编排 Skill，使 LLM 能通过自然语言创建事件、管理属性、建立数据表，并在写操作前展示 dryRun 预览确认。

**Architecture:** 基于现有 `dataeye-proxy.ts` 代理模式扩展写操作工具；Skill 文档给 LLM 注入领域知识；dryRun 参数在工具层实现，不需要前端修改；所有 dataeye 工具的 `requiredPermissions` 统一为 `[]`（由 DataEye 后端自行鉴权）。

**Tech Stack:** Node.js/TypeScript, Drizzle ORM, Express, DataEye REST API (Spring Boot), YAML/Markdown Skills

**Spec:** `docs/superpowers/specs/2026-04-16-dataeye-ai-assistant-design.md`

---

## File Structure

### 新建文件
```
packages/mcp-server/src/tools/
  dataeye-event-group-list.ts      # 事件分组列表
  dataeye-event-group-add.ts       # 创建事件分组
  dataeye-event-create.ts          # 创建虚拟事件
  dataeye-event-update.ts          # 编辑事件
  dataeye-event-status.ts          # 启/停用事件
  dataeye-event-property-save.ts   # 保存自定义属性
  dataeye-event-analysis.ts        # 事件分析查询
  dataeye-table-validate-name.ts   # 校验表名
  dataeye-table-create.ts          # 创建数据表
  dataeye-table-update-status.ts   # 更新数据表状态
  dataeye-user-list.ts             # 组织用户列表
  dataeye-role-list.ts             # 组织角色列表
  dataeye-product-create.ts        # 创建产品

packages/skills/definitions/
  dataeye-permissions/SKILL.md     # 权限体系知识
  dataeye-event-management/SKILL.md # 事件创建向导
  dataeye-table-management/SKILL.md # 数据表创建向导
  dataeye-event-analysis/SKILL.md  # 事件分析向导
```

### 修改文件
```
packages/mcp-server/src/tools/register.ts
  - 注册 13 个新工具
  - 修复现有 dataeye 工具的 requiredPermissions 为 []

packages/mcp-server/src/http-server.ts
  - 在 initToolHandlers() 中添加 13 个新工具的 dynamic import

packages/skills/definitions/dataeye-event-explore/SKILL.md
  - 移除错误的 requiredPermissions
  - 加入权限导航规则

packages/skills/definitions/dataeye-data-query/SKILL.md
  - 移除错误的 requiredPermissions
  - 加入项目导航前置步骤
```

---

## Chunk 1: 知识基础 — 权限 Skill + 修复现有 Skill

### Task 1.1: 创建 `dataeye-permissions` Skill

**Files:**
- Create: `packages/skills/definitions/dataeye-permissions/SKILL.md`

- [ ] **Step 1: 创建 Skill 文件**

```markdown
---
name: dataeye-permissions
description: DataEye 平台权限体系知识 — 帮助 AI 正确理解数据访问层级和权限规则，避免错误诊断
triggers:
  - 权限
  - 看不到
  - 没有权限
  - 访问被拒
  - 列表为空
  - 项目为空
  - 产品为空
  - 无法访问
  - permission
  - forbidden
---

# DataEye 权限体系

## 核心数据层级

```
Platform（平台）
  └── Organization（组织，type=tenant）
        ├── rel_org_user → 用户-组织关联（含用户类型）
        ├── rel_role_user → 用户-角色关联（一个用户可有多个角色）
        └── Project（项目，org_id 关联，属于且仅属于一个组织）
              └── Product（产品，project_id 关联）
                    ├── 事件定义（bi_event_schema，通过 productId 关联）
                    ├── 事件属性（bi_event_schema_property）
                    └── 数据表（bi_data_source，通过 project_id 关联）
```

## 数据访问控制（三级）

```
用户 → 角色（rel_role_user）
  └── 项目权限（rel_role_project）
        ├── all_product = 1 → 该项目下【所有产品】可见
        └── all_product = 0 → 只有 rel_role_product 中明确授权的产品可见
```

**关键规则：**
- 事件和数据表的可见性由"能否访问其所属产品/项目"决定，没有独立的"事件权限"
- `permission` 表是功能权限（菜单/按钮），与数据可见性完全分离
- 用户可能在同一组织下有多个角色，访问范围取各角色的并集

## 正确导航顺序

**必须按顺序调用，不可跳步：**

```
步骤1: dataeye_project_list(type="project")
   → 获取当前用户在当前组织内有权访问的项目列表

步骤2: dataeye_project_list(type="product", projectId=<选定项目ID>)
   → 获取该项目下当前用户有权访问的产品列表

步骤3: 根据目标操作选择工具
   → 事件相关: dataeye_event_list(productId=<选定产品ID>)
   → 数据表相关: dataeye_table_list(projectId=<选定项目ID>)
   → SQL查询: dataeye_datasource_list → dataeye_sql_query
```

跳过任何一步将导致参数缺失错误，不是权限问题。

## 常见现象与正确诊断

| 现象 | 真实原因 | 正确说法 | 错误说法（禁止） |
|------|----------|----------|-----------------|
| 项目列表为空 `[]` | 角色未绑定任何项目（rel_role_project 无记录） | "您的当前角色尚未被授权访问任何项目，请联系管理员在角色配置中添加项目权限" | "权限配置异常" / "系统故障" |
| 产品列表为空 `[]` | all_product=0 且无产品授权，或项目下确实无产品 | "当前项目下您的角色未被授权访问任何产品" | "权限配置错误" |
| 事件列表为空 `[]` | 该产品尚未定义任何事件（正常状态） | "该产品当前没有已定义的事件" | "无权访问事件" |
| SQL 查询报错 | sourceId 不正确或对应表不存在 | "查询所用的数据源 ID 可能有误，请先调用 dataeye_datasource_list 确认" | "SQL执行权限不足" |
| 接口返回 401 | JWT 已过期 | "您的登录凭证已过期，请刷新页面重新登录" | "权限被拒绝" |

## 权限诊断流程

当用户遇到访问问题时：

```
1. 先确认能否访问项目（调 dataeye_project_list）
   ↓ 如果项目列表为空
2. 建议用户联系管理员检查：
   - 角色是否绑定了项目（rel_role_project）
   - 如果有项目但产品为空，检查 all_product 标志
   ↓ 如果项目存在但特定操作失败
3. 检查是否是功能权限问题（操作按钮级别）
4. 若是 DataEye 后端返回的业务错误，原文转述错误信息给用户
```

## 注意事项

- **不要推测权限配置**：看到空列表不等于权限异常，先确认层级导航是否正确
- **不要绕过层级**：必须先有 projectId 才能查产品，必须先有 productId 才能操作事件
- **组织 ID 由 JWT 自动携带**：调工具时不需要单独传 orgId，后端从 token 中解析
```

- [ ] **Step 2: 验证文件结构正确**

```bash
ls packages/skills/definitions/dataeye-permissions/
```
Expected output: `SKILL.md`

---

### Task 1.2: 更新 `dataeye-event-explore` Skill

**Files:**
- Modify: `packages/skills/definitions/dataeye-event-explore/SKILL.md`

- [ ] **Step 1: 更新 frontmatter — 移除错误权限要求**

将 SKILL.md 的 frontmatter 中 `requiredPermissions` 部分删除（dataeye 工具不需要 BiCLI 内部权限）：

```yaml
---
name: dataeye-event-explore
description: 探索 Dataeye 事件体系 — 帮助用户理解产品的埋点事件结构、事件属性和数据含义
triggers:
  - 查看事件
  - 事件列表
  - 事件属性
  - 有哪些事件
  - 埋点事件
  - 事件探索
  - event
  - 看看产品的事件
requiredTools:
  - dataeye_project_list
  - dataeye_event_list
  - dataeye_event_property
---
```

- [ ] **Step 2: 在工作流程第一步前加权限说明**

在"第一步：确定项目和产品"前加入以下段落：

```markdown
## 权限说明

本 Skill 需要按顺序导航 DataEye 数据层级。若项目或产品列表为空，参考 `dataeye-permissions` Skill 进行正确诊断，不要猜测权限异常。

必须先获取项目 → 再获取产品 → 才能查事件，不可跳步。
```

- [ ] **Step 3: 在末尾加错误处理说明**

```markdown
## 错误处理

| 情况 | 处理方式 |
|------|----------|
| 项目列表为空 | 参考 dataeye-permissions Skill，告知用户联系管理员配置项目访问权限 |
| 产品列表为空 | 告知用户该项目下暂无可访问产品 |
| 事件列表为空 | 正常提示"该产品暂无已定义事件" |
| API 报错 | 原文转述后端错误信息，不自行推测原因 |
```

---

### Task 1.3: 更新 `dataeye-data-query` Skill

**Files:**
- Modify: `packages/skills/definitions/dataeye-data-query/SKILL.md`

- [ ] **Step 1: 更新 frontmatter — 移除错误权限要求**

```yaml
---
name: dataeye-data-query
description: AI 问数 — 基于自然语言查询 Dataeye 数据表和 StarRocks 数据仓库
triggers:
  - 查询数据
  - 数据分析
  - 问数
  - SQL
  - 看数据
  - 有多少
  - 统计
  - 查一下
  - 数据表
  - 表结构
  - 帮我查
requiredTools:
  - dataeye_project_list
  - dataeye_datasource_list
  - dataeye_table_list
  - dataeye_table_detail
  - dataeye_dws_table
  - dataeye_sql_query
---
```

- [ ] **Step 2: 在工作流程第一步前加权限导航步骤**

在"第一步：了解可用数据"的第1条前插入：

```markdown
0. **权限导航前置检查**：调用 `dataeye_project_list(type="project")` 确认用户有可访问的项目。若列表为空，参考 `dataeye-permissions` Skill 给出正确诊断，停止后续操作。
```

- [ ] **Step 3: 添加错误处理说明**

```markdown
## 错误处理

- **项目列表为空**：告知用户角色未绑定项目，建议联系管理员
- **sourceId 错误导致 SQL 失败**：重新调用 `dataeye_datasource_list` 确认正确的 sourceId
- **SQL 语法错误**：根据 StarRocks 语法调整，常见问题：DATE_FORMAT 函数、JSON 字段访问语法
```

---

### Task 1.4: 修复 `register.ts` 中现有 dataeye 工具的权限配置

**Files:**
- Modify: `packages/mcp-server/src/tools/register.ts`

- [ ] **Step 1: 将 dateyeTools 数组中所有工具的 requiredPermissions 改为 `[]`**

```typescript
const dateyeTools: ToolDef[] = [
  { name: dateyeProjectListDef.name, description: dateyeProjectListDef.description, inputSchema: dateyeProjectListDef.inputSchema, requiredPermissions: [], handler: dateyeProjectList },
  { name: dateyeEventListDef.name, description: dateyeEventListDef.description, inputSchema: dateyeEventListDef.inputSchema, requiredPermissions: [], handler: dateyeEventList },
  { name: dateyeEventPropertyDef.name, description: dateyeEventPropertyDef.description, inputSchema: dateyeEventPropertyDef.inputSchema, requiredPermissions: [], handler: dateyeEventProperty },
  { name: dateyeTableListDef.name, description: dateyeTableListDef.description, inputSchema: dateyeTableListDef.inputSchema, requiredPermissions: [], handler: dateyeTableList },
  { name: dateyeTableDetailDef.name, description: dateyeTableDetailDef.description, inputSchema: dateyeTableDetailDef.inputSchema, requiredPermissions: [], handler: dateyeTableDetail },
  { name: dateyeDwsTableDef.name, description: dateyeDwsTableDef.description, inputSchema: dateyeDwsTableDef.inputSchema, requiredPermissions: [], handler: dateyeDwsTable },
  { name: dateyeDatasourceListDef.name, description: dateyeDatasourceListDef.description, inputSchema: dateyeDatasourceListDef.inputSchema, requiredPermissions: [], handler: dateyeDatasourceList },
  { name: dateyeSqlQueryDef.name, description: dateyeSqlQueryDef.description, inputSchema: dateyeSqlQueryDef.inputSchema, requiredPermissions: [], handler: dateyeSqlQuery },
];
```

- [ ] **Step 2: 类型检查**

```bash
cd packages/mcp-server && npx tsc --noEmit
```
Expected: 无错误输出

- [ ] **Step 3: Commit Chunk 1**

```bash
git add packages/skills/definitions/dataeye-permissions/ \
        packages/skills/definitions/dataeye-event-explore/SKILL.md \
        packages/skills/definitions/dataeye-data-query/SKILL.md \
        packages/mcp-server/src/tools/register.ts
git commit -m "feat: add dataeye-permissions skill, fix existing skill permissions"
```

---

## Chunk 2: 事件管理写操作工具

**注意**：所有新工具遵循以下模式：
- 导入 `formatSuccess, formatError, withAuth` from `./base.js`
- 导入 `dateyeRequest` from `./dataeye-proxy.js`
- 导出 handler 函数和 `*Def` 对象（含 `name`, `description`, `inputSchema`）
- `withAuth(db, adapter, args, [], ...)` — 空权限列表
- dryRun 为 true 时返回 `formatSuccess({ dryRun: true, preview: { ... } })`

### Task 2.1: `dataeye_event_group_list` — 事件分组列表

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-event-group-list.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件分组列表
 * GET /api/biEventGroup/eventGroup/list?productId=xxx
 */
export async function dateyeEventGroupList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId } = cleanArgs;
    if (!productId) return formatError("INVALID_ARGS", "productId is required");

    const data = await dateyeRequest<Array<{
      id: number;
      name: string;
      productId: number;
    }>>("/api/biEventGroup/eventGroup/list", context, {
      params: { productId: Number(productId) },
    });

    return formatSuccess(Array.isArray(data) ? data : []);
  });
}

export const dateyeEventGroupListDef = {
  name: "dataeye_event_group_list",
  description: "获取指定产品下的事件分组列表，创建事件时用于选择所属分组",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      _context: { type: "object" },
    },
    required: ["productId", "_context"],
  },
};
```

---

### Task 2.2: `dataeye_event_group_add` — 创建事件分组

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-event-group-add.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建事件分组
 * POST /api/biEventGroup/eventGroup/add
 * 约束：分组名最长 10 字符；不可使用 "未分组" 或 "Ungrouped"
 */
export async function dateyeEventGroupAdd(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, name, dryRun = false } = cleanArgs;
    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required");

    const nameStr = String(name).trim();
    if (nameStr.length > 10) return formatError("INVALID_ARGS", "分组名最长 10 字符");
    if (nameStr === "未分组" || nameStr === "Ungrouped") {
      return formatError("INVALID_ARGS", `"${nameStr}" 是系统保留名称，请使用其他名称`);
    }

    const preview = { productId: Number(productId), name: nameStr };
    if (dryRun) return formatSuccess({ dryRun: true, preview });

    const data = await dateyeRequest("/api/biEventGroup/eventGroup/add", context, {
      method: "POST",
      body: preview,
    });

    return formatSuccess(data);
  });
}

export const dateyeEventGroupAddDef = {
  name: "dataeye_event_group_add",
  description: "在指定产品下创建事件分组（分组名最长10字符）",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      name: { type: "string", description: "分组名称（最长10字符，不可使用'未分组'）" },
      dryRun: { type: "boolean", description: "预览模式，true 时只返回将要执行的参数，不实际创建", default: false },
      _context: { type: "object" },
    },
    required: ["productId", "name", "_context"],
  },
};
```

---

### Task 2.3: `dataeye_event_create` — 创建虚拟事件

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-event-create.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建虚拟事件
 * POST /api/eventManage/event/add (@RequestBody EventAddDto)
 *
 * 注意：此接口创建的是"虚拟事件"（对已采集事件的组合/过滤视图），
 * 不是原始埋点定义。原始埋点由 SDK 上报后自动生成。
 */
export async function dateyeEventCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, eventName, eventAlias, description, eventGroupId, indexInfos, dryRun = false } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!eventName) return formatError("INVALID_ARGS", "eventName is required");
    if (!indexInfos || !Array.isArray(indexInfos) || (indexInfos as unknown[]).length === 0) {
      return formatError("INVALID_ARGS", "indexInfos is required and must contain at least one base event reference");
    }

    const body: Record<string, unknown> = {
      productId: Number(productId),
      eventName: String(eventName),
      indexInfos,
    };
    if (eventAlias) body.eventAlias = String(eventAlias);
    if (description) body.description = String(description);
    if (eventGroupId) body.eventGroupId = Number(eventGroupId);

    if (dryRun) return formatSuccess({ dryRun: true, preview: body });

    const data = await dateyeRequest<{ id: number; eventName: string }>(
      "/api/eventManage/event/add", context, { method: "POST", body }
    );

    return formatSuccess(data);
  });
}

export const dateyeEventCreateDef = {
  name: "dataeye_event_create",
  description: "创建虚拟事件（对已采集事件的组合/过滤视图）。注意：原始埋点由 SDK 上报自动生成，无法通过 API 创建。支持 dryRun 预览。",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      eventName: { type: "string", description: "事件英文名（必填）" },
      eventAlias: { type: "string", description: "事件展示名（可选）" },
      description: { type: "string", description: "事件描述（可选）" },
      eventGroupId: { type: "number", description: "所属分组 ID（可选，从 dataeye_event_group_list 获取）" },
      indexInfos: {
        type: "array",
        description: "引用的基础事件列表（必填，至少1个）",
        items: {
          type: "object",
          properties: {
            eventName: { type: "string" },
            filter: { type: "object" },
          },
          required: ["eventName"],
        },
      },
      dryRun: { type: "boolean", description: "预览模式，默认 false", default: false },
      _context: { type: "object" },
    },
    required: ["productId", "eventName", "indexInfos", "_context"],
  },
};
```

---

### Task 2.4: `dataeye_event_update` + `dataeye_event_status`

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-event-update.ts`
- Create: `packages/mcp-server/src/tools/dataeye-event-status.ts`

- [ ] **Step 1: 创建 dataeye-event-update.ts**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 编辑事件
 * POST /api/eventManage/event/edit (@RequestBody EventEditDto)
 */
export async function dateyeEventUpdate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { eventId, productId, eventAlias, description, eventGroupId, dryRun = true } = cleanArgs;

    if (!eventId) return formatError("INVALID_ARGS", "eventId is required");
    if (!productId) return formatError("INVALID_ARGS", "productId is required");

    const body: Record<string, unknown> = {
      eventId: Number(eventId),
      productId: Number(productId),
    };
    if (eventAlias !== undefined) body.eventAlias = String(eventAlias);
    if (description !== undefined) body.description = String(description);
    if (eventGroupId !== undefined) body.eventGroupId = Number(eventGroupId);

    if (dryRun) return formatSuccess({ dryRun: true, preview: body });

    const data = await dateyeRequest("/api/eventManage/event/edit", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeEventUpdateDef = {
  name: "dataeye_event_update",
  description: "编辑事件的展示名、描述或所属分组。支持 dryRun 预览（默认开启）。",
  inputSchema: {
    type: "object" as const,
    properties: {
      eventId: { type: "number", description: "事件 ID（必填）" },
      productId: { type: "number", description: "产品 ID（必填）" },
      eventAlias: { type: "string", description: "新的展示名" },
      description: { type: "string", description: "新的描述" },
      eventGroupId: { type: "number", description: "新的分组 ID" },
      dryRun: { type: "boolean", description: "预览模式，默认 true（修改需确认）", default: true },
      _context: { type: "object" },
    },
    required: ["eventId", "productId", "_context"],
  },
};
```

- [ ] **Step 2: 创建 dataeye-event-status.ts**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件启/停用
 * POST /api/eventManage/event/changeStatus
 * 调用方式：form 参数（接口无 @RequestBody）
 * status: 1=启用, 0=停用
 */
export async function dateyeEventStatus(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { id, status, dryRun = true } = cleanArgs;

    if (!id) return formatError("INVALID_ARGS", "id is required");
    if (status === undefined || status === null) return formatError("INVALID_ARGS", "status is required (1=启用, 0=停用)");

    const statusNum = Number(status);
    if (statusNum !== 0 && statusNum !== 1) {
      return formatError("INVALID_ARGS", "status must be 0 (停用) or 1 (启用)");
    }

    const preview = { id: Number(id), status: statusNum };
    if (dryRun) {
      return formatSuccess({
        dryRun: true,
        preview,
        warning: statusNum === 0 ? "停用后该事件在分析报表中将不可见" : undefined,
      });
    }

    // form 参数，非 JSON body
    const data = await dateyeRequest("/api/eventManage/event/changeStatus", context, {
      method: "POST",
      params: preview,
    });

    return formatSuccess(data);
  });
}

export const dateyeEventStatusDef = {
  name: "dataeye_event_status",
  description: "启用或停用事件（status: 1=启用, 0=停用）。停用后事件在分析报表中不可见。支持 dryRun 预览（默认开启）。",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "number", description: "事件关联 ID（必填）" },
      status: { type: "number", description: "目标状态：1=启用，0=停用（必填）" },
      dryRun: { type: "boolean", description: "预览模式，默认 true（破坏性操作需确认）", default: true },
      _context: { type: "object" },
    },
    required: ["id", "status", "_context"],
  },
};
```

---

### Task 2.5: `dataeye_event_property_save` — 保存自定义属性

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-event-property-save.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 保存自定义事件属性
 * POST /api/eventManage/event/property/customize/saveOrUpdate
 * (@RequestBody EventPropertySaveDto)
 *
 * saveType: 1=事件属性, 3=用户属性
 * productEventIds: 关联的事件 ID 列表（从事件创建返回的 id 获取）
 */
export async function dateyeEventPropertySave(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, propertyName, propertyAlias, dataType, description, saveType, productEventIds, dryRun = false } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!propertyName) return formatError("INVALID_ARGS", "propertyName is required");
    if (!dataType) return formatError("INVALID_ARGS", "dataType is required (string/number/datetime/boolean/list)");
    if (saveType === undefined || saveType === null) {
      return formatError("INVALID_ARGS", "saveType is required: 1=事件属性, 3=用户属性");
    }

    const saveTypeNum = Number(saveType);
    if (saveTypeNum !== 1 && saveTypeNum !== 3) {
      return formatError("INVALID_ARGS", "saveType must be 1 (事件属性) or 3 (用户属性)");
    }

    const body: Record<string, unknown> = {
      productId: Number(productId),
      propertyName: String(propertyName),
      dataType: String(dataType),
      saveType: saveTypeNum,
    };
    if (propertyAlias) body.propertyAlias = String(propertyAlias);
    if (description) body.description = String(description);
    if (productEventIds && Array.isArray(productEventIds)) {
      body.productEventIds = (productEventIds as unknown[]).map(Number);
    }

    if (dryRun) return formatSuccess({ dryRun: true, preview: body });

    const data = await dateyeRequest(
      "/api/eventManage/event/property/customize/saveOrUpdate",
      context,
      { method: "POST", body }
    );

    return formatSuccess(data);
  });
}

export const dateyeEventPropertySaveDef = {
  name: "dataeye_event_property_save",
  description: "新增或更新自定义事件/用户属性。saveType=1 为事件属性，saveType=3 为用户属性。创建后可通过 productEventIds 关联到具体事件。",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      propertyName: { type: "string", description: "属性英文名（必填）" },
      propertyAlias: { type: "string", description: "属性展示名（可选）" },
      dataType: { type: "string", description: "数据类型：string/number/datetime/boolean/list（必填）" },
      saveType: { type: "number", description: "属性类型：1=事件属性，3=用户属性（必填）" },
      description: { type: "string", description: "属性描述（可选）" },
      productEventIds: {
        type: "array",
        description: "关联的事件 ID 列表（可选，从 dataeye_event_create 返回的 id 获取）",
        items: { type: "number" },
      },
      dryRun: { type: "boolean", description: "预览模式，默认 false（创建新属性时）。若为修改已有属性，建议显式传入 dryRun=true 进行确认", default: false },
      _context: { type: "object" },
    },
    required: ["productId", "propertyName", "dataType", "saveType", "_context"],
  },
};
```

---

### Task 2.6: `dataeye_event_analysis` — 事件分析查询

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-event-analysis.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 事件分析查询
 * POST /api/my-query-event/report (@RequestBody EventAnalysisQuery)
 * 支持趋势、对比、分布分析
 */
export async function dateyeEventAnalysis(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { productId, appId, startDate, endDate, type, measures, groupBy, filters, timeUnit = "day" } = cleanArgs;

    if (!productId) return formatError("INVALID_ARGS", "productId is required");
    if (!appId) return formatError("INVALID_ARGS", "appId is required (get from product detail)");
    if (!startDate || !endDate) return formatError("INVALID_ARGS", "startDate and endDate are required (format: YYYY-MM-DD)");
    if (!measures || !Array.isArray(measures) || (measures as unknown[]).length === 0) {
      return formatError("INVALID_ARGS", "measures is required and must contain at least one metric");
    }
    const validTypes = ["event", "funnel", "retention"];
    if (type && !validTypes.includes(String(type))) {
      return formatError("INVALID_ARGS", `type must be one of: ${validTypes.join(", ")}`);
    }

    const body: Record<string, unknown> = {
      productId: Number(productId),
      appId: String(appId),
      startDate: String(startDate),
      endDate: String(endDate),
      type: type || "event",
      measures,
      timeUnit: String(timeUnit),
    };
    if (groupBy) body.groupBy = groupBy;
    if (filters) body.filters = filters;

    const data = await dateyeRequest("/api/my-query-event/report", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeEventAnalysisDef = {
  name: "dataeye_event_analysis",
  description: "事件分析查询（AI 问数 2.0）：支持事件趋势/对比/分布分析，比 SQL 查询更高层，直接生成图表数据。",
  inputSchema: {
    type: "object" as const,
    properties: {
      productId: { type: "number", description: "产品 ID（必填）" },
      appId: { type: "string", description: "产品 appId（必填，从产品详情获取）" },
      startDate: { type: "string", description: "开始日期，格式 YYYY-MM-DD（必填）" },
      endDate: { type: "string", description: "结束日期，格式 YYYY-MM-DD（必填）" },
      type: { type: "string", description: "分析类型：event=事件分析, funnel=漏斗, retention=留存", default: "event" },
      measures: {
        type: "array",
        description: "指标列表（必填，至少1个）",
        items: {
          type: "object",
          properties: {
            eventName: { type: "string", description: "事件名" },
            aggregation: { type: "string", description: "聚合方式：count/user_count/sum/avg" },
            propertyName: { type: "string", description: "属性名（sum/avg 时必填）" },
          },
          required: ["eventName", "aggregation"],
        },
      },
      groupBy: {
        type: "array",
        description: "分组维度（可选）",
        items: {
          type: "object",
          properties: { propertyName: { type: "string" } },
          required: ["propertyName"],
        },
      },
      filters: {
        type: "array",
        description: "过滤条件（可选）",
        items: {
          type: "object",
          properties: {
            propertyName: { type: "string" },
            operator: { type: "string", description: "eq/ne/in/gt/lt" },
            values: { type: "array", items: { type: "string" } },
          },
          required: ["propertyName", "operator", "values"],
        },
      },
      timeUnit: { type: "string", description: "时间粒度：day/week/month，默认 day", default: "day" },
      _context: { type: "object" },
    },
    required: ["productId", "appId", "startDate", "endDate", "measures", "_context"],
  },
};
```

- [ ] **Step 2: 类型检查**

```bash
cd packages/mcp-server && npx tsc --noEmit
```
Expected: 无错误输出

- [ ] **Step 3: Commit Chunk 2**

```bash
git add packages/mcp-server/src/tools/dataeye-event-group-list.ts \
        packages/mcp-server/src/tools/dataeye-event-group-add.ts \
        packages/mcp-server/src/tools/dataeye-event-create.ts \
        packages/mcp-server/src/tools/dataeye-event-update.ts \
        packages/mcp-server/src/tools/dataeye-event-status.ts \
        packages/mcp-server/src/tools/dataeye-event-property-save.ts \
        packages/mcp-server/src/tools/dataeye-event-analysis.ts
git commit -m "feat: add dataeye event management write tools (7 tools)"
```

---

## Chunk 3: 数据表 + 组织工具 + 全量注册

### Task 3.1: `dataeye_table_validate_name` — 校验表名

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-table-validate-name.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 校验数据表名是否已存在
 * POST /api/biDataSource/validateTableName (@RequestBody BiDataSourceDto)
 * 创建数据表前必须调用此接口
 */
export async function dateyeTableValidateName(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { tableName, projectId } = cleanArgs;

    if (!tableName) return formatError("INVALID_ARGS", "tableName is required");
    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");

    const data = await dateyeRequest<{ exists: boolean } | boolean>(
      "/api/biDataSource/validateTableName",
      context,
      {
        method: "POST",
        body: { tableName: String(tableName), projectId: Number(projectId) },
      }
    );

    const exists = typeof data === "boolean" ? data : (data as any).exists;
    return formatSuccess({
      tableName: String(tableName),
      available: !exists,
      message: exists ? `表名 "${tableName}" 已存在，请使用其他名称` : `表名 "${tableName}" 可用`,
    });
  });
}

export const dateyeTableValidateNameDef = {
  name: "dataeye_table_validate_name",
  description: "校验数据表名是否已存在，创建数据表前必须调用。返回表名是否可用。",
  inputSchema: {
    type: "object" as const,
    properties: {
      tableName: { type: "string", description: "要校验的表名（必填）" },
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      _context: { type: "object" },
    },
    required: ["tableName", "projectId", "_context"],
  },
};
```

---

### Task 3.2: `dataeye_table_create` — 创建数据表

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-table-create.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建数据表（在 StarRocks 中执行 DDL）
 * POST /api/biDataSource/createTable (@RequestBody BiDataSourceDto)
 *
 * ctType:
 *   1 = DUPLICATE KEY — 日志/事件表，允许重复主键
 *   3 = PRIMARY KEY — 唯一主键，支持 UPDATE
 *
 * 调用前请先执行 dataeye_table_validate_name 确认表名不重复
 */
export async function dateyeTableCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { projectId, tableName, remark, ctType, fields, dryRun = false } = cleanArgs;

    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");
    if (!tableName) return formatError("INVALID_ARGS", "tableName is required");
    if (!ctType) return formatError("INVALID_ARGS", "ctType is required: 1=DUPLICATE KEY(日志表), 3=PRIMARY KEY(主键唯一表)");
    if (!fields || !Array.isArray(fields) || (fields as unknown[]).length === 0) {
      return formatError("INVALID_ARGS", "fields is required and must contain at least one field definition");
    }

    const ctTypeNum = Number(ctType);
    if (ctTypeNum !== 1 && ctTypeNum !== 3) {
      return formatError("INVALID_ARGS", "ctType must be 1 (DUPLICATE KEY) or 3 (PRIMARY KEY)");
    }

    const body: Record<string, unknown> = {
      projectId: Number(projectId),
      tableName: String(tableName),
      ctType: ctTypeNum,
      biDataSourceStructureList: (fields as Array<Record<string, unknown>>).map((f) => ({
        fieldName: String(f.fieldName),
        identifier: String(f.identifier),
        dataType: String(f.dataType),
        primaryKey: f.primaryKey ? 1 : 0,
        remark: f.remark ? String(f.remark) : "",
      })),
    };
    if (remark) body.remark = String(remark);

    if (dryRun) return formatSuccess({ dryRun: true, preview: body });

    const data = await dateyeRequest("/api/biDataSource/createTable", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeTableCreateDef = {
  name: "dataeye_table_create",
  description: "在 StarRocks 中创建数据表。ctType=1 为日志表（允许重复），ctType=3 为主键表（唯一）。创建前请先调用 dataeye_table_validate_name 校验表名。支持 dryRun 预览。",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      tableName: { type: "string", description: "表名（必填，建议先调 dataeye_table_validate_name 校验）" },
      remark: { type: "string", description: "表说明（可选）" },
      ctType: { type: "number", description: "表类型：1=DUPLICATE KEY日志表，3=PRIMARY KEY唯一表（必填）" },
      fields: {
        type: "array",
        description: "字段列表（必填，至少1个）",
        items: {
          type: "object",
          properties: {
            fieldName: { type: "string", description: "字段中文名/备注" },
            identifier: { type: "string", description: "字段英文标识（StarRocks 列名）" },
            dataType: { type: "string", enum: ["1", "2", "3"], description: "数据类型：1=datetime, 2=varchar, 3=number" },
            primaryKey: { type: "boolean", description: "是否主键", default: false },
            remark: { type: "string", description: "字段备注（可选）" },
          },
          required: ["fieldName", "identifier", "dataType"],
        },
      },
      dryRun: { type: "boolean", description: "预览模式，默认 false", default: false },
      _context: { type: "object" },
    },
    required: ["projectId", "tableName", "ctType", "fields", "_context"],
  },
};
```

---

### Task 3.3: `dataeye_table_update_status` — 数据表状态管理

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-table-update-status.ts`

- [ ] **Step 1: 创建工具文件**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 更新数据表状态
 * GET /api/biDataSource/updateStatus (query params)
 * status: ACTIVE=启用, PAUSE=暂停, DELETE=删除（不可逆）
 */
export async function dateyeTableUpdateStatus(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { id, status, dryRun } = cleanArgs;

    if (!id) return formatError("INVALID_ARGS", "id is required");
    if (!status) return formatError("INVALID_ARGS", "status is required: ACTIVE/PAUSE/DELETE");

    const statusStr = String(status).toUpperCase();
    if (!["ACTIVE", "PAUSE", "DELETE"].includes(statusStr)) {
      return formatError("INVALID_ARGS", "status must be ACTIVE, PAUSE, or DELETE");
    }

    // DELETE 操作强制需要用户明确传 dryRun=false
    const isDryRun = statusStr === "DELETE" ? (dryRun !== false) : (dryRun ?? (statusStr === "PAUSE"));

    const preview = { id: Number(id), status: statusStr };
    if (isDryRun) {
      return formatSuccess({
        dryRun: true,
        preview,
        warning: statusStr === "DELETE"
          ? "⚠️ 删除操作不可逆，将同时删除该表的所有数据和结构定义。确认请传入 dryRun=false"
          : statusStr === "PAUSE"
          ? "暂停后该表将不可用于查询"
          : undefined,
      });
    }

    const data = await dateyeRequest("/api/biDataSource/updateStatus", context, {
      params: preview,
    });

    return formatSuccess(data);
  });
}

export const dateyeTableUpdateStatusDef = {
  name: "dataeye_table_update_status",
  description: "更新数据表状态：ACTIVE=启用, PAUSE=暂停, DELETE=永久删除（不可逆）。DELETE 操作必须显式传 dryRun=false 才执行。",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "number", description: "数据表 ID（必填）" },
      status: { type: "string", enum: ["ACTIVE", "PAUSE", "DELETE"], description: "目标状态：ACTIVE=启用, PAUSE=暂停, DELETE=永久删除（必填）" },
      dryRun: { type: "boolean", description: "预览模式。PAUSE 默认 true，DELETE 必须传 false 才执行" },
      _context: { type: "object" },
    },
    required: ["id", "status", "_context"],
  },
};
```

---

### Task 3.4: `dataeye_user_list` + `dataeye_role_list` + `dataeye_product_create`

**Files:**
- Create: `packages/mcp-server/src/tools/dataeye-user-list.ts`
- Create: `packages/mcp-server/src/tools/dataeye-role-list.ts`
- Create: `packages/mcp-server/src/tools/dataeye-product-create.ts`

- [ ] **Step 1: 创建 dataeye-user-list.ts**

```typescript
import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 组织用户列表
 * POST /api/tenant/user/page (@RequestBody UserPageParam)
 * 用于权限诊断：查看组织内有哪些成员
 */
export async function dateyeUserList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { page = 1, pageSize = 20, keyword } = cleanArgs;

    const body: Record<string, unknown> = {
      page: Number(page),
      size: Number(pageSize),
    };
    if (keyword) body.keyword = String(keyword);

    const data = await dateyeRequest("/api/tenant/user/page", context, {
      method: "POST",
      body,
    });

    return formatSuccess(data);
  });
}

export const dateyeUserListDef = {
  name: "dataeye_user_list",
  description: "查询当前组织的成员列表，用于权限诊断和了解组织结构",
  inputSchema: {
    type: "object" as const,
    properties: {
      keyword: { type: "string", description: "搜索关键词（姓名/邮箱）" },
      page: { type: "number", description: "页码", default: 1 },
      pageSize: { type: "number", description: "每页条数", default: 20 },
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
```

- [ ] **Step 2: 创建 dataeye-role-list.ts**

```typescript
import { formatSuccess, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 组织角色列表
 * GET /api/tenant/role/list/all
 * 用于权限诊断：查看组织内有哪些角色
 */
export async function dateyeRoleList(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, _cleanArgs, context) => {
    const data = await dateyeRequest("/api/tenant/role/list/all", context);
    return formatSuccess(Array.isArray(data) ? data : []);
  });
}

export const dateyeRoleListDef = {
  name: "dataeye_role_list",
  description: "查询当前组织的角色列表，用于权限诊断和了解角色配置",
  inputSchema: {
    type: "object" as const,
    properties: {
      _context: { type: "object" },
    },
    required: ["_context"],
  },
};
```

- [ ] **Step 3: 创建 dataeye-product-create.ts**

```typescript
import { formatSuccess, formatError, withAuth } from "./base.js";
import { dateyeRequest } from "./dataeye-proxy.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";

/**
 * dataeye 创建产品
 * POST /api/tenant/product/create (form params, 无 @RequestBody)
 *
 * 注意：参数通过 query string / form 传递，不是 JSON body
 */
export async function dateyeProductCreate(db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) {
  return withAuth(db, adapter, args, [], async (_db, cleanArgs, context) => {
    const { projectId, name, pkg, dryRun = true } = cleanArgs;

    if (!projectId) return formatError("INVALID_ARGS", "projectId is required");
    if (!name) return formatError("INVALID_ARGS", "name is required");
    if (!pkg) return formatError("INVALID_ARGS", "pkg is required (包名/标识符, 如 com.example.app)");

    const preview = {
      projectId: Number(projectId),
      name: String(name),
      pkg: String(pkg),
    };

    if (dryRun) return formatSuccess({ dryRun: true, preview });

    // form 参数，非 JSON body
    const data = await dateyeRequest("/api/tenant/product/create", context, {
      method: "POST",
      params: preview,
    });

    return formatSuccess(data);
  });
}

export const dateyeProductCreateDef = {
  name: "dataeye_product_create",
  description: "在指定项目下创建新产品。需要提供包名(pkg)作为唯一标识。dryRun 默认开启（创建产品影响较大）。",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: { type: "number", description: "所属项目 ID（必填）" },
      name: { type: "string", description: "产品名称（必填）" },
      pkg: { type: "string", description: "包名/标识符（必填，如 com.example.app）" },
      dryRun: { type: "boolean", description: "预览模式，默认 true（创建产品影响较大需确认）", default: true },
      _context: { type: "object" },
    },
    required: ["projectId", "name", "pkg", "_context"],
  },
};
```

---

### Task 3.5: 注册全部新工具到 `register.ts` 和 `http-server.ts`

**Files:**
- Modify: `packages/mcp-server/src/tools/register.ts`
- Modify: `packages/mcp-server/src/http-server.ts`

- [ ] **Step 1: 在 register.ts 中添加所有新工具的 import**

在现有 dataeye 工具 import 之后追加：

```typescript
import { dateyeEventGroupList, dateyeEventGroupListDef } from "./dataeye-event-group-list.js";
import { dateyeEventGroupAdd, dateyeEventGroupAddDef } from "./dataeye-event-group-add.js";
import { dateyeEventCreate, dateyeEventCreateDef } from "./dataeye-event-create.js";
import { dateyeEventUpdate, dateyeEventUpdateDef } from "./dataeye-event-update.js";
import { dateyeEventStatus, dateyeEventStatusDef } from "./dataeye-event-status.js";
import { dateyeEventPropertySave, dateyeEventPropertySaveDef } from "./dataeye-event-property-save.js";
import { dateyeEventAnalysis, dateyeEventAnalysisDef } from "./dataeye-event-analysis.js";
import { dateyeTableValidateName, dateyeTableValidateNameDef } from "./dataeye-table-validate-name.js";
import { dateyeTableCreate, dateyeTableCreateDef } from "./dataeye-table-create.js";
import { dateyeTableUpdateStatus, dateyeTableUpdateStatusDef } from "./dataeye-table-update-status.js";
import { dateyeUserList, dateyeUserListDef } from "./dataeye-user-list.js";
import { dateyeRoleList, dateyeRoleListDef } from "./dataeye-role-list.js";
import { dateyeProductCreate, dateyeProductCreateDef } from "./dataeye-product-create.js";
```

- [ ] **Step 2: 在 dateyeTools 数组中追加新工具条目**

在现有 8 个工具之后追加（`requiredPermissions` 统一为 `[]`）：

```typescript
  // 事件管理写操作
  { name: dateyeEventGroupListDef.name, description: dateyeEventGroupListDef.description, inputSchema: dateyeEventGroupListDef.inputSchema, requiredPermissions: [], handler: dateyeEventGroupList },
  { name: dateyeEventGroupAddDef.name, description: dateyeEventGroupAddDef.description, inputSchema: dateyeEventGroupAddDef.inputSchema, requiredPermissions: [], handler: dateyeEventGroupAdd },
  { name: dateyeEventCreateDef.name, description: dateyeEventCreateDef.description, inputSchema: dateyeEventCreateDef.inputSchema, requiredPermissions: [], handler: dateyeEventCreate },
  { name: dateyeEventUpdateDef.name, description: dateyeEventUpdateDef.description, inputSchema: dateyeEventUpdateDef.inputSchema, requiredPermissions: [], handler: dateyeEventUpdate },
  { name: dateyeEventStatusDef.name, description: dateyeEventStatusDef.description, inputSchema: dateyeEventStatusDef.inputSchema, requiredPermissions: [], handler: dateyeEventStatus },
  { name: dateyeEventPropertySaveDef.name, description: dateyeEventPropertySaveDef.description, inputSchema: dateyeEventPropertySaveDef.inputSchema, requiredPermissions: [], handler: dateyeEventPropertySave },
  { name: dateyeEventAnalysisDef.name, description: dateyeEventAnalysisDef.description, inputSchema: dateyeEventAnalysisDef.inputSchema, requiredPermissions: [], handler: dateyeEventAnalysis },
  // 数据表管理
  { name: dateyeTableValidateNameDef.name, description: dateyeTableValidateNameDef.description, inputSchema: dateyeTableValidateNameDef.inputSchema, requiredPermissions: [], handler: dateyeTableValidateName },
  { name: dateyeTableCreateDef.name, description: dateyeTableCreateDef.description, inputSchema: dateyeTableCreateDef.inputSchema, requiredPermissions: [], handler: dateyeTableCreate },
  { name: dateyeTableUpdateStatusDef.name, description: dateyeTableUpdateStatusDef.description, inputSchema: dateyeTableUpdateStatusDef.inputSchema, requiredPermissions: [], handler: dateyeTableUpdateStatus },
  // 组织视角
  { name: dateyeUserListDef.name, description: dateyeUserListDef.description, inputSchema: dateyeUserListDef.inputSchema, requiredPermissions: [], handler: dateyeUserList },
  { name: dateyeRoleListDef.name, description: dateyeRoleListDef.description, inputSchema: dateyeRoleListDef.inputSchema, requiredPermissions: [], handler: dateyeRoleList },
  { name: dateyeProductCreateDef.name, description: dateyeProductCreateDef.description, inputSchema: dateyeProductCreateDef.inputSchema, requiredPermissions: [], handler: dateyeProductCreate },
```

- [ ] **Step 3: 在 http-server.ts 的 initToolHandlers() 中添加新工具 import 和 entries**

**当前 Promise.all 已有 12 个 import（indices 0-11），新工具从 index 12 开始。**

在 `Promise.all` 数组末尾（`import("./tools/form-query.js"),` 之后）追加：

```typescript
    import("./tools/dataeye-event-group-list.js"),   // mods[12]
    import("./tools/dataeye-event-group-add.js"),    // mods[13]
    import("./tools/dataeye-event-create.js"),       // mods[14]
    import("./tools/dataeye-event-update.js"),       // mods[15]
    import("./tools/dataeye-event-status.js"),       // mods[16]
    import("./tools/dataeye-event-property-save.js"), // mods[17]
    import("./tools/dataeye-event-analysis.js"),     // mods[18]
    import("./tools/dataeye-table-validate-name.js"), // mods[19]
    import("./tools/dataeye-table-create.js"),       // mods[20]
    import("./tools/dataeye-table-update-status.js"), // mods[21]
    import("./tools/dataeye-user-list.js"),          // mods[22]
    import("./tools/dataeye-role-list.js"),          // mods[23]
    import("./tools/dataeye-product-create.js"),     // mods[24]
```

在 `entries` 数组末尾（`["self_permissions", ...]` 之后）追加（注意使用正确 index）：

```typescript
    ["dataeye_event_group_list",   mods[12].dateyeEventGroupList,   mods[12].dateyeEventGroupListDef],
    ["dataeye_event_group_add",    mods[13].dateyeEventGroupAdd,    mods[13].dateyeEventGroupAddDef],
    ["dataeye_event_create",       mods[14].dateyeEventCreate,      mods[14].dateyeEventCreateDef],
    ["dataeye_event_update",       mods[15].dateyeEventUpdate,      mods[15].dateyeEventUpdateDef],
    ["dataeye_event_status",       mods[16].dateyeEventStatus,      mods[16].dateyeEventStatusDef],
    ["dataeye_event_property_save",mods[17].dateyeEventPropertySave,mods[17].dateyeEventPropertySaveDef],
    ["dataeye_event_analysis",     mods[18].dateyeEventAnalysis,    mods[18].dateyeEventAnalysisDef],
    ["dataeye_table_validate_name",mods[19].dateyeTableValidateName,mods[19].dateyeTableValidateNameDef],
    ["dataeye_table_create",       mods[20].dateyeTableCreate,      mods[20].dateyeTableCreateDef],
    ["dataeye_table_update_status",mods[21].dateyeTableUpdateStatus,mods[21].dateyeTableUpdateStatusDef],
    ["dataeye_user_list",          mods[22].dateyeUserList,         mods[22].dateyeUserListDef],
    ["dataeye_role_list",          mods[23].dateyeRoleList,         mods[23].dateyeRoleListDef],
    ["dataeye_product_create",     mods[24].dateyeProductCreate,    mods[24].dateyeProductCreateDef],
```

- [ ] **Step 4: 类型检查**

```bash
cd packages/mcp-server && npx tsc --noEmit
```
Expected: 无错误输出

- [ ] **Step 5: 启动服务验证工具注册**

```bash
pnpm dev:mcp-http
```
Expected 日志包含：`[warmup] tool handlers ready`，工具数量从原来增加 13 个。

- [ ] **Step 6: Commit Chunk 3**

```bash
git add packages/mcp-server/src/tools/dataeye-table-validate-name.ts \
        packages/mcp-server/src/tools/dataeye-table-create.ts \
        packages/mcp-server/src/tools/dataeye-table-update-status.ts \
        packages/mcp-server/src/tools/dataeye-user-list.ts \
        packages/mcp-server/src/tools/dataeye-role-list.ts \
        packages/mcp-server/src/tools/dataeye-product-create.ts \
        packages/mcp-server/src/tools/register.ts \
        packages/mcp-server/src/http-server.ts
git commit -m "feat: add dataeye table/org write tools, register all 13 new tools"
```

---

## Chunk 4: 智能编排 Skill

### Task 4.1: `dataeye-event-management` Skill — 事件创建向导

**Files:**
- Create: `packages/skills/definitions/dataeye-event-management/SKILL.md`

- [ ] **Step 1: 创建 Skill 文件**

```markdown
---
name: dataeye-event-management
description: DataEye 事件管理向导 — 引导 AI 完成虚拟事件创建、属性管理的完整流程，包含 dryRun 预览确认
triggers:
  - 创建事件
  - 新增事件
  - 添加事件
  - 修改事件
  - 编辑事件
  - 管理属性
  - 新增属性
  - 添加属性
  - 创建虚拟事件
requiredTools:
  - dataeye_project_list
  - dataeye_event_list
  - dataeye_event_group_list
  - dataeye_event_create
  - dataeye_event_update
  - dataeye_event_status
  - dataeye_event_property_save
---

# DataEye 事件管理向导

## 重要说明

**原始埋点由 SDK 上报自动生成，AI 只能创建"虚拟事件"**（对已采集事件的组合/过滤视图）。
若用户需要创建新的原始埋点，应引导其在 DataEye 界面完成 SDK 接入。

## 创建虚拟事件完整流程

### 步骤 1：确定目标产品
```
dataeye_project_list(type="project") → 展示项目列表，让用户选择
dataeye_project_list(type="product", projectId=xxx) → 展示产品列表，确定 productId
```
若列表为空，参考 dataeye-permissions Skill 给出权限诊断。

### 步骤 2：了解用户意图
收集必要信息：
- 虚拟事件名称（英文，如 vt_first_purchase）
- 展示名（中文，如"首次购买"）
- 引用哪些基础事件（必须是已存在的事件名，可先调 `dataeye_event_list` 确认）
- 是否需要放入特定分组

### 步骤 3：可选 — 获取分组
```
dataeye_event_group_list(productId=xxx) → 展示现有分组供用户选择
// 如需创建新分组
dataeye_event_group_add(productId=xxx, name="分组名", dryRun=true) → 确认后创建
```

### 步骤 4：dryRun 预览
```
dataeye_event_create(productId=xxx, eventName=..., indexInfos=[...], dryRun=true)
```
向用户展示：
```
📋 即将创建虚拟事件
• 产品: [产品名] (id: xxx)
• 事件名: vt_first_purchase
• 展示名: 首次购买
• 引用事件: purchase_complete
• 所属分组: [分组名]
确认执行？
```

### 步骤 5：用户确认后执行
用户回复"确认"/"是"/"OK"/"好" 后：
```
dataeye_event_create(dryRun=false)
→ 返回结果中取 eventId（用于后续关联属性）
```

### 步骤 6：可选 — 创建并关联属性
若用户需要为事件添加属性：
```
dataeye_event_property_save(
  productId=xxx,
  propertyName="channel",
  dataType="string",
  saveType=1,           // 事件属性
  productEventIds=[步骤5返回的 eventId],
  dryRun=false
)
```
**重要**：必须用步骤 5 中返回的 `eventId` 填充 `productEventIds`。

### 步骤 7：报告结果
```
✅ 虚拟事件 vt_first_purchase 创建成功（id: xxxx）
✅ 属性 channel 已关联
[如果有失败的步骤，说明哪一步失败、原因，并给出继续完成的建议]
```

## 修改事件流程

```
1. 确认用户要修改哪个事件（可调 dataeye_event_list 获取 id）
2. dataeye_event_update(eventId=xxx, productId=xxx, dryRun=true) → 展示修改前后对比
3. 用户确认后 → dataeye_event_update(dryRun=false)
```

## 停用事件

⚠️ 停用后该事件在所有分析报表中不可见，需向用户明确说明风险：
```
dataeye_event_status(id=xxx, status=0, dryRun=true)
→ 展示警告信息
→ 用户确认后 dataeye_event_status(dryRun=false)
```

## 错误处理

| 错误 | 处理方式 |
|------|----------|
| 事件名已存在（后端报错） | 提示用户换一个名称，或使用 dataeye_event_list 查看现有事件 |
| indexInfos 中的事件名不存在 | 调 dataeye_event_list 确认正确的事件名 |
| 分组名超出 10 字符 | dataeye_event_group_add 工具会前置校验并返回错误提示 |
```

---

### Task 4.2: `dataeye-table-management` Skill — 数据表创建向导

**Files:**
- Create: `packages/skills/definitions/dataeye-table-management/SKILL.md`

- [ ] **Step 1: 创建 Skill 文件**

```markdown
---
name: dataeye-table-management
description: DataEye 数据表管理向导 — 引导 AI 完成数据表创建（含字段定义），包含表名校验和 dryRun 预览确认
triggers:
  - 创建数据表
  - 新建表
  - 建表
  - 添加字段
  - 数据表管理
  - 表结构设计
  - 创建表
requiredTools:
  - dataeye_project_list
  - dataeye_table_validate_name
  - dataeye_table_create
  - dataeye_table_update_status
---

# DataEye 数据表管理向导

## 创建数据表完整流程

### 步骤 1：确定目标项目
```
dataeye_project_list(type="project") → 获取项目列表，确定 projectId
```
注意：数据表属于**项目**级别（不是产品级别）。

### 步骤 2：收集表信息

询问用户：
- 表名（英文，如 user_behavior）
- 表类型（日志表/主键表）
  - **日志表**（ctType=1）：DUPLICATE KEY，允许重复，适合事件流、日志记录
  - **主键表**（ctType=3）：PRIMARY KEY，唯一主键，适合用户属性、维度表
- 表说明/备注
- 字段列表（每个字段：英文标识符、中文名、数据类型）

### 步骤 3：校验表名
```
dataeye_table_validate_name(tableName="user_behavior", projectId=xxx)
```
若不可用 → 提示用户修改名称，重复步骤 3。

### 步骤 4：dryRun 预览
```
dataeye_table_create(
  projectId=xxx, tableName=..., ctType=1,
  fields=[...],
  dryRun=true
)
```
向用户展示：
```
📋 即将创建数据表
• 项目: [项目名] (id: xxx)
• 表名: user_behavior
• 类型: DUPLICATE KEY（日志表）
• 字段（3个）:
  - event_time (datetime) 事件时间
  - user_id (varchar) 用户 ID
  - event_name (varchar) 事件名称
确认执行？
```

### 步骤 5：用户确认后执行
```
dataeye_table_create(dryRun=false)
```

### 步骤 6：报告结果
```
✅ 数据表 user_behavior 创建成功（StarRocks DDL 已执行）
```

## 管理数据表状态

```
暂停: dataeye_table_update_status(id=xxx, status="PAUSE", dryRun=true) → 确认 → dryRun=false
删除: dataeye_table_update_status(id=xxx, status="DELETE", dryRun=true)
      ⚠️ 必须向用户强调：删除不可逆，所有数据将永久丢失
      用户确认后 → dryRun=false
```

## 数据类型说明

| dataType 值 | 含义 | 适用场景 |
|-------------|------|----------|
| `1` | datetime | 时间戳、日期字段 |
| `2` | varchar | 文本、ID、字符串 |
| `3` | number | 数值、金额、计数 |

## 常见错误处理

| 错误 | 处理方式 |
|------|----------|
| 表名已存在 | dataeye_table_validate_name 会返回不可用，提示修改名称 |
| 字段标识符包含特殊字符 | 建议使用下划线命名法（snake_case）|
| StarRocks DDL 执行失败 | 原文转述后端错误，常见原因：字段类型不支持、主键字段标识错误 |
```

---

### Task 4.3: `dataeye-event-analysis` Skill — 事件分析向导

**Files:**
- Create: `packages/skills/definitions/dataeye-event-analysis/SKILL.md`

- [ ] **Step 1: 创建 Skill 文件**

```markdown
---
name: dataeye-event-analysis
description: DataEye 事件分析向导 — 基于自然语言执行事件趋势/对比/漏斗分析，比 SQL 查询更高层
triggers:
  - 事件趋势
  - 趋势分析
  - 对比分析
  - 漏斗分析
  - 转化率
  - 用户行为分析
  - 事件对比
  - 日活
  - 月活
  - 留存
  - 分析事件
requiredTools:
  - dataeye_project_list
  - dataeye_event_list
  - dataeye_event_analysis
---

# DataEye 事件分析向导

## 与 SQL 查询的区别

| 维度 | 事件分析（本 Skill） | SQL 查询 |
|------|---------------------|---------|
| 使用接口 | `/my-query-event/report` | StarRocks SQL |
| 适用场景 | 标准事件指标分析 | 灵活自定义查询 |
| 复杂度 | LLM 构造结构化参数 | LLM 生成 SQL 字符串 |
| 图表支持 | 原生支持 | 需前端渲染 |

**优先使用事件分析**；当需要跨表 JOIN 或复杂聚合时才使用 SQL 查询。

## 标准分析流程

### 步骤 1：确定目标产品
```
dataeye_project_list(type="project") → 选项目
dataeye_project_list(type="product", projectId=xxx) → 选产品，获取 productId 和 appId
```

### 步骤 2：理解用户意图

| 用户说 | 分析类型 | measures 示例 |
|--------|----------|---------------|
| "最近7天活跃用户数" | event | `[{eventName: "any_event", aggregation: "user_count"}]` |
| "登录事件趋势" | event | `[{eventName: "login", aggregation: "count"}]` |
| "购买转化率" | funnel | measures 包含多个漏斗步骤 |
| "用户注册后7天留存" | retention | 特殊 measures 结构 |
| "各渠道事件对比" | event | measures + groupBy channel |

### 步骤 3：确认事件名

若用户说"登录事件"但不知道具体事件名：
```
dataeye_event_list(productId=xxx, keyword="login")
→ 找到实际事件名（如 user_login, app_login）
```

### 步骤 4：构造分析参数并执行
```
dataeye_event_analysis({
  productId: xxx,
  appId: "xxx",
  startDate: "2026-04-10",
  endDate: "2026-04-16",
  type: "event",
  measures: [{eventName: "user_login", aggregation: "user_count"}],
  timeUnit: "day"
})
```

### 步骤 5：解读结果
- 以表格或趋势描述展示数据
- 指出关键洞察（最高峰值、最低谷、环比变化等）
- 如需图表，告知用户在完整页面工作台中可视化呈现

## 时间范围快捷表达

| 用户说 | startDate/endDate |
|--------|-------------------|
| 最近7天 | 今天-7天 到 今天 |
| 本周 | 本周一 到 今天 |
| 上周 | 上周一 到 上周日 |
| 本月 | 本月1日 到 今天 |

## 常见错误处理

| 错误 | 处理方式 |
|------|----------|
| appId 未知 | 提示用户查看产品详情，或调 dataeye_project_list 中的产品信息获取 |
| 事件名不存在 | 调 dataeye_event_list 搜索正确名称 |
| 日期格式错误 | 统一转换为 YYYY-MM-DD 格式 |
```

- [ ] **Step 2: 类型检查（最终验证）**

```bash
cd packages/mcp-server && npx tsc --noEmit
```
Expected: 无错误

- [ ] **Step 3: 完整功能验证**

重启 MCP Server：
```bash
pnpm dev:mcp-http
```

验证工具数量日志（dataeye 模式下应有 21 个工具：8 旧 + 13 新）：
```
[tools] Dataeye tools enabled (21 tools)
```

- [ ] **Step 4: Commit Chunk 4**

```bash
git add packages/skills/definitions/dataeye-event-management/ \
        packages/skills/definitions/dataeye-table-management/ \
        packages/skills/definitions/dataeye-event-analysis/
git commit -m "feat: add event management, table management, event analysis skills"
```

---

## 验收标准

### 第一层（知识基础）
- [ ] 用户问"为什么看不到项目"，AI 给出正确诊断（角色未绑定项目），不说"权限配置异常"
- [ ] `dataeye_project_list` 工具调用时不再报 `PERMISSION_DENIED`

### 第二层（写操作工具）
- [ ] 通过自然语言成功创建虚拟事件（dryRun 预览 → 确认 → 执行）
- [ ] `dataeye_event_status(status=0)` 默认触发 dryRun 预览
- [ ] `dataeye_table_update_status(status="DELETE")` 强制需要 dryRun=false 才执行
- [ ] 所有工具 TypeScript 类型检查通过

### 第三层（Skill 编排）
- [ ] 用户说"帮我创建一个虚拟事件"，AI 走通完整流程（项目→产品→分组→预览→确认→执行→属性关联）
- [ ] 用户说"帮我建一张数据表"，AI 引导表名校验→字段定义→预览→确认
- [ ] 用户说"分析最近7天登录趋势"，AI 走通 project→product→event_list→event_analysis 完整流程
