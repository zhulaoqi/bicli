# 多类型消息渲染协议实施计划

对应需求设计：`docs/2026-04-28-rich-message-rendering-design.md`

目标：建立后端结构化消息块 SSE 协议，并优先把用户列表类结果渲染成前端表格，后续可扩展 chart、metric_cards、form_request、confirmation。

## P0：协议骨架与表格首版

### 1. 后端定义 MessageBlock 类型

新增文件：

- `packages/mcp-server/src/chat/message-blocks.ts`

内容：

- `MessageBlockBase`
- `TableMessageBlock`
- `ChartMessageBlock`
- `createBlockId`
- `maskEmail`
- `maskPhone`
- `normalizeTableRows`
- `extractMessageBlocksFromToolResult`

验收：

- 类型可被 `stream.ts` 和具体 tool 复用。
- 单测覆盖邮箱/手机号脱敏、未知字段过滤、空 rows。

### 2. stream.ts 支持 `message_block`

修改：

- `packages/mcp-server/src/chat/stream.ts`

实现：

- 在工具 `execute` 返回后解析 JSON。
- 优先识别 `parsed.data.__blocks__`。
- 对每个 block 发送：

```ts
sseSend(res, "message_block", block);
```

- 删除 `parsed.data.__blocks__` 后再传给 LLM。
- 保留当前 `__chart__ -> chart_data` 逻辑，避免破坏现有图表。

注意：

- `__blocks__` 不应进入 LLM 上下文。
- 发送失败不能中断工具执行。
- `message_block` 应早于最终文本总结到达，方便前端边查边展示。

验收：

- 工具返回 `__blocks__` 时，SSE 能看到 `message_block`。
- LLM 收到的工具结果不含完整 rows。
- `chart_data` 原有行为不变。

### 3. 用户列表工具返回 Table Block

修改：

- `packages/mcp-server/src/tools/dataeye-user-list.ts`

实现：

- 将原始用户记录裁剪成两份：
  - `tableRows`：给前端展示，敏感字段脱敏。
  - `summary`：给 LLM，只有 total/page/pageSize/shownRows/blockId。
- 返回格式：

```ts
formatSuccess({
  summary: {
    total,
    page,
    pageSize,
    shownRows,
    blockId,
    displayHint: "用户列表已通过结构化表格展示，正文只需总结，不要重复逐条列出。"
  },
  __blocks__: [tableBlock]
})
```

默认列：

- `username`
- `email`，脱敏
- `phone`，脱敏
- `status`
- `roles`，只展示角色名称，数量过多时截断

默认隐藏或不返回：

- 完整 `userId`
- 角色 ID
- 原始手机号
- 原始邮箱

验收：

- 用户列表请求不再让模型逐条输出用户信息。
- 前端收到 table block。
- 工具结果里没有完整手机号/邮箱。

### 4. 前端 StreamState 支持 blocks

修改：

- `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`

实现：

- 新增类型：

```ts
export type MessageBlock = TableMessageBlock | ChartMessageBlock | UnknownMessageBlock;
```

- `StreamState` 新增：

```ts
blocks: MessageBlock[];
```

- `initialState`、`reset`、`send` 初始化 `blocks: []`。
- `applyEvent` 支持：

```ts
case "message_block":
  return { ...s, blocks: [...s.blocks, normalizeBlock(d)] };
```

验收：

- 收到 `message_block` 后状态中有 block。
- 未知 block type 不报错。

### 5. 前端消息模型携带 blocks

检查并修改消息组装位置，重点搜索：

- `state.charts`
- `toolCalls`
- `UIMessage`
- `messages`

可能文件：

- `dataeye-frontend/src/app/pages/BiCLIWorkbench/index.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/index.tsx`
- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageList.tsx`

实现：

- `UIMessage` 增加 `blocks?: MessageBlock[]`。
- 当前流式 assistant 消息把 `state.blocks` 传入。
- 已完成消息暂不要求持久化 blocks，P1 再补。

验收：

- 流式过程中 TableBlock 能跟随消息展示。
- 不影响已有 charts 展示。

### 6. 新增 TableBlock 组件

新增：

- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/TableBlock.tsx`
- 可选：`MessageBlocks.tsx`

实现：

- 基于 Ant Design `Table` 或轻量 HTML table。
- 展示标题、总数、分页信息、脱敏提示。
- 支持折叠/展开。
- 支持复制当前可见 rows 为 TSV 或 Markdown。
- `hiddenByDefault` 列默认不展示。
- `sensitive` 列显示脱敏标识。

验收：

- 用户列表以表格展示。
- 复制按钮可复制可见数据。
- 空 rows 显示“暂无数据”。
- 表格宽度不会撑破聊天气泡。

