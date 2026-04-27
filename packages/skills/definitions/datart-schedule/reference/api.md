# Datart 定时任务 API 参考

Base URL: `${DATART_API_BASE}/api/v1`

## 获取定时任务列表

```
GET /schedules?orgId={orgId}
```

响应 `data`：`List<ScheduleBaseInfo>`

```json
[
  {
    "id": "schedule-id",
    "name": "每日看板报表",
    "orgId": "...",
    "type": "EMAIL",
    "active": 1,
    "cronExpression": "0 0 9 * * ?",
    "startDate": null,
    "endDate": null,
    "parentId": null,
    "isFolder": false
  }
]
```

`active` 字段：`1` = 启动中，`0` = 已停止

## 创建定时任务

```
POST /schedules
Content-Type: application/json

{
  "name": "每日看板报表",
  "orgId": "org-id",
  "type": "EMAIL",
  "cronExpression": "0 0 9 * * ?",
  "startDate": null,
  "endDate": null,
  "timezone": "Asia/Shanghai",
  "isFolder": false,
  "config": "{\"vizType\":\"DASHBOARD\",\"vizId\":\"dashboard-id\",\"contentType\":\"IMAGE\",\"to\":[\"user@company.com\"],\"subject\":\"每日看板\",\"imageWidth\":1200}"
}
```

响应 `data`（`Schedule`）：完整 schedule 对象（含 `id`）

## 获取任务详情

```
GET /schedules/{scheduleId}
```

## 立即执行任务

```
POST /schedules/execute/{scheduleId}
```

响应 `data`：`true`（成功）

## 启动任务

```
PUT /schedules/start/{scheduleId}
```

## 停止任务

```
PUT /schedules/stop/{scheduleId}
```

## 查看执行日志

```
GET /schedules/logs/{scheduleId}?count=20
```

响应 `data`：`List<ScheduleLog>`

```json
[
  {
    "id": "log-id",
    "scheduleId": "schedule-id",
    "start": "2026-04-16 09:00:01",
    "end": "2026-04-16 09:00:05",
    "status": 1,
    "message": "发送成功"
  }
]
```

`status`：`1`=成功，`0`=失败

## 数据表结构

### schedule 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 任务 ID |
| name | varchar(255) | 任务名称 |
| org_id | varchar(32) | 组织 ID |
| type | varchar(100) | 推送类型（EMAIL/WECHAT/DINGDING） |
| active | tinyint | 1=启动 0=停止 |
| cron_expression | varchar(100) | Quartz Cron（6位） |
| start_date | timestamp | 生效开始时间（null=立即） |
| end_date | timestamp | 生效结束时间（null=永久） |
| config | text | 推送配置 JSON |
| timezone | varchar(200) | 时区，如 Asia/Shanghai |
| status | tinyint | 1=正常 0=删除 |

### schedule_log 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 日志 ID |
| schedule_id | varchar(32) | 所属任务 |
| start | varchar(255) | 开始时间 |
| end | varchar(255) | 结束时间 |
| status | int | 1=成功 0=失败 |
| message | text | 日志内容 |

## JobType 枚举（schedule.type 取值）

| 值 | 说明 |
|----|------|
| EMAIL | 邮件推送 |
| WECHAT | 企业微信 |
| DINGDING | 钉钉 |
| HTTP | HTTP 回调 |
