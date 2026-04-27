# DataEye AI 助手增强设计文档

**日期**：2026-04-16  
**版本**：v1.0  
**状态**：待实施

---

## 1. 背景与目标

### 1.1 背景

BiCLI 已完成与 DataEye 系统的基础集成（JWT 透传、8 个只读 MCP 工具、2 个 Skill），但存在以下核心问题：

1. **LLM 不理解 DataEye 权限体系**：不知道组织→角色→项目→产品的可见性规则，遇到接口返回空或权限拒绝时会给出错误诊断
2. **只有读操作，没有写操作**：用户无法通过 AI 创建事件、管理属性、新建数据表
3. **缺乏写操作的人工确认机制**：危险操作（创建/修改/删除）需要二次确认再执行

### 1.2 目标

构建一个能够真正"做事"的 DataEye AI 助手，具备：
- 准确理解用户权限范围，不乱猜、不给错误诊断
- 通过自然语言创建/管理事件定义和数据表
- 敏感操作执行前展示预览，用户确认后再执行
- 可扩展的工具和 Skill 体系，后续功能可持续叠加

---

## 2. 系统现状

### 2.1 已有 MCP 工具（8 个，仅读）

| 工具 | 代理接口 |
|---|---|
| `dataeye_project_list` | GET /api/tenant/project/list/user |
| `dataeye_event_list` | POST /api/eventManage/event/page |
| `dataeye_event_property` | GET /api/eventManage/event/property/nopage |
| `dataeye_table_list` | GET /api/biDataSource/pageByBiDataSource |
| `dataeye_table_detail` | GET /api/biDataSource/getByBiDataSource |
| `dataeye_dws_table` | GET /api/biDwsTable/listDwsTable |
| `dataeye_datasource_list` | GET /api/bicli/auth/datasources |
| `dataeye_sql_query` | POST /api/biDataSource/listDetailByTableName |

### 2.2 已有 Skill（2 个）

- `dataeye-event-explore`：探索事件体系流程
- `dataeye-data-query`：自然语言转 SQL

### 2.3 已知 Bug（本期修复）

- 所有 dataeye 工具错误地配置了 BiCLI 内部权限检查（`data:read`/`event:read` 等），已修复为空列表 `[]`
- `rbac.ts#extractContext` 用 BiCLI 本地 JWT secret 验证 dataeye 的 token，已修复为优先信任 PermissionAdapter 已解析的身份

---

## 3. DataEye 权限体系（LLM 知识基础）

### 3.1 数据层级

```
Platform（平台）
  └── Organization（组织，type=tenant）
        ├── rel_org_user → 用户属于哪个组织
        ├── rel_role_user → 用户的角色
        └── Project（项目，org_id 关联）
              └── Product（产品，project_id 关联）
                    ├── bi_event_schema（事件定义）
                    ├── bi_event_schema_property（事件属性）
                    └── bi_data_source（数据表，project 级别）
```

### 3.2 数据访问控制（三级）

```
角色 (rel_role_user)
  └── 项目权限 (rel_role_project)
        ├── all_product = 1 → 该项目下所有产品可见
        └── all_product = 0 → 只有 rel_role_product 中明确授权的产品可见
```

**关键规则**：
- 事件、属性、数据表的可见性由"能否访问其所属产品/项目"决定，不存在独立的事件权限
- 用户看不到任何项目 → 角色未绑定项目（`rel_role_project` 无记录）
- 用户看不到某产品 → `rel_role_project.all_product=0` 且该产品不在 `rel_role_product` 中
- `permission` 表是**功能权限**（菜单/按钮级别），与数据可见性是两套体系

### 3.3 正确导航顺序

```
1. dataeye_project_list(type="project")  →  获取可见项目列表
2. dataeye_project_list(type="product", projectId=xxx)  →  获取该项目下可见产品
3. dataeye_event_list(productId=xxx)  →  获取该产品下的事件
4. 操作事件/数据表
```

跳过任何一步直接调用下游工具必然缺少必要 ID，导致参数错误。

### 3.4 常见错误诊断

| 现象 | 真实原因 | 错误诊断（应避免） |
|---|---|---|
| 项目列表为空 | 角色未绑定任何项目 | "权限配置异常，请联系管理员" |
| 产品列表为空 | all_product=0 且无产品授权 | "API 故障" |
| 事件列表为空 | 该产品无事件定义 | "无权访问" |
| SQL 查询报错 | sourceId 不正确或表不存在 | "权限不足" |

