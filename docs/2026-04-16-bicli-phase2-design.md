# BiCLI 二期系统设计

> **版本:** 2.1  
> **日期:** 2026-04-16  
> **前置:** [一期设计](./2026-04-16-bicli-system-design.md) 已实现并验证  
> **状态:** 设计中

---

## 0. 一期现状总结

一期实现了完整的 MCP 链路：CLI → LLM → MCP Server → MySQL。用户可以通过自然语言完成 CRUD 操作。

**存在的问题：**

| 问题 | 现状 | 影响 |
|------|------|------|
| 权限只在执行时校验 | LLM 能"看到"所有 11 个工具，只在调用时才被 RBAC 拦截 | viewer 角色的用户会看到 LLM 尝试调用 `user_manage` 然后失败 |
| 没有数据权限 | admin 和 viewer 查到的数据完全一样 | 无法实现"只看自己创建的表单"这种行级过滤 |
| 模型切换不丝滑 | 必须 `config set model.provider xxx`，再重启 | 远不如主流工具的交互体验 |
| 不支持自定义模型 | 只有三个硬编码 provider | 无法接入私有部署的模型 |
| 纯 TUI 模式 | 终端里的文本界面 | 无法嵌入 Web 系统，无法给非技术用户使用 |
| 配置全靠命令行 | 没有可视化配置入口 | 操作繁琐，不直观 |

---

## 1. 二期三大方向

### 方向一：权限体系深化 — 从"能不能调"到"看到什么"
### 方向二：模型管理 — 丝滑切换 + 自定义模型
### 方向三：GUI + 嵌入能力 — 从终端走向 Web

---

## 2. 方向一：权限体系深化

### 2.1 问题分析

一期的权限是**单层功能权限**：Tool 执行前检查 `resource:action` 权限，通过就执行，不通过就报错。这有三个缺陷：

1. **工具可见性**：LLM 能看到所有工具的 schema，会尝试调用无权限的工具（浪费 token + 用户体验差）
2. **数据可见性**：同一个 `user_list`，admin 和 viewer 返回完全一样的数据
3. **Skill 可见性**：权限不足的 Skill 也会被匹配和注入

### 2.2 三层权限模型

```
┌─────────────────────────────────┐
│  Layer 1: Skill 可见性过滤       │  ← Core 层
│  用户权限 ⊇ skill.required_permissions 才匹配
├─────────────────────────────────┤
│  Layer 2: Tool 可见性过滤        │  ← Core 层
│  只把用户有权限调用的 Tools 传给 LLM
├─────────────────────────────────┤
│  Layer 3: 数据行级过滤           │  ← MCP Server 层
│  根据角色+data_scope_rules自动注入 WHERE 条件
└─────────────────────────────────┘
```

### 2.3 Layer 1 — Skill 可见性

**改动点：`core/src/skill-loader/matcher.ts`**

匹配 Skill 前先检查用户权限，权限不足的 Skill 直接排除：

```typescript
class SkillMatcher {
  match(userInput: string, userPermissions: string[]): Skill | null {
    for (const skill of this.skills) {
      if (!skill.requiredPermissions.every(p => userPermissions.includes(p))) {
        continue;
      }
      for (const trigger of skill.triggers) {
        if (userInput.includes(trigger)) return skill;
      }
    }
    return null;
  }
}
```

**效果**：viewer 说"创建表单"不会命中 `form-builder` skill（因为缺 `form:write`），LLM 会用通用 prompt 回复"你没有创建表单的权限"。

### 2.4 Layer 2 — Tool 可见性（动态获取，非硬编码）

**关键设计决策**：权限映射由 MCP Server 提供，Core 不维护自己的映射。

**MCP Server 扩展**：`tools/list` 响应中通过 `_meta` 字段附带 `requiredPermissions` 元数据。

> **为什么用 `_meta` 而不是 `annotations`？** MCP SDK 的 `ToolAnnotationsSchema` 是严格的 Zod object，只接受 `title`/`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint` 五个字段，自定义字段会被 Zod 校验静默剥离。`_meta` 字段类型为 `z.record(z.string(), z.unknown())`，接受任意键值对。

```typescript
// mcp-server/src/tools/register.ts 扩展
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema) as any,
    _meta: {
      requiredPermissions: t.requiredPermissions,
    },
  })),
}));
```

每个 Tool 定义增加 `requiredPermissions` 字段：

```typescript
const tools: ToolDef[] = [
  { name: "user_list", requiredPermissions: ["user:read"], ... },
  { name: "user_manage", requiredPermissions: ["user:write"], ... },
  // ...
];
```

**Core 层动态过滤**（不再硬编码 `TOOL_PERMISSION_MAP`）：

