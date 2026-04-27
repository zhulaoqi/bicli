# Datart 数据视图 API 参考

Base URL: `${DATART_API_BASE}/api/v1`

## 获取数据源列表

```
GET /sources?orgId={orgId}
```

响应 `data`：`List<Source>`

```json
[
  { "id": "source-id", "name": "生产数据库", "type": "MYSQL", "orgId": "..." }
]
```

## 测试执行 SQL

```
POST /data-provider/execute/test
Content-Type: application/json

{
  "sourceId": "source-id",
  "script": "SELECT date, COUNT(*) as cnt FROM events WHERE date >= '2026-01-01' GROUP BY date",
  "scriptType": "SQL",
  "size": 100
}
```

响应 `data`（`Dataframe`）：

```json
{
  "columns": [
    { "name": "date", "type": "DATE" },
    { "name": "cnt",  "type": "NUMERIC" }
  ],
  "rows": [
    ["2026-04-01", 1234],
    ["2026-04-02", 1567]
  ],
  "script": "SELECT date, COUNT(*) ...",
  "pageInfo": { "total": 30 }
}
```

## 获取视图列表

```
GET /views?orgId={orgId}
```

响应 `data`：`List<View>`

```json
[
  {
    "id": "view-id",
    "name": "视图名称",
    "sourceId": "source-id",
    "orgId": "...",
    "script": "SELECT ...",
    "type": "SQL",
    "status": 1
  }
]
```

## 创建数据视图

```
POST /views
Content-Type: application/json

{
  "name": "用户行为视图",
  "orgId": "org-id",
  "sourceId": "source-id",
  "script": "SELECT date, event, COUNT(*) as cnt FROM events GROUP BY date, event",
  "type": "SQL",
  "description": "可选备注说明",
  "model": "{}",
  "config": "{}"
}
```

响应 `data`（`View`）：

```json
{
  "id": "new-view-id",
  "name": "用户行为视图",
  "sourceId": "source-id",
  "orgId": "...",
  "script": "SELECT ...",
  "status": 1
}
```

## 数据表结构

### view 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 视图 ID |
| name | varchar(255) | 视图名称 |
| description | varchar(255) | 备注 |
| org_id | varchar(32) | 组织 ID |
| source_id | varchar(32) | 数据源 ID |
| script | mediumtext | SQL 脚本 |
| type | varchar(32) | 视图类型（SQL/STRUCT 等） |
| model | text | 字段模型 JSON |
| status | tinyint | 1=正常 0=删除 |
| parent_id | varchar(32) | 所属目录 |
| is_folder | tinyint | 是否为目录 |

### source 表（数据源）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 数据源 ID |
| name | varchar(255) | 数据源名称 |
| type | varchar(100) | 类型（MYSQL/POSTGRESQL 等） |
| org_id | varchar(32) | 组织 ID |
| config | text | 连接配置 JSON |