---

## 4. 新增 MCP 工具设计（14 个）

### 4.1 设计原则

1. **dryRun 模式**：所有写操作工具支持 `dryRun` 参数，为 true 时只返回将要执行的参数预览，不调 DataEye 接口。各工具默认值见第 6.2 节。
2. **权限透传**：所有工具继承 `[]` 空权限列表（BiCLI 不做权限检查，由 DataEye 后端自行鉴权）
3. **参数最小化**：LLM 常用的核心参数必填，高级参数可选带默认值
4. **调用方式说明**：部分 Spring 接口无 `@RequestBody`，参数通过 query string / form 传递，`dateyeRequest` 需相应处理（`method: 'POST', params: {...}` 而非 `body: {...}`）
5. **错误处理原则**：
   - DataEye 返回 `code != 200` → 解析 `message` 字段，以用户友好方式展示给 LLM，由 LLM 转述
   - 网络超时 → 提示"DataEye 服务暂时无响应，请稍后重试"
   - 写操作半成功（事件创建成功但属性创建失败）→ 工具返回部分成功信息，LLM 告知用户哪一步成功、哪一步失败，并提供继续完成的建议
6. **事件名重复处理**：dataeye 后端在事件名重复时会返回业务错误，LLM 应识别该错误并建议用户换一个名称或查看现有事件。暂无预校验接口（不同于表名有专用校验接口）。

### 4.2 事件管理工具（7 个）

#### `dataeye_event_create`
- **接口**：`POST /api/eventManage/event/add`
- **语义说明**：该接口创建"虚拟事件"（对已采集事件进行组合/过滤形成新视图），不是创建原始埋点。原始埋点由 SDK 上报后自动生成，AI 无法通过接口创建。
- **参数**（对应 `EventAddDto`）：
  ```typescript
  {
    productId: number;           // 必填
    eventName: string;           // 必填，虚拟事件英文名
    eventAlias?: string;         // 可选，展示名（非 displayName）
    description?: string;        // 可选
    eventGroupId?: number;       // 可选，所属分组 ID（非 groupId）
    indexInfos: Array<{          // 必填，引用的基础事件列表（至少1个）
      eventName: string;
      filter?: object;
    }>;
    dryRun?: boolean;            // 默认 false
  }
  ```

#### `dataeye_event_update`
- **接口**：`POST /api/eventManage/event/edit`
- **参数**（对应 `EventEditDto`）：
  ```typescript
  {
    eventId: number;             // 必填（非 id）
    productId: number;           // 必填（之前版本遗漏）
    eventAlias?: string;         // 展示名（非 displayName）
    description?: string;
    eventGroupId?: number;
    dryRun?: boolean;            // 默认 true（修改操作需确认）
  }
  ```

#### `dataeye_event_status`
- **接口**：`POST /api/eventManage/event/changeStatus`
- **调用方式**：form 参数（非 JSON body，接口无 `@RequestBody`）
- **参数**：`{ id: number; status: 0 | 1; dryRun?: boolean }`
- **注意**：status=0 为停用（破坏性操作），dryRun **默认 true**，需用户显式确认后传 false

#### `dataeye_event_property_save`
- **接口**：`POST /api/eventManage/event/property/customize/saveOrUpdate`
- **参数**（对应 `EventPropertySaveDto`）：
  ```typescript
  {
    productId: number;           // 必填
    propertyName: string;        // 必填，属性英文名
    propertyAlias?: string;      // 展示名（非 displayName）
    dataType: 'string' | 'number' | 'datetime' | 'boolean' | 'list';
    description?: string;
    saveType: 1 | 3;             // 必填：1=事件属性，3=用户属性
    productEventIds?: number[];  // 关联的事件 ID 列表（非 eventIds）
    dryRun?: boolean;            // 默认 false（创建属性）/ true（修改属性）
  }
  ```
- **重要**：创建属性后，如需关联到具体事件，`productEventIds` 需传入事件创建后返回的 eventId。

#### `dataeye_event_group_list`
- **接口**：`GET /api/biEventGroup/eventGroup/list`
- **参数**：`{ productId: number }`
- **说明**：创建事件前调用，获取可用分组列表

#### `dataeye_event_group_add`
- **接口**：`POST /api/biEventGroup/eventGroup/add`
- **参数**：`{ productId: number; name: string; dryRun?: boolean }`
- **约束**：分组名最长 10 字符；名称不可为 "未分组" 或 "Ungrouped"
- **dryRun**：默认 false

