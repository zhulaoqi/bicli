# 配置管理 API 与配置项字典

## config_get API

```json
{
  "key": "site.name",       // 精确查找（可选）
  "keyword": "site"          // 模糊搜索 key 或 description（可选）
}
```

不传任何参数 → 返回全部配置项。

## config_set API

```json
{
  "key": "site.name",                // 必填
  "value": "BiCLI Demo",             // 必填，JSON 值（字符串/数字/对象/数组）
  "description": "站点名称"           // 可选
}
```

- key 已存在 → 更新（覆盖 value）
- key 不存在 → 新建
- 权限要求：`config:write`

## configs 表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 主键 |
| key | varchar(100) | 配置键（唯一） |
| value | json | 配置值（支持任意 JSON） |
| description | varchar(200) | 说明文本 |
| updatedBy | bigint | 最后更新者的 user ID |
| updatedAt | timestamp | 最后更新时间 |

## 内置配置项字典

| key | 类型 | 说明 | 默认值 |
|-----|------|------|--------|
| site.name | string | 站点名称 | "BiCLI" |
| site.language | string | 默认语言 | "zh-CN" |
| user.default_role | string | 新用户默认角色 | "viewer" |
| form.max_fields | number | 单表单最大字段数 | 50 |
| system.version | string | 系统版本号（建议只读） | "2.0.0" |

## value 格式示例

```json
// 字符串值
{ "key": "site.name", "value": "My App" }

// 数字值
{ "key": "form.max_fields", "value": 100 }

// JSON 对象值
{ "key": "email.smtp", "value": { "host": "smtp.example.com", "port": 465 } }

// 数组值
{ "key": "system.allowed_origins", "value": ["http://localhost:3000", "https://app.example.com"] }
```

## 安全注意事项

- 修改 `system.version` 前警告用户
- 所有 value 必须是合法 JSON
- 修改后立即用 `config_get` 验证生效
- field_scope_rules 可能对 viewer 角色隐藏 `value` 字段
