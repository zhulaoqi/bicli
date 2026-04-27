# Datart 下载 API 参考

Base URL: `${DATART_API_BASE}/api/v1`

## 提交下载任务

```
POST /download/submit/task
Content-Type: application/json

{
  "fileName": "看板名称-20260416",
  "downloadType": "EXCEL",
  "imageWidth": 1200,
  "downloadParams": [
    {
      "vizId": "chart-id",
      "vizType": "DATACHART",
      "viewId": "view-id",
      "pageInfo": { "pageNo": 1, "pageSize": 10000 },
      "columns": [],
      "aggregators": [],
      "groups": [],
      "filters": [],
      "orders": []
    }
  ]
}
```

响应 `data`（`Download`）：

```json
{
  "id": "download-id",
  "name": "看板名称-20260416.xlsx",
  "status": "WAITING",
  "path": null,
  "createTime": "2026-04-16T09:00:00"
}
```

`status` 枚举：`WAITING` → `RUNNING` → `DONE` / `FAILED`

## 查询下载任务列表

```
GET /download/tasks?orgId={orgId}
```

响应 `data`：`List<Download>`（同上结构）

## 获取下载文件

```
GET /download/files/{id}
```

直接返回文件流（`Content-Disposition: attachment`），可在浏览器中直接打开下载。

## downloadType 枚举

| 值 | 说明 |
|----|------|
| EXCEL | .xlsx 格式，多图表时每个图表一个 Sheet |
| CSV | .csv 格式，适合单图表大数据量 |
| IMAGE | .png 截图（需设置 imageWidth） |

## Download 实体字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 任务 ID |
| name | varchar(255) | 文件名 |
| path | varchar(255) | 文件存储路径（完成后有值） |
| status | varchar | WAITING/RUNNING/DONE/FAILED |
| type | varchar | 下载类型 |
| org_id | varchar(32) | 组织 ID |
| last_download_time | timestamp | 最后下载时间 |
| create_by | varchar | 创建人 |
| create_time | timestamp | 创建时间 |
