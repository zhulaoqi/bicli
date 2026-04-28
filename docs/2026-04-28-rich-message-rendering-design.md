# BiCLI 多类型消息渲染协议设计

日期：2026-04-28  
范围：`bicli/packages/mcp-server` SSE 输出协议 + `dataeye-frontend/src/app/pages/BiCLIWorkbench` 消息渲染

## 1. 背景

当前 BiCLI 聊天回复主要由两部分组成：

- `text_delta` / `text_replace`：模型生成的 Markdown 文本。
- `chart_data`：后端从工具结果中识别 `__chart__` 后，通过 SSE 单独发送给前端渲染图表。

这导致很多本该结构化展示的数据仍然交给模型写 Markdown，例如用户列表、分析列表、SQL 查询结果、权限列表、指标摘要。模型可能输出：

- 长段落而非表格。
- 随机缩进列表。
- 展示过多明细。
- 泄漏邮箱、手机号、完整 ID 等敏感字段。
- 结构不稳定，前端无法分页、复制、下载或折叠。

目标是建立一套 **Rich Message Blocks** 协议：后端通过 SSE 发送明确类型的数据块，前端按 `type` 渲染对应组件。模型只负责解释、总结、引导，不负责把结构化数据“排版”成 UI。

## 2. 现状缺口

### 2.1 已有能力

后端：

- `chart_data` 事件已存在。
- `tool_start` / `tool_result` 已存在。
- `follow_ups` 已存在。
- 工具执行结果已能在 `stream.ts` 中被解析和改写。

前端：

- `useChatStream` 已解析 `chart_data`。
- `MessageItem` 已能渲染 `ChartWidget`。
- `ChartWidget` 已支持 line/bar/funnel/heatmap。

### 2.2 缺失能力

- 没有通用 `message_block` / `table_data` 事件。
- `StreamState` 只有 `charts`，没有统一的 blocks。
- `UIMessage` 只有 `content/toolCalls/charts`，不能保存表格、指标卡、提醒等结构化块。
- 工具返回没有 `__table__`、`__metric__` 等结构化展示约定。
- 用户列表工具直接返回邮箱、手机号、完整用户 ID，存在隐私和可读性问题。
- 前端没有表格块组件，不支持分页、折叠、复制、下载。
- 历史消息只保存 assistant 文本和 toolCalls，结构化块刷新后会丢失。

## 3. 设计目标

- 后端能输出多种结构化消息块：表格、图表、指标卡、摘要、警告、表单请求、操作确认。
- 前端根据 `block.type` 渲染对应 UI，而不是让模型生成 Markdown 表格。
- 敏感字段在后端进入模型和前端前都要脱敏或默认隐藏。
- LLM 上下文只保留摘要，结构化明细通过 SSE 给前端，不撑爆 token。
- 历史会话可恢复结构化块，至少 P1 支持表格/图表恢复。
- 协议可渐进扩展，旧前端忽略未知 block 不崩溃。

## 4. 非目标

- 本期不做完整 BI 报表组件替代。
- 本期不做大型虚拟滚动表格，先限制行数。
- 本期不让模型直接控制前端任意组件，只允许白名单 block type。
- 本期不支持任意 HTML 或脚本渲染。

## 5. 协议设计

### 5.1 统一事件：`message_block`

新增 SSE 事件：

```text
event: message_block
data: {
  "id": "block_abc",
  "type": "table",
  "sourceTool": "dataeye_user_list",
  "title": "当前组织用户列表",
  "payload": {}
}
```

`chart_data` 可暂时保留兼容，后续迁移为 `message_block(type="chart")`。

### 5.2 Block 基础结构

```ts
type MessageBlockType =
  | "table"
  | "chart"
  | "metric_cards"
  | "summary"
  | "warning"
  | "form_request"
  | "confirmation";

interface MessageBlockBase<TPayload> {
  id: string;
  type: MessageBlockType;
  title?: string;
  sourceTool?: string;
  toolCallId?: string;
  createdAt?: string;
  display?: {
    collapsed?: boolean;
    maxHeight?: number;
    priority?: "primary" | "secondary";
  };
  payload: TPayload;
}
```