```typescript
// core/src/permissions/tool-filter.ts

function filterToolsByPermission(
  tools: ToolWithMeta[],
  userPermissions: string[]
): ToolWithMeta[] {
  return tools.filter(t => {
    const required = t._meta?.requiredPermissions as string[] | undefined;
    if (!required || required.length === 0) return true;
    return required.every((p: string) => userPermissions.includes(p));
  });
}
```

**单一权限源**：MCP Server 是唯一定义 Tool 权限的地方，Core 只做过滤。新增/修改 Tool 权限只需改 MCP Server。

**System Prompt 增强**：注入角色和权限信息，帮助 LLM 理解用户能力边界：

```typescript
function buildSystemPrompt(skill: Skill | null, role: string, permissions: string[]): string {
  const permInfo = `\n\n当前用户角色: ${role}\n可用权限: ${permissions.join(", ")}\n请不要尝试超出用户权限范围的操作。`;
  const base = BASE_SYSTEM_PROMPT + permInfo;
  if (!skill) return base;
  return `${base}\n\n---\n\n${skill.content}`;
}
```

### 2.5 Layer 3 — 数据行级过滤

**改动点：MCP Server 的 Tool handler**

引入**数据范围策略（Data Scope Policy）**，从数据库表 `data_scope_rules` 读取，而非硬编码。

**Layer 3 适用范围**：不是所有 Tool 都需要行级过滤。以下是各 Tool 与 Layer 3 的关系：

| Tool | 启用 Layer 3 | resource 映射 | 说明 |
|------|-------------|--------------|------|
| user_list | ✅ | `users` | 按角色过滤可见用户 |
| user_manage | ❌ | — | 已被 Layer 2 拦截（需 `user:write`） |
| form_create | ❌ | — | 创建操作无需过滤 |
| form_manage | ❌ | — | 写操作可选加所有权校验（二期不做） |
| form_query | ✅ | `forms` | 按角色过滤可见表单 |
| data_query | ✅ | 动态（按 `table` 参数） | 通用查询，resource = `args.table` |
| data_aggregate | ✅ | 动态（按 `table` 参数） | 聚合查询，resource = `args.table` |
| config_get | ✅ | `configs` | 配置项可能分层级可见 |
| config_set | ❌ | — | 写操作不过滤 |
| role_list | ❌ | — | 角色信息无需行级过滤 |
| role_manage | ❌ | — | 已被 Layer 2 拦截 |
| self_permissions | ❌ | — | 仅返回自身权限 |

### 2.6 数据库变更

新增 `data_scope_rules` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| role_id | BIGINT UNSIGNED FK → roles.id | 角色 |
| resource | VARCHAR(50) | 资源/表名（如 `forms`、`users`） |
| scope_type | ENUM('all', 'own', 'condition', 'deny') | `all`=无限制，`own`=仅自己的，`condition`=按条件，`deny`=禁止访问 |
| owner_field | VARCHAR(50) | `own` 类型时的所有者字段（如 `created_by`、`updated_by`），`all`/`condition` 时为 NULL |
| condition_field | VARCHAR(50) | `condition` 类型时的过滤字段，其他类型为 NULL |
| condition_operator | ENUM('eq', 'in', 'ne') DEFAULT 'eq' | 条件操作符 |
| condition_value | JSON | 条件值（如 `"active"`、`[1,2,3]`） |
| priority | INT DEFAULT 0 | 同角色同资源多条规则时，priority 大的优先（首条匹配策略，不叠加） |

**初始 Seed 数据**：

| role | resource | scope_type | owner_field | condition_field | condition_value | priority |
|------|----------|-----------|-------------|-----------------|-----------------|----------|
| admin | * | all | — | — | — | 0 |
| editor | forms | own | created_by | — | — | 0 |
| editor | form_fields | own | created_by | — | — | 0 |
| editor | users | all | — | — | — | 0 |
| editor | configs | all | — | — | — | 0 |
| viewer | forms | own | created_by | — | — | 0 |
| viewer | form_fields | own | created_by | — | — | 0 |
| viewer | users | condition | — | status | `"active"` | 0 |
| viewer | configs | all | — | — | — | 0 |

> **注意**：`form_fields` 作为独立资源管理（非归入 `forms`），因为它有独立的 `created_by` 字段且可能需要不同的过滤策略。每个具有 Layer 2 功能权限的 Tool 对应的资源都必须有 Seed 规则，否则 deny-by-default 会导致"有权调用但得到空数据"的矛盾体验。

**实现**：

