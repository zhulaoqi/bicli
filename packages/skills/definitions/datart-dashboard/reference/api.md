# Datart 看板 API 参考

Base URL: `${DATART_API_BASE}/api/v1`

## 获取看板目录树

```
GET /viz/folders?orgId={orgId}
```

响应（`data` 字段）：`List<FolderVo>`

```json
[
  {
    "id": "xxx",
    "name": "看板名称",
    "vizType": "DASHBOARD",
    "orgId": "...",
    "parentId": null,
    "index": 1.0,
    "isFolder": false
  }
]
```

过滤条件：`vizType === "DASHBOARD"` 且 `isFolder === false`

## 获取看板详情

```
GET /viz/dashboards/{dashboardId}
```

响应 `data` 关键字段：

```json
{
  "id": "xxx",
  "name": "看板名称",
  "config": "{}",
  "widgets": [
    {
      "id": "widget-id",
      "config": { "name": "图表名称", "type": "chart" },
      "datachartId": "chart-id"
    }
  ],
  "datacharts": [
    {
      "id": "chart-id",
      "name": "图表名称",
      "viewId": "view-id",
      "config": { "chartGraphId": "bar", ... }
    }
  ],
  "views": [
    { "id": "view-id", "name": "视图名称" }
  ]
}
```

## 执行图表数据查询

```
POST /data-provider/execute
Content-Type: application/json

{
  "vizId": "chart-id",
  "vizType": "DATACHART",
  "viewId": "view-id",
  "pageInfo": { "pageNo": 1, "pageSize": 100 },
  "columns": [],
  "aggregators": [],
  "groups": [],
  "filters": [],
  "orders": []
}
```

响应 `data`（`Dataframe`）：

```json
{
  "columns": [
    { "name": "date", "type": "DATE" },
    { "name": "count", "type": "NUMERIC" }
  ],
  "rows": [
    ["2026-04-01", 1234],
    ["2026-04-02", 1567]
  ],
  "pageInfo": { "total": 30, "pageNo": 1, "pageSize": 100 }
}
```

## 数据表结构

### dashboard 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 看板 ID |
| name | varchar(255) | 看板名称 |
| org_id | varchar(32) | 组织 ID |
| config | text | JSON 配置（布局等） |
| status | tinyint | 1=正常 0=删除 |
| create_by | varchar(32) | 创建人 |

### widget 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 部件 ID |
| dashboard_id | varchar(32) | 所属看板 |
| config | longtext | 图表配置（含 viewId、chartGraphId 等） |