## 6. Table Block

### 6.1 用途

用于展示：

- 用户列表
- 自助分析列表
- SQL 查询结果
- 看板列表
- 角色列表
- 权限列表

### 6.2 结构

```ts
interface TableBlockPayload {
  columns: Array<{
    key: string;
    title: string;
    dataType?: "string" | "number" | "datetime" | "status" | "email" | "phone" | "id";
    sensitive?: boolean;
    hiddenByDefault?: boolean;
    width?: number;
  }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  total?: number;
  page?: number;
  pageSize?: number;
  truncated?: boolean;
  masks?: {
    enabled: boolean;
    fields: string[];
  };
  actions?: Array<{
    key: string;
    label: string;
    target?: "row" | "table";
  }>;
}
```

### 6.3 用户列表展示策略

`dataeye_user_list` 默认输出：

- 总数：`total`
- 表格：最多前 20 条
- 默认列：用户名、邮箱（脱敏）、手机号（脱敏）、状态
- 默认隐藏：完整用户 ID、角色 ID
- 不把完整邮箱/手机号传给 LLM

示例：

```json
{
  "id": "block_users_001",
  "type": "table",
  "title": "当前组织用户列表",
  "sourceTool": "dataeye_user_list",
  "payload": {
    "columns": [
      { "key": "username", "title": "用户名", "dataType": "string" },
      { "key": "email", "title": "邮箱", "dataType": "email", "sensitive": true },
      { "key": "phone", "title": "手机号", "dataType": "phone", "sensitive": true },
      { "key": "status", "title": "状态", "dataType": "status" }
    ],
    "rows": [
      { "username": "张三", "email": "zh***@company.com", "phone": "138****0003", "status": "ACTIVE" }
    ],
    "total": 112,
    "page": 1,
    "pageSize": 20,
    "truncated": true,
    "masks": { "enabled": true, "fields": ["email", "phone"] }
  }
}
```

## 7. Chart Block

保留现有 `ChartData` 能力，统一成 block：

```ts
interface ChartBlockPayload {
  chartType: "line" | "bar" | "funnel" | "heatmap";
  xAxis?: string[];
  series?: Array<{ name: string; data: (number | null)[] }>;
  funnelSteps?: Array<{ name: string; value: number; rate?: string }>;
  heatmapRows?: Array<{ date: string; initialUsers: number; retentions: (number | null)[] }>;
}
```

迁移策略：

- P0 保留 `chart_data`，前端继续支持。
- P1 后端同时发送 `message_block(type="chart")`。
- P2 前端完全改用 `blocks`，`chart_data` 保留兼容。

## 8. Metric Cards Block

用于 “当前组织共有 112 个用户”、“ROAS = 1.2，下降 18%” 等摘要。

```ts
interface MetricCardsPayload {
  cards: Array<{
    label: string;
    value: string | number;
    unit?: string;
    delta?: string | number;
    trend?: "up" | "down" | "flat" | "unknown";
    description?: string;
  }>;
}
```

用户列表场景可同时发送：

- `metric_cards`: 当前组织用户总数 112
- `table`: 前 20 条用户

## 9. Form Request Block

用于创建用户这类需要补充信息的场景。模型不应在文本里写一长串字段，而应发结构化表单请求：

```ts
interface FormRequestPayload {
  formKey: "create_user" | "create_role" | "create_schedule" | string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "email" | "phone" | "select" | "boolean";
    required: boolean;
    options?: Array<{ label: string; value: string | number | boolean }>;
  }>;
  submitLabel?: string;
}
```

P0 只设计，不实现。

## 10. Confirmation Block

用于写操作二次确认：

```ts
interface ConfirmationPayload {
  operation: string;
  summary: Array<{ label: string; value: string }>;
  confirmText: string;
  cancelText?: string;
  danger?: boolean;
}
```