```typescript
// mcp-server/src/auth/data-scope.ts

interface DataScopeRule {
  scopeType: "all" | "own" | "condition" | "deny";
  ownerField?: string;
  conditionField?: string;
  conditionOperator?: "eq" | "in" | "ne";
  conditionValue?: unknown;
}

async function getDataScopeRules(
  db: Database,
  roleName: string,
  resource: string
): Promise<DataScopeRule[]> {
  const role = await db.query.roles.findFirst({ where: eq(roles.name, roleName) });
  if (!role) throw new Error(`Role '${roleName}' not found in database`);

  const rules = await db.query.dataScopeRules.findMany({
    where: and(
      eq(dataScopeRules.roleId, role.id),
      inArray(dataScopeRules.resource, [resource, "*"]),
    ),
    orderBy: desc(dataScopeRules.priority),
  });

  // 默认拒绝（Deny by Default）：未配置规则的角色不可访问该资源的任何数据
  if (rules.length === 0) return [{ scopeType: "deny" }];
  return rules.map(r => ({
    scopeType: r.scopeType,
    ownerField: r.ownerField ?? undefined,
    conditionField: r.conditionField ?? undefined,
    conditionOperator: r.conditionOperator ?? "eq",
    conditionValue: r.conditionValue ?? undefined,
  }));
}

// 规则按 priority DESC 排序，采用首条匹配策略（First Match Wins）
// 不叠加多条规则，避免 priority 语义与实现矛盾
function applyDataScope(
  rules: DataScopeRule[],
  context: ToolContext,
  tableRef: any,
  conditions: any[]
): any[] {
  const rule = rules[0]; // 已按 priority DESC 排序
  if (!rule || rule.scopeType === "all") return conditions;
  if (rule.scopeType === "deny") {
    // 注入不可能为真的条件，等价于返回空结果集
    conditions.push(sql`1 = 0`);
    return conditions;
  }
  if (rule.scopeType === "own" && rule.ownerField) {
    conditions.push(eq(tableRef[rule.ownerField], context.userId));
  }
  if (rule.scopeType === "condition" && rule.conditionField) {
    switch (rule.conditionOperator) {
      case "eq":
        conditions.push(eq(tableRef[rule.conditionField], rule.conditionValue));
        break;
      case "in":
        conditions.push(inArray(tableRef[rule.conditionField], rule.conditionValue as any[]));
        break;
      case "ne":
        conditions.push(ne(tableRef[rule.conditionField], rule.conditionValue));
        break;
    }
  }
  return conditions;
}
```

### 2.7 权限获取与刷新机制

**新增 `self_permissions` MCP Tool**：

> **为什么需要新 Tool？** 一期的 `role_list` 需要 `role:read` 权限，viewer/editor 没有这个权限。这造成"需要权限才能查权限"的鸡生蛋问题。新增一个**无权限要求**的 `self_permissions` 工具，专门返回调用者自身的权限。

```typescript
// mcp-server/src/tools/self-permissions.ts
{
  name: "self_permissions",
  description: "获取当前用户自身的角色和权限列表",
  requiredPermissions: [],  // 任何角色都可调用
  schema: z.object({
    _context: contextSchema,
  }),
  handler: async (db, args) => {
    const { context } = extractContext(args);
    const permissions = await resolveUserPermissions(db, context);
    return { role: context.role, permissions };
  }
}
```

**启动时获取**：

```
Engine.initialize()
  ├── 读取 config（user.userId, user.role）
  ├── 连接 MCP Server
  ├── 调用 self_permissions（不需要任何权限）获取当前角色的权限列表
  ├── 缓存 permissions[] 到内存
  └── 后续的 Skill 匹配 / Tool 过滤 / System Prompt 构建都用这个 permissions[]
```

**定时刷新**：每 5 分钟自动调用 `self_permissions` 重新拉取权限（`setInterval`），避免长时间会话中权限过期。

**事件触发刷新**：`/role` 查看权限时也会调用 `self_permissions` 拉取最新权限。

---

## 3. 方向二：模型管理

### 3.1 设计理念

参考主流 AI 工具（Cursor、ChatGPT、Claude）的做法：
- 模型切换是**对话中的即时操作**，不需要退出重启
- 支持**预设模型**（一键选择）和**自定义模型**（填 endpoint + key）
- 配置入口是**对话内的斜杠命令**，而不是外部 CLI

### 3.2 斜杠命令系统

在对话输入框中，以 `/` 开头的输入被解释为系统命令，不发送给 LLM：

```
/model                    → 显示模型选择列表（数字选择）
/model qwen-max           → 快速切换模型
/model add                → 添加自定义模型（Web 中弹出表单，TUI 中引导到 config 文件）
/role                     → 查看当前角色和权限（只读）
/tools                    → 显示当前可用的工具列表
/clear                    → 清空对话
/help                     → 显示所有斜杠命令
```

**注意**：`/role` 仅为只读查看。角色切换涉及安全边界，只能通过修改 `config.json` 或启动参数 `--role` 实现。这与一期的安全模型一致（§1.3），避免任意权限提升。

### 3.3 统一配置：models.json 取代 config.json 的模型字段

**配置合并方案**：废弃 `config.json` 中的 `model.provider` 和 `model.model`，模型信息统一由 `~/.bicli/models.json` 管理。`config.json` 保留 `mcp`、`user`、`session` 配置。

