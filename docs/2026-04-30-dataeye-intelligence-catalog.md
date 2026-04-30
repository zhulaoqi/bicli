# DataEye Intelligence Catalog

> 目的：把 DataEye 后端接口、前端页面流程、BiCLI MCP 工具与 Skill 工作流放到同一张地图里，作为后续持续沉淀业务动作和页面上下文的基准。

## 1. 后端业务域索引

DataEye 后端是 Spring Boot 多模块，典型链路为 `Controller -> Service -> Mapper -> DB`。核心 Web 入口集中在 `dataeye/server/src/main/java/com/funsdata/server/tenant/controller/`，公共响应壳为 `RestResult`。

| 业务域 | 后端入口 | 读写属性 | 关键约束 | 建议 MCP/Skill 沉淀 |
| --- | --- | --- | --- | --- |
| BiCLI 鉴权桥接 | `BicliAuthController.java`，`/bicli/auth/*` | 只读 | 需要 JWT，返回 identity、permissions、datasources | MCP resource：当前用户、权限、数据源上下文 |
| 用户管理 | `sysmanage/TenantUserController.java`，`/tenant/user/*` | 读写 | 用户邮箱唯一、组织上下文、角色/用户组绑定 | `dataeye_user_onboard`、用户诊断 Skill |
| 角色管理 | `sysmanage/TenantRoleController.java`，`/tenant/role/*` | 读写 | 权限、项目/产品范围、角色名唯一 | 角色创建/授权业务动作 |
| 项目管理 | `ProjectController.java`，`/project/*` | 读写 | 租户内项目名重复校验 | 项目/产品上下文发现 Skill |
| 产品管理 | `datamanage/ProductController.java`，`/product/*` | 读写 | 产品标识、第三方 token 唯一性 | 产品切换、产品诊断 Skill |
| 事件管理 | `datamanage/BiEventManageController.java`，`/eventManage/*` | 读写 | 必须 productId，名称/别名长度，虚拟事件指标校验 | 事件创建/编辑/启停业务动作 |
| 事件分析 | `EventQueryController.java`，`/my-query-event/*` | 只读/导出 | 参数来自保存分析 `prp` 与表字段合并 | 保存分析执行业务动作 |
| 留存分析 | `RetentionAnalysisQueryController.java`，`/my-query-retention/*` | 只读/导出 | 项目/产品权限不足时返回明确错误 | 留存分析执行 Skill |
| 漏斗分析 | `FunnelAnalysisController.java`，`/funnel-analysis/*` | 只读/导出 | 与事件步骤、窗口期、产品上下文强相关 | 漏斗分析执行 Skill |
| 数据表管理 | `BiDataSourceController.java`，`/biDataSource/*` | 读写/上传 | 文件大小、字段类型、表名、`upload_` 长度等校验 | `dataeye_table_import_create`、文件建表 Skill |
| 数据表元数据 | `BiDwsTableController.java`，`/biDwsTable/*` | 只读 | 数据仓库表、字段和权限 | 数据表查询/字段解释 Skill |
| SQL 编辑器 | `SqlEditorController.java`，`/sql-editor/*` | 只读/写模板 | SQL 安全、数据源、导出 | SQL 查询/模板管理 Skill |
| 埋点标准文件 | `EventCriteriaFileController.java`，`/eventCriteriaFile/*` | 上传/管理 | 文件上传与 productId 绑定 | 埋点标准导入 Skill |

## 2. 前端页面与 API 索引

DataEye 前端存在两套请求通道：

- `src/utils/request.tsx` 的 `request2`：默认 `BASE_API_URL=/api/v1`，Authorization 直接传 token。
- `src/utils/request.tsx` 的 `instanceApi`：默认 `/api`，Authorization 使用 `Bearer`，并附带 `Code` 与 `browser-path`。

