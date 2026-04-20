# 表单字段类型参考

## 支持的字段类型

| 类型 | 说明 | 适用场景 | validation 示例 |
|------|------|---------|----------------|
| `text` | 单行文本 | 姓名、标题、地址 | `{ "minLength": 2, "maxLength": 100 }` |
| `email` | 邮箱 | 邮箱地址（自动校验格式） | — |
| `number` | 数字 | 年龄、金额、数量、评分 | `{ "min": 0, "max": 999999 }` |
| `select` | 下拉选择 | 性别、部门、状态、类别 | 需提供 `options` |
| `date` | 日期 | 生日、入职日期、截止时间 | — |
| `textarea` | 多行文本 | 备注、描述、详情、原因 | `{ "maxLength": 2000 }` |

## select 类型 options 格式

```json
{
  "label": "工程部",
  "type": "select",
  "required": true,
  "options": [
    { "label": "工程部", "value": "engineering" },
    { "label": "市场部", "value": "marketing" },
    { "label": "产品部", "value": "product" },
    { "label": "运营部", "value": "operations" }
  ]
}
```

## 常见表单模板

### 员工入职登记
| 字段 | 类型 | 必填 |
|------|------|------|
| 姓名 | text | 是 |
| 邮箱 | email | 是 |
| 部门 | select | 是 |
| 入职日期 | date | 是 |
| 备注 | textarea | 否 |

### 请假申请
| 字段 | 类型 | 必填 |
|------|------|------|
| 请假类型 | select (年假/病假/事假) | 是 |
| 开始日期 | date | 是 |
| 结束日期 | date | 是 |
| 天数 | number | 是 |
| 事由 | textarea | 是 |

### 客户反馈
| 字段 | 类型 | 必填 |
|------|------|------|
| 客户姓名 | text | 是 |
| 联系邮箱 | email | 否 |
| 反馈类型 | select (建议/投诉/咨询) | 是 |
| 满意度 | number (1-5) | 是 |
| 详细内容 | textarea | 是 |

## form_create API 完整示例

```json
{
  "name": "请假申请表",
  "description": "员工在线提交请假申请",
  "fields": [
    {
      "label": "请假类型",
      "type": "select",
      "required": true,
      "options": [
        { "label": "年假", "value": "annual" },
        { "label": "病假", "value": "sick" },
        { "label": "事假", "value": "personal" }
      ]
    },
    { "label": "开始日期", "type": "date", "required": true },
    { "label": "结束日期", "type": "date", "required": true },
    { "label": "天数", "type": "number", "required": true, "validation": { "min": 0.5, "max": 30 } },
    { "label": "事由说明", "type": "textarea", "required": true, "validation": { "maxLength": 500 } }
  ]
}
```

## form_manage 状态转换

```
draft → published → archived
```

- `draft`: 草稿，可编辑
- `published`: 已发布，对外可见
- `archived`: 已归档，不再使用