```json
// ~/.bicli/config.json（二期）
{
  "mcp": { "transport": "stdio", "command": "bicli-mcp-server" },
  "user": { "userId": 1, "role": "admin" },
  "session": { "maxTurns": 20 }
}
```

```json
// ~/.bicli/models.json（新增）
{
  "current": "qwen-plus",
  "models": [
    {
      "id": "qwen-plus",
      "name": "通义千问 Plus",
      "provider": "alibaba",
      "model": "qwen-plus",
      "builtin": true
    },
    {
      "id": "qwen-max",
      "name": "通义千问 Max",
      "provider": "alibaba",
      "model": "qwen-max",
      "builtin": true
    },
    {
      "id": "gpt-4",
      "name": "GPT-4",
      "provider": "openai",
      "model": "gpt-4",
      "builtin": true
    },
    {
      "id": "claude-sonnet",
      "name": "Claude Sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "builtin": true
    }
  ]
}
```

**迁移逻辑**：首次启动二期时，如果 `models.json` 不存在但 `config.json` 有 `model` 字段，自动迁移并生成 `models.json`，设 `current` 为原 `config.json` 的模型。

### 3.4 自定义模型支持

**新增 `custom` provider**：走 OpenAI-compatible API（绝大多数私有部署模型都兼容此格式）：

```typescript
// core/src/llm/providers/custom.ts

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface CustomModelConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export function createCustomProvider(config: CustomModelConfig): LanguageModel {
  const provider = createOpenAI({
    baseURL: config.endpoint,
    apiKey: config.apiKey,
  });
  return provider(config.model);
}
```

自定义模型条目示例：

```json
{
  "id": "my-local-llm",
  "name": "本地部署模型",
  "provider": "custom",
  "model": "my-model-v1",
  "builtin": false,
  "endpoint": "http://192.168.1.100:8080/v1",
  "apiKey": "env:MY_LOCAL_LLM_KEY"
}
```

**API Key 安全**：
- 环境变量引用（推荐）：`"apiKey": "env:MY_KEY"` → 从 `process.env.MY_KEY` 读取
- 直接值（仅本地测试）：`"apiKey": "sk-xxx"` → 存储在用户目录 `~/.bicli/`

### 3.5 `/model` 交互流程

```
> /model

  当前模型: 通义千问 Plus (qwen-plus)

  可用模型:
  [1] ● 通义千问 Plus     (alibaba/qwen-plus)      ← current
  [2]   通义千问 Max      (alibaba/qwen-max)
  [3]   GPT-4             (openai/gpt-4)            ⚠ 未配置 OPENAI_API_KEY
  [4]   Claude Sonnet     (anthropic/claude-sonnet)  ⚠ 未配置 ANTHROPIC_API_KEY

  输入编号或模型 ID 切换

> 2
  ✓ 已切换到: 通义千问 Max (qwen-max)
```

**TUI/Web 差异**：
- TUI：数字选择（简单可靠，Ink 兼容）
- Web：下拉菜单 + 搜索（GUI 体验）

### 3.6 `/model add` — 按运行环境区分

- **Web 模式**：弹出 SettingsPanel 中的"添加模型"表单，填写 name/endpoint/model/key，提交保存
- **TUI 模式**：打印提示"请编辑 `~/.bicli/models.json` 添加自定义模型"，并展示示例 JSON

```
> /model add

  TUI 模式下请直接编辑配置文件添加自定义模型：
  
  文件: ~/.bicli/models.json
  
  在 models 数组中添加：
  {
    "id": "my-model",
    "name": "我的模型",
    "provider": "custom",
    "model": "model-id",
    "endpoint": "http://host:port/v1",
    "apiKey": "env:MY_KEY"
  }
  
  添加后输入 /model 刷新列表。
```

### 3.7 热切换实现

模型切换**不重启进程**。每次对话前根据当前 `models.json` 的 `current` 创建 model 实例：

```typescript
class ModelRegistry {
  private configPath: string;
  
  getCurrent(): ModelEntry {
    const data = this.load();
    return data.models.find(m => m.id === data.current)!;
  }

  switchTo(idOrIndex: string | number): ModelEntry {
    const data = this.load();
    const target = typeof idOrIndex === "number"
      ? data.models[idOrIndex - 1]
      : data.models.find(m => m.id === idOrIndex);
    if (!target) throw new Error(`模型 ${idOrIndex} 不存在`);
    data.current = target.id;
    this.save(data);
    return target;
  }
}
```

`handleMessage()` 中每次调用 `modelRegistry.getCurrent()`，无需重启即可使用新模型。

---

## 4. 方向三：GUI + 嵌入能力

### 4.1 架构升级

一期的 CLI 是单体应用（TUI + 业务逻辑混在一起）。二期将 **核心逻辑** 和 **渲染层** 分离：