#### `dataeye_event_analysis`
- **接口**：`POST /api/my-query-event/report`
- **说明**：AI 问数 2.0，支持事件趋势/对比/分布分析
- **核心参数骨架**（`EventAnalysisQuery` 关键字段）：
  ```typescript
  {
    productId: number;           // 必填
    appId: string;               // 必填，产品 appId（从产品详情获取）
    startDate: string;           // 必填，格式 YYYY-MM-DD
    endDate: string;             // 必填
    type: 'event' | 'funnel' | 'retention'; // 分析类型
    measures: Array<{            // 指标（至少1个）
      eventName: string;
      aggregation: 'count' | 'user_count' | 'sum' | 'avg';
      propertyName?: string;     // aggregation=sum/avg 时必填
    }>;
    groupBy?: Array<{            // 分组维度（可选）
      propertyName: string;
    }>;
    filters?: Array<{            // 过滤条件（可选）
      propertyName: string;
      operator: 'eq' | 'ne' | 'in' | 'gt' | 'lt';
      values: string[];
    }>;
    timeUnit?: 'day' | 'week' | 'month'; // 时间粒度，默认 day
  }
  ```

### 4.3 数据表管理工具（3 个）

> `dataeye_table_upload_preview` 涉及文件上传，移入后续迭代（见第 9 节）。

#### `dataeye_table_create`
- **接口**：`POST /api/biDataSource/createTable`（非 saveOrUpdate，该接口才真正在 StarRocks 执行 DDL）
- **参数**（对应 `BiDataSourceDto`）：
  ```typescript
  {
    projectId: number;       // 必填
    tableName: string;       // 必填，StarRocks 表名（建表前调 validate_name 校验）
    remark?: string;
    ctType: 1 | 3;           // 必填：1=DUPLICATE KEY（日志/事件表，允许重复），3=PRIMARY KEY（主键唯一，支持更新）
    fields: Array<{
      fieldName: string;     // 字段中文名/备注
      identifier: string;    // 字段英文标识（StarRocks 列名）
      dataType: '1' | '2' | '3';  // 1=datetime, 2=varchar, 3=number
      primaryKey?: boolean;
      remark?: string;
    }>;
    dryRun?: boolean;        // 默认 false
  }
  ```
- **建表前必须先调 `dataeye_table_validate_name` 校验表名唯一性**

#### `dataeye_table_validate_name`
- **接口**：`POST /api/biDataSource/validateTableName`
- **参数**：`{ tableName: string; projectId: number }`
- **说明**：创建表前调用，表名重复则 LLM 应提示用户修改

#### `dataeye_table_update_status`
- **接口**：`GET /api/biDataSource/updateStatus`
- **参数**：`{ id: number; status: 'ACTIVE' | 'PAUSE' | 'DELETE'; dryRun?: boolean }`  
  （注意是 `ACTIVE` 非 `ACTIVA`）
- **dryRun**：PAUSE 默认 true，DELETE 强制需用户传 false 确认，ACTIVE 默认 false

### 4.4 组织视角工具（3 个）

#### `dataeye_user_list`
- **接口**：`POST /api/tenant/user/page`
- **参数**：`{ page?: number; pageSize?: number; keyword?: string }`
- **用途**：权限诊断时查看组织成员

#### `dataeye_role_list`
- **接口**：`GET /api/tenant/role/list/all`
- **参数**：无
- **用途**：查看组织角色配置，辅助权限诊断

#### `dataeye_product_create`
- **接口**：`POST /api/tenant/product/create`
- **调用方式**：form 参数（无 `@RequestBody`，非 JSON body）
- **参数**（对应 `ProductCreateParam`，`@Validated` 校验）：
  ```typescript
  {
    projectId: number;   // 必填
    name: string;        // 必填，产品名称
    pkg: string;         // 必填，包名/标识符（如 com.example.app）
    dryRun?: boolean;    // 默认 true（创建产品影响较大）
  }
  ```

---

## 5. Skill 设计（4 个）

### 5.1 `dataeye-permissions`（新建，知识型）

**目的**：给 LLM 注入 DataEye 权限体系知识，避免错误诊断

**内容要点**：
- 权限层级图（组织→角色→项目→产品）
- `rel_role_project.all_product` 标志的含义
- 正确的导航路径（项目→产品→事件/数据表）
- 常见错误现象和正确解释
- 不要说"权限配置异常"，要说"您的角色当前未绑定该项目访问权限"

