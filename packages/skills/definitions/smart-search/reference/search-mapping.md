# 跨资源搜索映射与 API 参数

## 搜索策略决策树

```
用户输入关键词
  ├── 像人名/邮箱 → user_list({ keyword })
  ├── 像表单名 → form_query({ }) + 手动匹配 name
  ├── 像配置项 → config_get({ keyword })
  └── 不确定 → 全部搜索，合并结果
```

## 各资源搜索 API

### 用户搜索 — user_list
```json
{
  "keyword": "搜索词",   // 匹配 username（模糊）
  "status": "active",    // 可选，缩小范围
  "role_id": 2,          // 可选，按角色筛选
  "page": 1,
  "pageSize": 10
}
```
返回: `{ data: [{ id, username, email, roleId, status, createdAt }], total }`

### 表单搜索 — form_query
```json
{
  "status": "published",  // 可选
  "page": 1,
  "pageSize": 10
}
```
返回: `{ data: [{ id, name, description, status, createdBy, createdAt }], total }`

注意：form_query 不支持 keyword 搜索，需要取回列表后在结果中手动匹配 `name` 或 `description`。

### 配置搜索 — config_get
```json
{
  "keyword": "搜索词"    // 匹配 key 和 description（模糊）
}
```
返回: `{ data: [{ id, key, value, description, updatedBy, updatedAt }] }`

### 通用搜索 — data_query
```json
{
  "table": "forms",
  "where": { "name": { "$like": "%关键词%" } },
  "page": 1,
  "pageSize": 10
}
```
适用于需要精确条件匹配的场景。

## 结果合并格式

```
🔍 搜索 "关键词" 的结果:

👤 用户 (N 条)
  - username (email) [status]

📋 表单 (N 条)
  - form_name [status] — description

⚙️ 配置 (N 条)
  - key: description
```

## 搜索优化提示

- 搜索意图明确时只查单个资源（减少 API 调用）
- 结果超过 10 条时提示用户缩小范围
- 无结果时建议换关键词或指定资源类型