```
┌──────────────────────────────────────────────────────┐
│                    @bicli/core                        │
│  (纯逻辑层：模型管理、权限、会话、Skill、斜杠命令)      │
│  依赖 Node.js API（fs/child_process）                │
│  不依赖任何 UI 框架                                   │
└──────────┬──────────────────┬────────────────────────┘
           │                  │
    ┌──────┴──────┐    ┌──────┴──────────────────┐
    │  @bicli/cli  │    │  @bicli/web              │
    │  TUI 渲染层   │    │  Server: Express + WS    │
    │  (Ink)       │    │  Client: React + Vite    │
    │  直接调 core  │    │  Client 通过 WS 调 core   │
    └─────────────┘    └──────────────────────────┘
```

### 4.2 Core 的环境约束

**Core 运行在 Node.js 环境**，依赖：
- `fs` — 读写 `config.json`、`models.json`
- `child_process`（通过 MCP SDK）— 启动 MCP Server 子进程
- `dotenv` — 加载环境变量

**Core 不在浏览器中运行**。Web 模式下，Core 运行在 CLI 启动的 Node.js 进程中，浏览器通过 WebSocket 与之通信：

```
浏览器 (React App)
    │
    └── WebSocket ────→ CLI 进程 (Node.js)
                          ├── @bicli/core（引擎）
                          │     ├── MCP Client → stdio → MCP Server
                          │     ├── LLM 调用
                          │     └── 权限/Skill/Session
                          └── Express 静态资源服务
```

### 4.3 @bicli/core — 引擎 API

```typescript
// packages/core/src/index.ts

export interface BiCLIEngineOptions {
  mcpConnection?: McpConnection;  // 外部注入（Web 模式共享连接池）
  onDispose?: () => void;         // 销毁时回调（释放连接池引用）
}

export class BiCLIEngine {
  private config: ConfigManager;
  private mcp: McpConnection;
  private session: Session;
  private modelRegistry: ModelRegistry;
  private skillMatcher: SkillMatcher;
  private permissions: string[] = [];
  private permissionRefreshTimer?: NodeJS.Timeout;
  private onDispose?: () => void;

  constructor(options?: BiCLIEngineOptions);
  async initialize(): Promise<void>;
  async dispose(): Promise<void>;  // 内部调用 onDispose 回调

  // 发送消息，返回流式事件
  chat(message: string): AsyncGenerator<ChatEvent>;

  // 斜杠命令
  handleSlashCommand(command: string): Promise<SlashCommandResult>;

  // 状态查询
  getStatus(): EngineStatus;
  getCurrentModel(): ModelEntry;
  getPermissions(): string[];
  getAvailableTools(): ToolInfo[];
  
  // 权限刷新
  async refreshPermissions(): Promise<string[]>;
}

type ChatEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call_start"; toolName: string; args: unknown }
  | { type: "tool_call_end"; toolName: string; result: unknown }
  | { type: "error"; message: string }
  | { type: "done"; fullText: string };
```

**流式输出**：二期将 `generateText()` 改为 `streamText()`，通过 `AsyncGenerator` 逐步 yield `text_delta` 事件。Tool 调用通过 `tool_call_start` / `tool_call_end` 事件上报。

```typescript
async *chat(message: string): AsyncGenerator<ChatEvent> {
  this.session.addMessage({ role: "user", content: message });
  const matchedSkill = this.skillMatcher.match(message, this.permissions);
  const systemPrompt = buildSystemPrompt(matchedSkill, this.config.user.role, this.permissions);
  const tools = this.getFilteredTools(matchedSkill);
  const model = this.createCurrentModel();

  const result = streamText({
    model,
    system: systemPrompt,
    messages: this.session.getMessages(),
    tools,
    stopWhen: stepCountIs(5),
  });

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      yield { type: "text_delta", content: part.textDelta };
    } else if (part.type === "tool-call") {
      yield { type: "tool_call_start", toolName: part.toolName, args: part.args };
    } else if (part.type === "tool-result") {
      yield { type: "tool_call_end", toolName: part.toolName, result: part.result };
    }
  }

  const finalText = await result.text;
  this.session.addMessage({ role: "assistant", content: finalText });
  yield { type: "done", fullText: finalText };
}
```

### 4.4 @bicli/web — 双层架构

**Server 层**（Node.js，`packages/web/src/server/`）：

