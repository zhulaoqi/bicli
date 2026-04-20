# 数据查询 API 参考

## 可查询的表

| 表名 | 主要字段 | 说明 |
|------|---------|------|
| users | id, username, email, status, role_id, created_at | 用户表 |
| forms | id, name, description, status, created_by, created_at | 表单表 |
| form_fields | id, form_id, label, type, field_order, required | 表单字段表 |
| configs | id, key, value, description, updated_by | 系统配置表 |

## data_query 工具参数

```json
{
  "table": "users",
  "conditions": { "status": "active" },
  "orderBy": "created_at",
  "orderDir": "desc",
  "page": 1,
  "pageSize": 20
}
```

## data_aggregate 工具参数

```json
{
  "table": "users",
  "aggregate": "COUNT",
  "field": "id",
  "groupBy": "status"
}
```

支持的聚合函数：`COUNT`, `SUM`, `AVG`

## user_list 工具参数

```json
{
  "keyword": "zhang",
  "status": "active",
  "roleId": 2,
  "page": 1,
  "pageSize": 20
}
```

## 自然语言到查询的映射示例

| 用户说 | 工具 | 参数 |
|--------|------|------|
| "查询所有用户" | user_list | `{}` |
| "查活跃用户" | user_list | `{ "status": "active" }` |
| "有多少用户" | data_aggregate | `{ "table": "users", "aggregate": "COUNT", "field": "id" }` |
| "各角色用户数" | data_aggregate | `{ "table": "users", "aggregate": "COUNT", "field": "id", "groupBy": "role_id" }` |
| "查一下配置" | config_get | `{}` |
