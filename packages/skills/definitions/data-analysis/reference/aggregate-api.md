# 聚合分析 API 完整参考

## data_aggregate 参数

```json
{
  "table": "users | forms | form_fields | configs",
  "metric": "count | sum | avg",
  "field": "字段名（sum/avg 时必填）",
  "groupBy": "分组字段名（可选）",
  "where": { "字段名": 条件值 }
}
```

## 支持的聚合函数

| metric | 说明 | field 是否必填 |
|--------|------|:------------:|
| count | 计数 | 否 |
| sum | 求和 | 是 |
| avg | 平均值 | 是 |

## 各表可用字段

### users
| 字段 | 类型 | 说明 | 可 groupBy | 可 where |
|------|------|------|:---------:|:-------:|
| id | serial | 主键 | - | 是 |
| username | varchar(50) | 用户名 | - | 是 |
| email | varchar(100) | 邮箱 | - | 是 |
| roleId | bigint | 角色 ID | 是 | 是 |
| status | enum(active,inactive) | 状态 | 是 | 是 |
| createdAt | timestamp | 创建时间 | - | 是 |

### forms
| 字段 | 类型 | 说明 | 可 groupBy | 可 where |
|------|------|------|:---------:|:-------:|
| id | serial | 主键 | - | 是 |
| name | varchar(100) | 表单名 | - | 是 |
| createdBy | bigint | 创建者 ID | 是 | 是 |
| status | enum(draft,published,archived) | 状态 | 是 | 是 |
| createdAt | timestamp | 创建时间 | - | 是 |

### configs
| 字段 | 类型 | 说明 | 可 groupBy | 可 where |
|------|------|------|:---------:|:-------:|
| id | serial | 主键 | - | 是 |
| key | varchar(100) | 配置键 | - | 是 |
| updatedBy | bigint | 更新者 ID | 是 | 是 |

## where 条件语法

```json
{ "status": "active" }                    // 精确匹配
{ "status": { "$in": ["active", "inactive"] } }  // IN 查询
{ "username": { "$like": "%zhang%" } }     // 模糊匹配
{ "id": { "$gte": 1, "$lte": 100 } }     // 范围查询
```

## 常见分析场景示例

### 各角色用户数
```json
{ "table": "users", "metric": "count", "groupBy": "role_id" }
```

### 各状态表单数
```json
{ "table": "forms", "metric": "count", "groupBy": "status" }
```

### 活跃用户中各角色分布
```json
{ "table": "users", "metric": "count", "groupBy": "role_id", "where": { "status": "active" } }
```

### 各创建者的表单数
```json
{ "table": "forms", "metric": "count", "groupBy": "created_by" }
```

## data_query 参数（辅助分析用）

```json
{
  "table": "users | forms | form_fields | configs",
  "where": { "字段": 条件 },
  "orderBy": { "field": "字段名", "direction": "asc | desc" },
  "page": 1,
  "pageSize": 20
}
```

用于在聚合后下钻查看明细数据。