```typescript
// packages/web/src/server/index.ts

import crypto from "node:crypto";
import express from "express";
import { WebSocketServer } from "ws";
import { BiCLIEngine, McpConnectionPool } from "@bicli/core";

export async function startWebServer(options: { port: number; host?: string }) {
  const { port, host = "127.0.0.1" } = options;
  
  // 启动时生成一次性 Token，防止局域网未授权访问
  const authToken = crypto.randomBytes(16).toString("hex");
  
  const app = express();
  app.use(express.static("dist/client"));

  const server = app.listen(port, host);
  
  // 所有 WebSocket 连接共享一个 MCP Server 子进程
  const mcpPool = new McpConnectionPool();
  await mcpPool.initialize();
  
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    // Token 验证：ws://host:port?token=xxx
    const url = new URL(req.url!, `http://${req.headers.host}`);
    if (url.searchParams.get("token") !== authToken) {
      ws.close(4001, "Unauthorized");
      return;
    }

    // 每个连接有独立 Session，但共享 MCP 连接
    const mcpConn = mcpPool.acquire();
    const engine = new BiCLIEngine({
      mcpConnection: mcpConn,
      onDispose: () => mcpPool.release(),
    });
    await engine.initialize();

    ws.on("message", async (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }
      
      try {
        if (msg.type === "chat") {
          for await (const event of engine.chat(msg.content)) {
            if (ws.readyState !== ws.OPEN) break;
            ws.send(JSON.stringify(event));
          }
        } else if (msg.type === "slash_command") {
          const result = await engine.handleSlashCommand(msg.content);
          ws.send(JSON.stringify({ type: "slash_result", ...result }));
        } else if (msg.type === "get_status") {
          ws.send(JSON.stringify({ type: "status", ...engine.getStatus() }));
        }
      } catch (err: any) {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "error", message: err.message }));
        }
      }
    });

    ws.on("close", () => engine.dispose());
  });

  const url = `http://${host}:${port}?token=${authToken}`;
  console.log(`BiCLI Web GUI: ${url}`);
  return { port, url, server };
}
```

**安全模型**：
- 默认绑定 `127.0.0.1`（仅本机访问），避免局域网暴露
- 启动时生成随机 Token，WebSocket 握手必须携带 `?token=xxx`
- Token 打印在终端中，只有启动者能看到

**MCP 连接共享**：所有 WebSocket 连接共享一个 `McpConnectionPool`（单个 MCP Server 子进程），避免 N 个标签页 = N 个子进程 + N 个 MySQL 连接。每个连接有独立的 Engine 实例（Session/权限/模型选择独立）。

```typescript
// core/src/mcp-client/pool.ts

export class McpConnectionPool {
  private connection: McpConnection | null = null;
  private refCount = 0;

  async initialize(): Promise<void> {
    this.connection = new McpConnection();
    await this.connection.connect();
  }

  acquire(): McpConnection {
    this.refCount++;
    return this.connection!;
  }

  release(): void {
    this.refCount--;
    if (this.refCount <= 0) {
      this.connection?.disconnect();
    }
  }
}
```

**Client 层**（React，`packages/web/src/client/`）：

```
packages/web/
├── src/
│   ├── server/
│   │   └── index.ts             # Express + WebSocket server
│   ├── client/
│   │   ├── App.tsx              # 主应用
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx    # 对话面板（流式渲染）
│   │   │   ├── ModelSelector.tsx # 顶部模型下拉菜单
│   │   │   ├── ToolCallCard.tsx # 工具调用折叠卡片
│   │   │   ├── MessageBubble.tsx # 消息气泡（Markdown 渲染）
│   │   │   ├── SlashMenu.tsx    # 斜杠命令补全菜单
│   │   │   └── StatusBar.tsx    # 连接状态/角色信息
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts  # WebSocket 连接管理
│   │   └── index.tsx
│   └── index.html
├── vite.config.ts               # 仅构建 client 部分
└── package.json
```

### 4.5 嵌入模式

`@bicli/web` 导出可嵌入的 React 组件和启动函数：

```tsx
// 嵌入方式一：作为 React 组件（需要自行启动 server）
import { BiCLIChat } from "@bicli/web/client";

function MyApp() {
  return (
    <BiCLIChat
      wsUrl="ws://localhost:3210"
      theme="light"
      height="600px"
    />
  );
}
```

```typescript
// 嵌入方式二：程序化启动 server + 获取端口
import { startWebServer } from "@bicli/web/server";

const server = await startWebServer({ port: 0 }); // 0 = 随机端口
console.log(`Server: http://localhost:${server.port}`);
```

### 4.6 CLI 启动 Web 模式

```bash
bicli web                  # 启动 Web 界面，默认 http://localhost:3210
bicli web --port 8080      # 自定义端口

