# 操作审计 API 参考

## audit_query - 查询审计日志

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | number | 否 | 按用户 ID 筛选 |
| toolName | string | 否 | 按工具名筛选 |
| resourceType | string | 否 | 按资源类型筛选 |
| action | string | 否 | 按操作类型筛选 |
| startTime | string | 否 | 起始时间 (ISO 8601) |
| endTime | string | 否 | 结束时间 (ISO 8601) |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，最大 100 |

### 返回字段
| 字段 | 说明 |
|------|------|
| userId | 操作者用户 ID |
| userRole | 操作者角色 |
| toolName | 调用的工具名称 |
| action | 操作类型 (create/delete/update/query等) |
| resourceType | 资源类型 (user/form/config等) |
| resourceId | 资源 ID |
| inputSummary | 输入参数摘要 (已脱敏) |
| outputSummary | 输出结果摘要 (已截断) |
| status | 操作状态: success/failed/denied/confirmed |
| durationMs | 操作耗时(毫秒) |
| createdAt | 操作时间 |

### 审计记录状态
- `success`: 操作成功完成
- `failed`: 操作执行但返回错误
- `denied`: 操作被权限系统拒绝
- `confirmed`: 敏感操作经用户确认后执行

### 脱敏规则
- 输入参数中的 password/token/apiKey/secret 等敏感字段自动替换为 `***`
- `_context` 字段自动移除
- 输出结果超过 500 字符自动截断