**触发器**：`权限`, `看不到`, `没有权限`, `访问被拒`, `列表为空`, `项目为空`

### 5.2 `dataeye-event-management`（新建，流程型）

**目的**：引导 LLM 完成创建/管理虚拟事件、属性的完整流程，包含确认机制

**重要说明**：原始埋点由 SDK 上报自动生成，AI 创建的是"虚拟事件"（对已采集事件的组合/过滤）。

**流程**：
```
1. 确定目标产品（dataeye_project_list → 选项目 → 选产品）
2. 了解用户意图（创建虚拟事件 / 修改现有事件 / 新增属性）
3. 收集必要信息（事件名、引用的基础事件、属性列表等）
4. 可选：dataeye_event_group_list 获取分组供用户选择
5. dryRun=true 预览（展示将要执行的操作）
6. 等待用户确认（回复"确认"/"是"/"OK" 才执行）
7. 执行 dataeye_event_create(dryRun=false)，从返回结果中取 eventId
8. 若需关联属性：用步骤7的 eventId 填充 productEventIds 调用 dataeye_event_property_save
9. 报告完整结果
```

**触发器**：`创建事件`, `新增事件`, `添加埋点`, `修改事件`, `管理属性`

### 5.3 `dataeye-table-management`（新建，流程型）

**目的**：引导创建/管理数据表，包含表名校验和字段定义

**流程**：
```
1. 确定目标项目（dataeye_project_list → 选项目）
2. 收集表信息（表名、用途、字段列表）
3. 校验表名（dataeye_table_validate_name，名称重复则提示修改）
4. dryRun 预览字段结构
5. 用户确认 → 执行创建
```

**触发器**：`创建数据表`, `新建表`, `添加字段`, `数据管理`, `表结构`

### 5.4 `dataeye-event-analysis`（新建，流程型）

**目的**：基于 `/my-query-event/report` 做更高层的事件分析

**分析类型**：
- 趋势分析：某事件随时间的变化趋势
- 对比分析：多个事件或多个维度的对比
- 漏斗分析：用户行为转化路径
- 分布分析：某属性值的分布情况

**触发器**：`趋势`, `对比`, `漏斗`, `分析`, `转化率`, `用户行为`

### 5.5 `dataeye-event-explore`（更新）

**变更**：
- 移除 `requiredPermissions: [event:read, data:read]`（这些权限检查已不存在）
- 添加权限导航规则（引用 dataeye-permissions Skill 的核心知识）
- 完善错误处理：遇到空列表时给出正确诊断

### 5.6 `dataeye-data-query`（更新）

**变更**：
- 移除 `requiredPermissions: [table:read, sql:execute]`
- 在工作流程第一步前增加：调用 `dataeye_project_list` 确认用户有可访问的项目，若空列表则输出权限导航诊断（参考 dataeye-permissions Skill）
- 增加错误处理说明：sourceId 错误时的用户友好提示

---

## 6. dryRun 确认机制

### 6.1 交互流程

```
用户: 帮我在「抖音短剧」产品下创建一个事件 user_login，
      属性有 platform(string) 和 channel(string)

AI (内部执行):
  步骤1: dataeye_project_list → 找到产品 id=1234
  步骤2: dataeye_event_group_list(productId=1234) → 获取分组
  步骤3: dataeye_event_create(dryRun=true) → 返回预览

AI (输出给用户):
  ┌─────────────────────────────────┐
  │ 📋 即将执行以下操作              │
  │                                 │
  │ 创建事件                         │
  │ • 产品: 抖音短剧 (id: 1234)      │
  │ • 事件名: user_login            │
  │ • 展示名: 用户登录               │
  │                                 │
  │ 同时创建 2 个属性                │
  │ • platform (string) — 平台标识   │
  │ • channel (string) — 来源渠道    │
  │                                 │
  │ 确认执行？回复「确认」或告诉我    │
  │ 需要修改的地方                   │
  └─────────────────────────────────┘

用户: 确认

AI (执行):
  dataeye_event_create(dryRun=false) → 成功
  dataeye_event_property_save × 2 → 成功

AI (输出):
  ✅ 事件 user_login 创建成功（id: 5678）
  ✅ 属性 platform 已关联
  ✅ 属性 channel 已关联
```

### 6.2 破坏性操作的特殊处理