# 原有模式保留
bicli chat                 # TUI 模式
bicli chat -m "xxx"        # 单条消息模式
```

---

## 5. 项目结构变更

```
bicli/
├── packages/
│   ├── core/                      # 新增：无头引擎
│   │   ├── src/
│   │   │   ├── index.ts           # BiCLIEngine 主类
│   │   │   ├── config/            # 配置管理（从 cli 迁移）
│   │   │   ├── model-registry/    # 模型注册表（新）
│   │   │   ├── permissions/       # 权限管理（新：三层过滤）
│   │   │   ├── slash-commands/    # 斜杠命令（新）
│   │   │   ├── llm/              # LLM 适配（从 cli 迁移）
│   │   │   ├── mcp-client/       # MCP 连接（从 cli 迁移）
│   │   │   ├── skill-loader/     # Skill 加载（从 cli 迁移）
│   │   │   └── session/          # 会话管理（从 cli 迁移）
│   │   └── package.json
│   │
│   ├── web/                       # 新增：Web GUI
│   │   ├── src/
│   │   │   ├── server/            # Express + WebSocket 层
│   │   │   ├── client/            # React 前端
│   │   │   └── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   ├── cli/                       # 瘦身：只保留命令注册 + TUI 渲染
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── commands/          # chat/config/mcp/web 命令
│   │   │   └── tui/              # TUI 渲染（Ink）
│   │   └── package.json           # 依赖 @bicli/core, @bicli/web
│   │
│   ├── mcp-server/                # 扩展：data_scope_rules + tool annotations
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   │   ├── rbac.ts
│   │   │   │   └── data-scope.ts  # 新增
│   │   │   ├── db/
│   │   │   │   └── schema.ts      # 新增 data_scope_rules 表
│   │   │   └── tools/
│   │   │       └── register.ts    # 新增 _meta.requiredPermissions
│   │   └── ...
│   │
│   └── skills/                    # 不变
│
└── docs/
```

### 5.1 包依赖关系

```
@bicli/cli  ──依赖──▸  @bicli/core  ──依赖──▸  @bicli/skills
                  └── optionalDep ──▸  @bicli/web（动态 import，仅 bicli web 命令时加载）

@bicli/web  ──依赖──▸  @bicli/core  ──依赖──▸  @bicli/skills

@bicli/core ──运行时 MCP 协议──▸  @bicli/mcp-server（独立进程）
```

> **为什么 @bicli/web 是 optional？** 只使用 TUI 模式的用户不需要安装 React DOM、Express、ws、shadcn/ui 等 Web 依赖。CLI 通过动态 `import("@bicli/web/server")` 按需加载，import 失败时提示安装。

---

## 6. 斜杠命令完整设计

### 6.1 命令列表

| 命令 | 说明 | 安全级别 |
|------|------|---------|
| `/model` | 显示模型列表，数字选择切换 | 无限制 |
| `/model <id>` | 快速切换到指定模型 | 无限制 |
| `/model add` | 添加自定义模型（Web=表单，TUI=引导编辑文件） | 无限制 |
| `/model remove <id>` | 删除自定义模型（不可删 builtin） | 无限制 |
| `/role` | 查看当前角色、权限列表、可用工具（只读） | 无限制 |
| `/tools` | 列出当前权限下可用的所有工具 | 无限制 |
| `/clear` | 清空对话历史 | 无限制 |
| `/help` | 显示帮助信息 | 无限制 |

**注意**：没有 `/role <name>` 切换命令。角色切换是安全操作，只能通过 config 文件或启动参数 `--role`。

### 6.2 命令解析器

```typescript
// core/src/slash-commands/parser.ts

export interface SlashCommand {
  name: string;
  args: string[];
  raw: string;
}

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  return {
    name: parts[0],
    args: parts.slice(1),
    raw: trimmed,
  };
}

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}
```

### 6.3 命令结果类型

```typescript
// core/src/slash-commands/types.ts

export type SlashCommandResult =
  | { type: "model_list"; models: ModelDisplayInfo[]; current: string }
  | { type: "model_switched"; from: string; to: ModelDisplayInfo }
  | { type: "model_add_guide"; platform: "tui" | "web"; template?: string }
  | { type: "model_removed"; id: string }
  | { type: "role_info"; role: string; permissions: string[]; availableTools: string[] }
  | { type: "tools_list"; tools: Array<{ name: string; description: string }> }
  | { type: "cleared" }
  | { type: "help"; commands: Array<{ command: string; description: string }> }
  | { type: "error"; message: string };

