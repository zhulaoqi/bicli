# BiCLI 业务动作 MCP 注册与 Skill 体系设计

日期：2026-04-30

范围：

- `bicli/packages/mcp-server/src/tools`
- `bicli/packages/mcp-server/src/tools/register.ts`
- `bicli/packages/mcp-server/src/http-server.ts`
- `bicli/packages/skills/definitions`
- `bicli/packages/mcp-server/src/chat/system-prompt.ts`

## 1. 背景

当前 BiCLI 已经接入了大量 DataEye 能力：用户、角色、项目、数据表、自助分析、可视化资产等。工具粒度大多按后端 API 暴露，模型需要自己判断业务流程并多次调用工具。

这带来三个问题：

- 模型容易把业务对象 ID 混用，例如把看板 ID 当成图表查询的 `viewId`。
- 写操作缺少统一的预览、确认、验证闭环，例如创建用户后还需要分配角色。
- Skill 与 MCP 注册不是同一套业务语义，旧通用工具和 DataEye 专用工具并存，模型可能选择错误链路。

因此需要从“接口工具注册”升级为“业务动作注册”：MCP 工具按照用户要完成的业务结果设计，Skill 按业务场景指导模型何时调用、如何补齐信息、如何确认风险。

## 2. 设计目标

### 2.1 面向业务动作，而不是面向 API

用户说“创建用户”，实际期望通常是：

1. 检查用户是否已存在。
2. 获取可分配角色。
3. 创建用户。
4. 分配角色。
5. 验证创建结果。

这应抽象成一个业务动作工具，而不是让模型临时拼 `user_list + role_list + user_create + assign_role`。

### 2.2 原子工具保留，但降低模型直接使用优先级

原子工具仍然需要存在，用于：

- 业务动作工具内部复用。
- 高级用户明确要求执行某个低层操作。
- 调试、补救、局部查询。

但在工具描述和 Skill 里，默认优先推荐业务动作工具。

### 2.3 Skill 按工作流编写

Skill 不是 API 目录。每个 Skill 应回答：

- 这个业务场景何时触发？
- 必须收集哪些信息？
- 哪些步骤可以自动完成？
- 哪些写操作必须预览和确认？
- 失败后应该怎么恢复？

### 2.4 写操作统一安全策略

业务动作工具必须默认支持以下能力：

- `dryRun` 或 `confirm=false` 预览。
- 明确列出将要修改的对象。
- 用户确认后再执行真实写入。
- 执行后用查询工具验证结果。
- 对覆盖、删除、权限扩大等风险做二次确认。

## 3. 分层架构

### 3.1 工具层级

| 层级 | 说明 | 示例 |
| --- | --- | --- |
| 原子查询工具 | 只读取或查询单类资源 | `dataeye_role_list`、`dataeye_table_list` |
| 原子写工具 | 单个后端写接口封装 | `dataeye_user_create`、`dataeye_table_create` |
| 业务动作工具 | 面向用户目标的多步骤编排 | `dataeye_user_onboard`、`dataeye_dashboard_execute` |
| Skill | 指导模型选择业务动作、补齐信息、处理异常 | `dataeye-user-role-management` |

### 3.2 注册层级

注册入口应从“平铺数组”改为“业务域注册表”：

```ts
const toolDomains = [
  userRoleDomain,
  tableManagementDomain,
  analysisDomain,
  visualizationDomain,
];
```

每个业务域声明：

- `domain`: 业务域名称。
- `enabled`: 是否启用。
- `tools`: 工具定义列表。
- `preferredTools`: 模型优先使用的业务动作工具。
- `advancedTools`: 原子工具，必要时使用。
- `internalTools`: 不暴露给模型，只供内部编排。

### 3.3 Skill 与工具关系

Skill 应绑定业务动作工具，而不是绑定一串接口工具。

例如用户创建与授权：

- 首选工具：`dataeye_user_onboard`
- 辅助工具：`dataeye_role_list`、`dataeye_user_list`
- 不推荐模型直接编排：`dataeye_user_create` + `dataeye_user_assign_role`

## 4. P0 业务动作

### 4.1 用户创建与授权：`dataeye_user_onboard`

触发场景：

- 创建用户
- 新增成员
- 开通账号
- 给新同事分配角色

输入：

- `email`
- `username`
- `roleIdList` 或 `roleNameKeywords`
- `phone`
- `orgAuthFlag`
- `dryRun`

执行逻辑：

1. 校验邮箱和用户名。
2. 调用用户查询检查是否已存在。
3. 查询角色并解析用户指定的角色。
4. `dryRun=true` 时返回待执行计划。
5. `dryRun=false` 时创建用户并绑定角色。
6. 查询用户确认创建成功和角色生效。