| 操作 | dryRun 默认值 | 额外提示 |
|---|---|---|
| 创建事件/属性 | false（直接执行） | 无 |
| 修改事件/属性 | true（需确认） | 展示修改前后对比 |
| 停用事件 | true（需确认） | 提示"停用后分析报表中该事件数据不可见" |
| 删除/停用数据表 | true（需确认） | 提示"操作不可逆，确认前请再次核实" |

---

## 7. 实施分层

### 第一层：知识基础（必须先完成）

| 任务 | 产出 |
|---|---|
| 修复已知 Bug（权限检查、JWT 验证） | 已完成 ✅ |
| 创建 `dataeye-permissions` Skill | `packages/skills/definitions/dataeye-permissions/SKILL.md` |
| 更新 `dataeye-event-explore` Skill | 移除错误权限要求，加导航规则 |
| 更新 `dataeye-data-query` Skill | 加权限导航规则 |

### 第二层：写操作工具

| 任务 | 文件 |
|---|---|
| `dataeye_event_create` | `packages/mcp-server/src/tools/dataeye-event-create.ts` |
| `dataeye_event_update` | `packages/mcp-server/src/tools/dataeye-event-update.ts` |
| `dataeye_event_status` | `packages/mcp-server/src/tools/dataeye-event-status.ts` |
| `dataeye_event_property_save` | `packages/mcp-server/src/tools/dataeye-event-property-save.ts` |
| `dataeye_event_group_list` | `packages/mcp-server/src/tools/dataeye-event-group-list.ts` |
| `dataeye_event_group_add` | `packages/mcp-server/src/tools/dataeye-event-group-add.ts` |
| `dataeye_event_analysis` | `packages/mcp-server/src/tools/dataeye-event-analysis.ts` |
| `dataeye_table_create` | `packages/mcp-server/src/tools/dataeye-table-create.ts` |
| `dataeye_table_validate_name` | `packages/mcp-server/src/tools/dataeye-table-validate-name.ts` |
| `dataeye_table_update_status` | `packages/mcp-server/src/tools/dataeye-table-update-status.ts` |
| `dataeye_user_list` | `packages/mcp-server/src/tools/dataeye-user-list.ts` |
| `dataeye_role_list` | `packages/mcp-server/src/tools/dataeye-role-list.ts` |
| `dataeye_product_create` | `packages/mcp-server/src/tools/dataeye-product-create.ts` |
| 注册所有新工具到 `register.ts` 和 `http-server.ts` | 更新注册文件 |

> `dataeye_table_upload_preview` 涉及文件上传，移入第 9 节后续迭代。

### 第三层：Skill 编排

| 任务 | 文件 |
|---|---|
| 创建 `dataeye-event-management` Skill | `packages/skills/definitions/dataeye-event-management/SKILL.md` |
| 创建 `dataeye-table-management` Skill | `packages/skills/definitions/dataeye-table-management/SKILL.md` |
| 创建 `dataeye-event-analysis` Skill | `packages/skills/definitions/dataeye-event-analysis/SKILL.md` |

---

## 8. 成功验收标准

### 第一层
- [ ] LLM 遇到"项目列表为空"时，输出正确诊断（角色未绑定项目），不说"权限配置异常"
- [ ] 已有 8 个读工具均可正常调用（token 透传正常）

### 第二层
- [ ] 通过自然语言成功创建一个事件（含 dryRun 预览 → 确认 → 执行完整流程）
- [ ] 通过自然语言成功创建一个带字段的数据表
- [ ] 停用事件时强制触发 dryRun 预览和确认

### 第三层
- [ ] 用户说"帮我分析最近7天的登录趋势"，AI 能完整走通 project→product→event_analysis 流程
- [ ] 用户说"帮我创建一个用户注册事件"，AI 能引导完成所有步骤并生成确认预览

---

## 9. 未纳入本期的能力（后续迭代）

- **数据表上传预览/导入**（`/biDataSource/dataPreview`, `/biDataSource/upload`）：涉及文件上传，需前端支持
- **事件分析报告导出**（`/my-query-event/download`）
- **跨产品事件同步**（`/eventManage/event/sync`）
- **用户分群创建**（`/my-query-event/customerGroup`）
- **埋点标准 Excel 导入**（`/eventCriteriaFile/upload`）
- **角色权限管理**（`/tenant/role/create`, `/tenant/role/update`）
- **数据文件上传入库**（`/biDataSource/upload`）