### 7. MessageItem 渲染 blocks

修改：

- `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`

实现：

- 引入 `MessageBlocks`。
- 非用户消息在 Markdown 文本之后渲染 blocks。
- 继续渲染旧 `charts`，但若 `blocks` 中已有同 id chart，需要去重。

验收：

- 文本总结 + 表格块能同屏展示。
- 流式慢响应时仍显示“思考中/正在查询数据”。
- copy assistant 文本时默认只复制正文，不复制表格；表格有自己的复制按钮。

## P1：持久化与更多列表工具

### 1. 历史消息保存 blocks

方案 A：新增 messages JSON 字段。

- 优点：恢复简单。
- 缺点：需要数据库迁移。

方案 B：保存到 assistant message 的 metadata。

- 优点：如果已有 metadata 字段可直接复用。
- 缺点：需要检查 session-store 当前 schema。

建议：

- 先检查 `packages/mcp-server/src/chat/session-store.ts`。
- 若已有 metadata/toolCalls JSON 字段，优先复用 metadata。
- 否则新增 `blocks` JSON 字段。

验收：

- 刷新页面后表格仍能恢复。
- 旧历史消息不受影响。

### 2. 分析列表/看板列表表格化

候选工具：

- `dataeye_analysis_list`
- 看板/报表相关 list 工具
- 权限/角色 list 工具

策略：

- 对每个 list 工具只输出 summary + table block。
- 明细字段进入前端前做白名单选择。
- PII 字段统一经过 `message-blocks.ts` helper。

验收：

- 常见列表型问题不再依赖 Markdown 列表。

### 3. chart 迁移到 block

实现：

- `__chart__` 同时转成 `message_block(type="chart")`。
- 前端优先渲染 blocks 中 chart。
- 旧 `chart_data` 保留至少一个版本周期。

验收：

- 原图表能力不退化。
- 统一 blocks 渲染链路。

## P2：交互增强

### 1. 表格分页

实现：

- TableBlock 的“查看更多”触发一次新的 chat/tool 请求。
- 请求参数带 `page/pageSize/sourceTool`。
- 后端重新鉴权后查询下一页。

验收：

- 大列表不一次性灌入前端。
- 翻页不绕过权限。

### 2. 下载 CSV

实现：

- 前端只下载当前可见 rows。
- 如需全量下载，必须走后端导出接口，不能从 LLM 上下文获取。

验收：

- 当前页 CSV 正确。
- 敏感字段保持脱敏。

### 3. 行级操作

示例：

- 给某用户分配角色。
- 基于某分析继续追问。
- 打开对应系统页面。

实现：

- `actions` 仅允许白名单 action key。
- 前端点击后转成新的用户消息或打开已有路由。

验收：

- 不执行任意模型生成的 JS/URL。

## 测试计划

### 后端单测

新增：

- `packages/mcp-server/src/chat/__tests__/message-blocks.test.ts`

覆盖：

- 邮箱脱敏。
- 手机号脱敏。
- table block schema。
- `__blocks__` 从工具结果中剥离。

修改：

- `stream.ts` 相关测试如已有 SSE 测试，则补 `message_block`。

### 前端单测/类型检查

覆盖：

- `useChatStream` 收到 `message_block` 后写入 `state.blocks`。
- `TableBlock` 空数据、敏感字段、折叠、复制。
- `MessageItem` blocks 渲染。

命令：

```bash
pnpm test
pnpm checkTs
```

如果前端仓库当前 `checkTs` 仍受第三方类型影响，需要记录实际失败并至少用局部测试覆盖变更组件。

### 手工验收

场景：

1. 问：“当前组织有哪些用户？”
2. 观察：
   - `tool_start`: `dataeye_user_list`
   - `message_block`: `type=table`
   - 正文只总结，不逐条重复。
   - 前端显示表格。
3. 检查敏感字段：
   - 邮箱脱敏。
   - 手机号脱敏。
   - 不出现完整 userId。
4. 问：“有哪些自助分析？”
   - P1 后应表格化。
5. 跑一个现有图表问题：
   - 图表仍正常。

## 实施顺序

1. 后端 `message-blocks.ts` 类型和 helper。
2. `stream.ts` 拦截 `__blocks__` 并发送 `message_block`。
3. `dataeye-user-list.ts` 返回 summary + table block。
4. 前端 `useChatStream` 增加 `blocks`。
5. 前端 `TableBlock` / `MessageBlocks`。
6. `MessageItem` 接入 blocks。
7. 补单测和手工验收。

## 回滚方案

- 后端不返回 `__blocks__`，前端即不会进入结构化渲染。
- `message_block` 前端未知时忽略，不影响文本回复。
- `chart_data` 保留，图表能力不依赖新协议。