export interface ModelDisplayInfo {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  missingEnvKey?: string;
}
```

UI 层（TUI / Web）根据 `type` 字段选择对应的渲染组件。

---

## 7. 技术选型补充

| 新增项 | 选型 | 理由 |
|--------|------|------|
| Web Server | Express 5.x | 成熟稳定，静态资源 + WS 升级 |
| WebSocket | ws | Node.js 原生 WS 库，无依赖 |
| Web UI 框架 | Vite + React 19 | 与 Ink 共享 React 生态 |
| Web UI 组件 | shadcn/ui + Tailwind 4 | 现代、可定制、无运行时依赖 |
| Markdown 渲染 | react-markdown + remark-gfm | 渲染 AI 返回的 Markdown 表格/代码 |
| 流式 AI | `streamText()` from `ai` SDK | 替换一期的 `generateText()`，支持流式输出 |

---

## 8. 实现分期

### Phase 2a（优先）— core 分离 + 模型管理 + 权限 + 斜杠命令

按推荐顺序排列（模型管理优先，改动小、体感明显）：

| # | Task | 所属包 | 依赖 |
|---|------|--------|------|
| 1 | 搭建 @bicli/core 包骨架，定义 BiCLIEngine 接口 | core | — |
| 2 | 迁移 config/llm/mcp-client/skill-loader/session 到 core | core, cli | T1 |
| 3 | 实现 ModelRegistry（models.json 读写 + 迁移逻辑 + fallback） | core | T2 |
| 4 | 新增 custom provider（OpenAI-compatible） | core | T3 |
| 5 | 实现斜杠命令解析器 + model/role/tools/clear/help 处理器 | core | T3 |
| 6 | TUI 集成斜杠命令 + /model 数字选择交互 | cli | T5 |
| 7 | MCP Server: tools/list 增加 _meta.requiredPermissions | mcp-server | — |
| 8 | MCP Server: 新增 self_permissions 工具（无权限要求） | mcp-server | — |
| 9 | 权限 Layer 1 — Skill 可见性过滤 | core | T2 |
| 10 | 权限 Layer 2 — Tool 可见性过滤（基于 _meta） | core | T7 |
| 11 | 权限 Layer 3 — data_scope_rules 表 + 行级过滤 + deny-by-default | mcp-server | — |
| 12 | Core 权限获取（启动调 self_permissions + 定时刷新） | core | T8, T10 |
| 13 | McpConnectionPool（连接共享，为 Web 做准备） | core | T2 |
| 14 | BiCLIEngine 完整封装 + streamText 流式输出 | core | T11, T12, T13 |
| 15 | CLI 适配新的 core API（TUI 流式渲染） | cli | T14 |
| 16 | 全量测试 + 文档更新 | all | T15 |

### Phase 2b — Web GUI + 嵌入

| # | Task | 所属包 | 依赖 |
|---|------|--------|------|
| 1 | 搭建 @bicli/web 包骨架（Vite + React + Tailwind + shadcn） | web | — |
| 2 | Web Server 层（Express + WebSocket bridge） | web | 2a done |
| 3 | ChatPanel + MessageBubble（流式渲染 + Markdown） | web | T2 |
| 4 | ModelSelector 下拉菜单 + 斜杠命令 SlashMenu | web | T3 |
| 5 | ToolCallCard（工具调用可视化折叠卡片） | web | T3 |
| 6 | StatusBar + 权限信息展示 | web | T3 |
| 7 | CLI `web` 命令（启动 server + 打开浏览器） | cli | T6 |
| 8 | 嵌入模式导出（BiCLIChat 组件 + startWebServer） | web | T7 |

---

## 9. 风险与决策点

| 决策点 | 选项 | 决策 | 理由 |
|--------|------|------|------|
| Core 分离方式 | A) 完全分离新包 B) cli 内部分层 | **A 完全分离** | Web 需要独立依赖 core，必须是独立包 |
| Tool 权限来源 | A) CLI 硬编码 B) MCP Server 提供 | **B Server 提供** | 单一数据源，不会漂移 |
| 模型配置存储 | A) 合并到 config.json B) 独立 models.json | **B 独立** | 模型列表可能很长，关注点分离 |
| 角色切换方式 | A) 斜杠命令 B) 仅 config 文件 | **B 仅 config** | 防止运行时权限提升 |
| Web core 运行位置 | A) 浏览器 B) Node.js server | **B Server 端** | Core 依赖 fs/child_process，浏览器不支持 |
| 行级过滤配置 | A) 硬编码 B) 数据库表 | **B 数据库表** | 灵活，admin 可通过 AI 动态调整 |
| 2a 内部优先级 | A) 权限优先 B) 模型管理优先 | **B 模型优先** | 改动小、体感明显，先出手感 |

---

## 10. 二期完成后的体验对比

| 场景 | 一期 | 二期 |
|------|------|------|
| 切换模型 | 退出 → `config set model.provider xxx` → 重新进入 | `/model` → 选个数字，即时切换 |
| viewer 查数据 | LLM 尝试调用全部工具 → 大量权限报错 | 只看到有权限的 6 个工具，表单数据自动过滤为自己创建的 |
| 给同事演示 | 必须打开终端、敲命令 | `bicli web` → 浏览器打开，可视化交互 |
| 嵌入现有系统 | 不可能 | `<BiCLIChat wsUrl="..." />` 组件嵌入 |
| 添加私有模型 | 改代码 | Web 中填表单，TUI 中编辑 JSON |
| 查看权限 | 不可见 | `/role` 显示权限 + 可用工具 |
| 流式响应 | 等待完成才显示 | 逐字流式输出 |