P0 只设计，不实现。

## 11. 后端生成策略

### 11.1 工具返回约定

工具可在 `formatSuccess` 的 `data` 中返回特殊字段：

```ts
{
  "__blocks__": [MessageBlock],
  "summary": {}
}
```

`stream.ts` 拦截：

- 若 `parsed.data.__blocks__` 存在：
  - 逐个发送 `message_block`
  - 从 LLM 上下文中删除 `__blocks__`
  - 将 `summary` 或裁剪后的字段留给模型解释

这与现有 `__chart__` 模式一致，但更通用。

### 11.2 LLM 上下文策略

给 LLM 的工具结果不应包含完整表格，只保留：

```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 112,
      "shownRows": 20,
      "blockId": "block_users_001",
      "displayHint": "用户列表已通过结构化表格展示，正文只需总结，不要重复逐条列出。"
    }
  }
}
```

## 12. 前端渲染策略

### 12.1 Stream State

从：

```ts
charts: ChartData[];
```

扩展为：

```ts
blocks: MessageBlock[];
charts: ChartData[]; // 兼容旧事件
```

### 12.2 MessageItem

渲染顺序：

1. ToolTimeline
2. 文本解释
3. MessageBlocks
4. FollowUps

表格块用独立组件：

```tsx
<TableBlock block={block} />
```

### 12.3 TableBlock 交互

P0 支持：

- 折叠/展开
- 总数和分页信息展示
- 表格渲染前 20 条
- 复制当前可见表格
- 敏感字段默认脱敏

P1 支持：

- 下载 CSV
- “查看更多”触发下一页工具调用
- 行级操作，如“基于此用户分配角色”

## 13. 安全边界

- 默认不展示完整手机号、邮箱、用户 ID、设备 ID、广告 ID、IP。
- `sensitive=true` 的列默认脱敏。
- 原始敏感值不进入 LLM 上下文。
- 前端不提供“显示完整敏感字段”按钮，除非后端明确返回权限标记。
- 表格最多渲染 100 行；超过需要分页或下载。
- Unknown `block.type` 前端显示“暂不支持的消息块”，不能执行任意 HTML。

## 14. 历史持久化

当前 messages 表主要保存文本和 toolCalls。结构化块需要新增策略：

P0：

- 不持久化 blocks，刷新后仅保留文本总结和 tool timeline。
- 适合快速上线，但历史体验不完整。

P1：

- 在 assistant message 增加 `blocks` JSON 字段，或复用现有 `toolCalls.result` 重建 blocks。
- 推荐新增字段，避免从 tool result 逆向推断。

## 15. 观测指标

后端记录：

- `message_block.count`
- `message_block.type`
- `message_block.sourceTool`
- `message_block.rows`
- `message_block.truncated`
- `message_block.sensitiveMasked`

前端记录：

- block 渲染失败数
- unknown block type 数
- 表格折叠/复制/下载点击数

## 16. 验收标准

- 用户问“用户列表有多少用户”时：
  - 文本只总结总数。
  - 用户明细通过 TableBlock 展示。
  - 邮箱/手机号脱敏。
  - 不展示完整用户 ID。
- 用户问“有哪些自助分析”时：
  - 分析列表通过 TableBlock 展示。
  - 正文不重复逐条展开。
- 图表结果仍正常显示。
- 旧 `chart_data` 事件不受影响。
- 未知 block type 不导致页面崩溃。

## 17. 风险与回滚

风险：

- 协议过早泛化，导致实现复杂。
- 结构化块和文本重复展示。
- 历史消息刷新后 blocks 丢失。

缓解：

- P0 只实现 `table`，保留 `chart_data`。
- 工具结果给 LLM 只留 summary，减少重复展开。
- 历史持久化放到 P1，不阻塞首版体验。

回滚：

- 后端关闭 `__blocks__` 拦截即可恢复 Markdown 展示。
- 前端忽略 `message_block` 不影响 `text_delta`。
