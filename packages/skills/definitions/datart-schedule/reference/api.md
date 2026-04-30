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
  "config": "{\"to\":\"user@company.com\",\"subject\":\"每日看板\",\"attachments\":[\"IMAGE\"],\"vizContents\":[{\"vizType\":\"DASHBOARD\",\"vizId\":\"folder-id\"}],\"imageWidth\":1200}"
}
```

响应 `data`（`Schedule`）：完整 schedule 对象（含 `id`）

## 获取任务详情

```
GET /schedules/{scheduleId}
```

## 更新任务

```
PUT /schedules/{scheduleId}
Content-Type: application/json

{
  "name": "每日看板报表",
  "type": "EMAIL",
  "cronExpression": "0 0 9 * * ?",
  "startDate": null,
  "endDate": null,
  "timezone": "Asia/Shanghai",
  "isFolder": false,
  "parentId": null,
  "index": 0,
  "config": "{\"to\":\"user@company.com\",\"subject\":\"每日看板\",\"attachments\":[\"IMAGE\"],\"vizContents\":[{\"vizType\":\"DASHBOARD\",\"vizId\":\"folder-id\"}]}"
}
```

全量更新需要 `MANAGE` 权限。修改名称、Cron、时间窗口后，如果任务已经启动，建议停止后重新启动。

## 更新基础信息

```
PUT /schedules/{scheduleId}/base
Content-Type: application/json

{
  "id": "schedule-id",
  "name": "新名称",
  "parentId": "folder-id",
  "index": 1
}
```

## 复制任务

```
PUT /schedules/copy
```

请求体与创建任务类似，但必须包含源任务 `id` 和新 `name`。

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

## 删除、归档与恢复

```
DELETE /schedules/{scheduleId}?archive=true
DELETE /schedules/{scheduleId}?archive=false
GET /schedules/archived?orgId={orgId}
PUT /schedules/unarchive/{scheduleId}?name={name}&index={index}&parentId={parentId}
```

active=true 的任务不允许删除或归档，需要先停止。

## 名称校验

```
POST /schedules/check/name
Content-Type: application/json

{
  "orgId": "org-id",
  "parentId": null,
  "name": "每日看板报表"
}
```

## 数据表结构

### schedule 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 任务 ID |
| name | varchar(255) | 任务名称 |
| org_id | varchar(32) | 组织 ID |
| type | varchar(100) | 推送类型（EMAIL/WECHART/FEISHU） |
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
| WECHART | 企业微信 |
| FEISHU | 飞书 |

## AttachmentType 枚举

| 值 | 说明 |
|----|------|
| IMAGE | PNG 截图 |
| EXCEL | Excel 附件 |
| PDF | PDF 附件 |
| URL | 链接 |

## ScheduleJobConfig 字段

| 字段 | 说明 |
|------|------|
| to | 收件人，分号分隔。邮件为邮箱；飞书 selfApplication 中 `oc_` 开头视为群 |
| cc | 邮件抄送人，分号分隔 |
| subject | 主题 |
| attachments | `AttachmentType[]` |
| pushMode | 飞书推送方式：`webhook` 或 `selfApplication` |
| webHookUrl | 企业微信/飞书 Webhook，输出时必须脱敏 |
| imageWidth | 截图宽度 |
| textContent | 正文/说明 |
| vizContents | 关联资源列表，`vizId` 是 Datart Folder ID |
| appId | 飞书应用 ID |
| appSecrete | 飞书应用 Secret，输出时必须脱敏 |
| imgGenerateTime | 飞书卡片是否展示图片生成时间 |
| sendDate | 飞书卡片是否展示发送日期 |

## 权限与身份边界

- 列表、详情、执行、启动、停止通常通过后端 `retrieve` 检查 READ。
- 全量更新需要 MANAGE。
- 基础信息移动/改名使用 CREATE 权限。
- 归档列表、恢复归档需要 MANAGE。
- 任务运行期以 `createBy` 对应用户身份读取资源；公开 schedule API 不支持直接修改运行身份。
- 邮件全局发件人来自系统邮件服务配置，不在 schedule config 中。