输出：

- 创建状态。
- 用户 ID。
- 已绑定角色。
- 验证结果。
- 如果失败，返回下一步补救建议。

### 4.2 文件上传建表与导入：`dataeye_table_import_create`

触发场景：

- 上传文件建表
- 把 Excel/CSV 导入成数据表
- 根据文件创建表并导入数据

输入：

- `fileId` 或上传后的文件引用。
- `projectId`
- `tableName`
- `remark`
- `ctType`
- `fieldMappings`
- `dryRun`

执行逻辑：

1. 读取上传文件元信息和样例数据。
2. 推断字段名、字段类型、主键建议。
3. 校验项目和表名。
4. `dryRun=true` 返回建表和导入预览。
5. `dryRun=false` 创建数据表。
6. 上传或写入文件数据。
7. 查询表详情和导入结果验证。

边界：

- 文件解析和数据上传如果后端暂未提供接口，P0 可先实现“建表预览 + 建表”，将“数据导入”标记为明确待接入接口，不能假装已导入。
- 字段类型推断必须可被用户覆盖。
- 大文件需要只取样例推断，不能把全量数据放入模型上下文。

### 4.3 看板真实数据执行：`dataeye_dashboard_execute`

已初步实现。它代表业务动作工具模式：

1. 输入看板 ID。
2. 内部读取看板详情。
3. 对看板内图表逐个执行。
4. 汇总成功、失败、空数据结果。

后续应把它纳入 `visualizationDomain`，并在 Skill 中标记为看板真实数据的首选工具。

## 5. 注册策略

### 5.1 暴露策略

默认暴露：

- 查询型原子工具。
- 业务动作工具。

谨慎暴露：

- 单步写工具。
- 删除、覆盖、权限扩大工具。

内部使用：

- 业务动作工具依赖的低层 helper。
- 不希望模型直接调用的危险写操作。

### 5.2 工具描述策略

工具描述必须包含：

- 适用业务场景。
- 不适用场景。
- 是否写操作。
- 是否需要用户确认。
- 如果存在业务动作工具，应提示优先使用业务动作工具。

例如 `dataeye_user_create`：

> 单步创建用户。完整新增成员流程请优先使用 `dataeye_user_onboard`，该工具会处理角色选择、重复校验和结果验证。

## 6. Skill 设计原则

### 6.1 Skill 命名

Skill 名称应使用业务域：

- `dataeye-user-onboarding`
- `dataeye-table-import`
- `dataeye-dashboard-analysis`
- `dataeye-self-analysis`

避免用接口名或内部服务名命名。

### 6.2 Skill 内容结构

每个 Skill 建议包含：

1. 何时触发。
2. 首选业务动作工具。
3. 必填信息收集表。
4. dryRun / 确认规则。
5. 成功输出格式。
6. 失败恢复策略。
7. 禁止事项。

### 6.3 与系统提示词边界

系统提示词只保留全局原则：

- 不编造数据。
- 写操作需确认。
- 业务动作优先。

具体业务流程放入 Skill，避免系统提示词变成巨型流程手册。

## 7. 验收标准

### 7.1 用户创建场景

用户说“帮我创建一个用户并分配数据分析师角色”时：

- 模型优先使用 `dataeye_user_onboard`。
- 如果缺少邮箱或用户名，先询问缺失信息。
- 如果角色模糊，查询角色并让用户选择。
- 写入前返回预览。
- 用户确认后执行并验证。

### 7.2 文件建表场景

用户上传文件并说“帮我建一张表”时：

- 模型识别为文件导入建表流程。
- 不直接要求用户手写完整字段 JSON。
- 自动读取样例并推断字段。
- 让用户确认表名、项目、字段类型。
- 只在确认后创建和导入。

### 7.3 看板查询场景

用户说“分析这个看板真实数据”时：

- 模型优先调用 `dataeye_dashboard_execute`。
- 不把 `dashboardId` 传给单图表执行工具。
- 输出按图表汇总真实结果。

## 8. 风险与边界

- 业务动作工具会变大，必须拆 helper 并补测试。
- dryRun 需要和真实执行复用同一套计划生成逻辑，否则预览和实际执行可能不一致。
- 文件上传导入依赖后端现有接口，需要先确认可用接口；没有接口时只能明确返回“暂不支持导入执行”。
- 旧 Skill 和新 Skill 可能同时触发，需要清理或重定向旧 Skill。
- MCP 注册在 `register.ts` 和 `/chat` 延迟映射中存在重复维护，重构时必须一次性统一，否则会出现某入口可用、另一入口不可用。