| 业务域 | 页面/模块 | API 封装 | 可反推工作流 |
| --- | --- | --- | --- |
| 用户/角色 | `MainPage/pages/System/User/`、`System/Role/` | `System/slice/api.ts` | 新增成员、创建角色、分配角色、权限诊断 |
| 项目/产品 | `MainPage/pages/Config/Product/` | `Config/Product/slice/api.ts` | 查项目/产品、切换上下文、解释无权限 |
| 事件管理 | `MainPage/pages/Config/Event/` | `Config/Event/slice/api.ts` | 创建事件、编辑事件、启停事件、SQL 检查 |
| 数据表管理 | `MainPage/pages/Config/Table/` | `Config/Table/slice/api.ts` | 文件预览、字段推断、建表、状态管理 |
| 自助 SQL | `MainPage/pages/DataAnalysis/SelfSql/` | `DataAnalysis/SelfSql/slice/api.ts` | SQL 查询、导出、模板管理 |
| 自助分析 | `DataAnalysis/Event/`、`Funnel/`、`Retention/`、`MyAnalysis/` | 各目录 `slice/api.ts` | 保存分析列表、参数恢复、执行和导出 |
| 可视化资产 | `VizPage`、`ViewPage`、`SourcePage`、`SchedulePage` | 各页面 slice/thunk | 看板执行、分享、下载、定时任务 |
| BiCLI 嵌入 | `MainPage/Layout/BiCLIPanel.tsx` | `BiCLIWorkbench/api.ts`、`useChatStream.ts` | 当前页问答、工具调用、页面上下文注入 |

## 3. BiCLI 智能层索引

| 层级 | 关键文件 | 当前状态 | 后续建议 |
| --- | --- | --- | --- |
| 工具注册 | `packages/mcp-server/src/tools/tool-domain-registry.ts` | MCP 与 `/chat` 已共用同一 registry | 增加 catalog 输出和覆盖率检查 |
| MCP 协议 | `packages/mcp-server/src/tools/register.ts` | `ListTools` / `CallTool` 使用统一 registry | 保持审计与权限元信息一致 |
| 聊天编排 | `packages/mcp-server/src/http-server.ts` | `/chat/stream` 注入 system prompt、Skill、pageContext、工具 | 减少旧 `/chat` prompt 分叉 |
| 流式执行 | `packages/mcp-server/src/chat/stream.ts` | 支持 `tool_start`、`tool_result`、`message_block`、`chart_data` | 增加 SSE 契约测试 |
| Skill 路由 | `packages/mcp-server/src/chat/skill-routing.ts` | 已支持帮助 Skill 和部分业务 Skill | 从硬编码准入演进为 manifest |
| 页面上下文 | `packages/mcp-server/src/chat/page-context.ts` | 接收并清洗前端 pageContext | 引入按页面类型的 context adapter |
| Skill 定义 | `packages/skills/definitions/` | 已有用户、数据表、分析、看板等 Skill | 增加业务域 README/manifest 与契约测试 |

## 4. 当前 MCP 资源和业务动作清单

### Business Actions

| 工具 | 业务域 | 能力 | 验证点 |
| --- | --- | --- | --- |
| `dataeye_user_onboard` | 用户与角色 | 重复校验、角色校验、dryRun、创建、角色验证 | 用户存在且请求角色已绑定 |
| `dataeye_table_import_create` | 数据表管理 | 样例字段推断、表名校验、dryRun、建表 | 明确说明未接入文件数据导入 |
| `dataeye_dashboard_execute` | 看板/图表 | 读取看板详情，逐图表执行并汇总 | 成功/失败/空数据按图表说明 |

### 已补齐的契约缺口

| Skill | 缺失工具 | 处理 |
| --- | --- | --- |
| `dataeye-share` | `dataeye_share_list` | 新增分享列表 MCP 工具 |
| `dataeye-download` | `dataeye_download_submit`、`dataeye_download_task_list` | 新增下载提交和任务列表 MCP 工具 |

## 5. 沉淀原则

1. 后端接口只代表能力，不直接等同于给模型暴露的工具。
2. 前端页面里的成熟流程优先反推成 Skill workflow。
3. 多步写操作必须沉淀为 Business Action，包含 dryRun、确认语义、执行和验证。
4. Skill 的 `requiredTools` 必须能在 MCP registry 中找到。
5. 页面上下文只传结构化摘要和 resource id，不传全量大数据。
