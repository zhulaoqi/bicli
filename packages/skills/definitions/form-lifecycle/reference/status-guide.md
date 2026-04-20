# 表单状态流转详细指南

## 状态说明

| 状态 | 含义 | 可执行操作 | 可见范围 |
|------|------|-----------|---------|
| draft | 草稿 | 编辑字段/名称/描述，发布，删除 | 创建者、admin |
| published | 已发布 | 编辑名称/描述，归档 | 所有有 form:read 权限的用户 |
| archived | 已归档 | 仅查看 | admin（viewer 受 data_scope_rules 限制） |

## 状态转换矩阵

| 当前状态 | → draft | → published | → archived | → 删除 |
|---------|:------:|:----------:|:----------:|:-----:|
| draft | — | ✅ | ❌ | ✅ |
| published | ❌ | — | ✅ | ⚠️不建议 |
| archived | ❌ | ❌ | — | ⚠️不建议 |

## form_create API

```json
{
  "name": "表单名称",             // 必填
  "description": "表单描述",       // 可选
  "fields": [                     // 必填，至少一个字段
    {
      "label": "字段标签",
      "type": "text | email | number | select | date | textarea",
      "required": true,           // 可选，默认 false
      "validation": {},           // 可选，自定义验证规则
      "options": [                // select 类型时必填
        { "label": "选项1", "value": "opt1" }
      ]
    }
  ]
}
```

新表单默认状态为 `draft`，`createdBy` 由系统从 `_context.userId` 自动填入。

## form_manage API

### 发布表单
```json
{ "action": "update", "formId": 1, "data": { "status": "published" } }
```

### 归档表单
```json
{ "action": "update", "formId": 1, "data": { "status": "archived" } }
```

### 修改表单信息
```json
{ "action": "update", "formId": 1, "data": { "name": "新名称", "description": "新描述" } }
```

### 删除表单
```json
{ "action": "delete", "formId": 1 }
```

## form_query API（查询用）

```json
{ "formId": 1 }                    // 查单个表单（含字段定义）
{ "status": "draft", "page": 1, "pageSize": 20 }  // 按状态筛选
```

## 批量操作示例流程

```
1. form_query({ "status": "draft" })         → 列出所有草稿
2. 逐个展示，等用户确认
3. form_manage({ "action": "update", "formId": X, "data": { "status": "published" } })
4. form_query 验证结果
```

## 注意事项

- 删除操作会同时删除表单的所有字段定义（form_fields），**不可恢复**
- published 状态的表单不建议删除，应归档处理
- 归档后如需复用，建议用 form_create 基于原表单重新创建
- 状态变更前务必用 form_query 确认当前状态
- data_scope_rules 会影响不同角色可见的表单范围
