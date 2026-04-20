# 报表模板与数据源映射

## 数据采集映射

| 指标 | 工具 | 参数 |
|------|------|------|
| 用户总数 | data_aggregate | `{ "table": "users", "metric": "count" }` |
| 用户状态分布 | data_aggregate | `{ "table": "users", "metric": "count", "groupBy": "status" }` |
| 用户角色分布 | data_aggregate | `{ "table": "users", "metric": "count", "groupBy": "role_id" }` |
| 表单总数 | data_aggregate | `{ "table": "forms", "metric": "count" }` |
| 表单状态分布 | data_aggregate | `{ "table": "forms", "metric": "count", "groupBy": "status" }` |
| 各表单字段数 | data_aggregate | `{ "table": "form_fields", "metric": "count", "groupBy": "form_id" }` |
| 最近注册用户 | user_list | `{ "pageSize": 5 }` + orderBy createdAt desc |
| 表单详情 | form_query | `{ "formId": N }` |
| 配置项列表 | config_get | `{}` |

## 系统概览报表模板

```markdown
# 系统概览报表
生成时间: YYYY-MM-DD

## 用户统计
| 指标 | 数值 |
|------|------|
| 总用户数 | N |
| 活跃用户 | N (占比%) |
| 停用用户 | N (占比%) |

### 角色分布
| 角色 | 用户数 | 占比 |
|------|--------|------|
| admin | N | N% |
| editor | N | N% |
| viewer | N | N% |

## 表单统计
| 指标 | 数值 |
|------|------|
| 总表单数 | N |
| 已发布 | N |
| 草稿 | N |
| 已归档 | N |

## 配置项
共 N 项配置

## 建议
1. [基于数据的建议]
2. [基于数据的建议]
```

## 用户活跃报表模板

```markdown
# 用户活跃报表

## 活跃率
活跃用户 N / 总用户 M = N%

## 各角色活跃情况
| 角色 | 活跃 | 停用 | 活跃率 |
|------|------|------|--------|

## 最近注册
| 用户名 | 邮箱 | 角色 | 注册时间 |
|--------|------|------|---------|
```

## 输出规范

- 数值用绝对值 + 百分比双重展示
- 关键数据加粗
- 异常值用 ⚠️ 标注
- 每份报表结尾附 2-3 条可操作建议
- 使用 Markdown 表格，保证在终端和 Web 都能正确渲染
