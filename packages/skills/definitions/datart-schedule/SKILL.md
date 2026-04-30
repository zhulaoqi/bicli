---
name: dataeye-schedule
description: 查看、创建、编辑、复制、启停、立即执行、归档/删除和诊断 DataEye/Datart 定时任务。适用于"帮我创建定时任务"、"每天定时发送报表"、"修改收件人"、"启动任务"、"查看执行日志"等场景。
triggers:
  - 定时任务
  - 定时推送
  - 定时发送
  - 定时报表
  - 创建定时任务
  - 有哪些定时任务
  - 看板定时
  - 每天发送
  - 每周推送
  - 立即执行任务
  - 启动任务
  - 停止任务
  - 修改任务收件人
  - 修改任务发送配置
  - 查看任务日志
requiredTools:
  - dataeye_schedule_manage
  - dataeye_schedule_list
  - dataeye_schedule_create
  - dataeye_schedule_execute
  - dataeye_schedule_detail
  - dataeye_schedule_logs
  - dataeye_schedule_update
  - dataeye_schedule_delete
  - dataeye_schedule_copy
  - dataeye_schedule_name_check
  - dataeye_schedule_archived_list
  - dataeye_schedule_unarchive
  - dataeye_dashboard_list
---

# DataEye 定时任务 Skill

帮助用户查看、创建和管理 DataEye 数据看板的 Datart 定时推送任务。默认优先使用 `dataeye_schedule_manage`，因为它支持 `dryRun` 预览、风险提示和执行后验证；原子工具用于高级查询、局部补救或用户明确要求低层操作时。

## Cron 表达式快速参考

| 频率 | 表达式 | 说明 |
|------|--------|------|
| 每天上午 9:00 | `0 0 9 * * ?` | 工作日/每天 9:00 |
| 每周一上午 9:00 | `0 0 9 ? * MON` | 每周一 |
| 每月1日上午 9:00 | `0 0 9 1 * ?` | 每月初 |
| 每小时 | `0 0 * * * ?` | 每整点 |
| 每天 8:30 | `0 30 8 * * ?` | 8点半 |

## 后端真实契约

- 推送类型只使用 `EMAIL`、`WECHART`、`FEISHU`。不要使用 `WECHAT`、`DINGDING`、`HTTP`，除非用户明确说明目标后端已经扩展。
- 定时任务 `config` 是 Datart `ScheduleJobConfig` JSON 字符串，关键字段为 `to`、`cc`、`subject`、`attachments`、`pushMode`、`webHookUrl`、`textContent`、`vizContents`、`appId`、`appSecrete`。
- `to` 和 `cc` 在后端是分号分隔字符串；MCP 工具可接收数组并转换。
- `vizContents[].vizId` 是 Datart Folder ID，不是裸 dashboardId/datachartId。
- 邮件全局发件人不在 schedule config 中；任务运行身份来自 Datart `createBy`。公开 schedule API 不支持直接修改运行身份。
- Webhook、AppSecret 等敏感字段在输出中必须脱敏。
- 不调用 `logsV2`、`executeV2` 免登录接口。

## 工作流程

### 场景一：用户问"有哪些定时任务"

```
步骤1: dataeye_schedule_list(orgId=<orgId>)
   → 获取任务列表

步骤2: 整理展示
```

**输出格式：**
```
找到 N 个定时任务：

[任务名称A]  状态: 运行中  类型: EMAIL
   Cron: 0 0 9 * * ?（每天9:00）
   ID: xxx

[任务名称B]  状态: 已停止  类型: WECHART
   Cron: 0 0 9 ? * MON（每周一9:00）
   ID: xxx
```

### 场景二：用户说"帮我创建一个定时任务"

**信息收集（缺少时逐一询问）：**

| 参数 | 必填 | 说明 |
|------|------|------|
| 任务名称 | ✅ | 如"每日看板报表" |
| 关联看板 | ✅ | 推送哪个看板 |
| 发送频率 | ✅ | 每天/每周/自定义 |
| 推送方式 | ✅ | EMAIL / WECHART / FEISHU |
| 发送时间 | ✅ | 如"每天上午9点" |
| 接收人 | ✅ | 邮箱或群组 |
| 附件类型 | ✅ | IMAGE / EXCEL / PDF / URL |
| 开始日期 | ❌ | 默认立即生效 |
| 结束日期 | ❌ | 默认永久 |

**确认后执行：**
```
步骤1: dataeye_schedule_manage(operation="create", dryRun=true, ...)
   → 获取创建预览、缺失字段和风险提示

步骤2: 展示创建摘要，请用户确认
   任务名：[name]
   看板：[dashboardName]
   频率：每天 09:00（0 0 9 * * ?）
   推送方式：EMAIL → 张三 <zhangsan@company.com>
   附件：IMAGE

步骤3: 用户确认 → dataeye_schedule_manage(operation="create", dryRun=false, ...)

步骤4: 返回创建结果 + 提示"是否立即测试执行一次？"
```

### 场景三：用户说"立即触发一次任务"

```
步骤1: dataeye_schedule_list() → 找到目标任务 ID（如需要）
步骤2: dataeye_schedule_manage(operation="execute", scheduleId=<id>, dryRun=false)
   或 dataeye_schedule_execute(scheduleId=<id>)
   → 触发立即执行
步骤3: dataeye_schedule_logs(scheduleId=<id>, count=5)
   → 查看最近日志确认结果
```

### 场景四：启动/停止任务

```
启动: dataeye_schedule_manage(operation="start", scheduleId=<id>, dryRun=false)
停止: dataeye_schedule_manage(operation="stop", scheduleId=<id>, dryRun=false)
```

启动前检查：

- `cronExpression` 是 Quartz 6 位表达式。
- `endDate` 未过期。
- `config` 包含必要收件配置和附件/资源配置。
- 如果刚修改了名称、Cron 或时间窗口，建议先停止再重新启动。

### 场景五：修改任务发送配置

```
步骤1: dataeye_schedule_detail(scheduleId=<id>)
   → 获取当前配置（敏感信息已脱敏）

步骤2: dataeye_schedule_manage(operation="update", dryRun=true, ...)
   → 预览将修改的收件人、抄送、主题、Webhook、附件、Cron 等

步骤3: 用户确认 → dataeye_schedule_manage(operation="update", dryRun=false, ...)

步骤4: dataeye_schedule_detail(scheduleId=<id>) 或 dataeye_schedule_logs(scheduleId=<id>)
   → 验证修改结果
```

如果用户说“修改发送人”，必须先澄清：

- 修改邮件全局发件人：这不属于定时任务 config，需要系统邮件服务配置支持。
- 修改任务运行身份：后端公开 schedule API 不支持直接修改 `createBy`。
- 修改收件人/抄送/主题/Webhook/飞书应用配置：可以通过本 Skill 支持。

### 场景六：归档、删除、复制、恢复

```
复制: dataeye_schedule_manage(operation="copy", dryRun=true/false, ...)
归档: dataeye_schedule_manage(operation="archive", dryRun=true/false, ...)
永久删除: dataeye_schedule_manage(operation="delete", dryRun=true/false, ...)
恢复归档: dataeye_schedule_manage(operation="unarchive", dryRun=true/false, ...)
```

删除或永久删除前必须二次确认；active 任务先停止。

## config 字段说明

`ScheduleCreateParam.config` 是 JSON 字符串，按推送类型不同：

**EMAIL 类型：**
```json
{
  "to": "user1@company.com;user2@company.com",
  "cc": "leader@company.com",
  "subject": "看板日报",
  "textContent": "请查收",
  "attachments": ["IMAGE"],
  "vizContents": [
    { "vizType": "DASHBOARD", "vizId": "folder-id" }
  ],
  "imageWidth": 1200
}
```

**企业微信（WECHART）类型：**
```json
{
  "webHookUrl": "https://qyapi.weixin.qq.com/...",
  "attachments": ["IMAGE"],
  "vizContents": [
    { "vizType": "DASHBOARD", "vizId": "folder-id" }
  ],
  "imageWidth": 800
}
```

**飞书（FEISHU）类型：**
```json
{
  "to": "oc_group_id;user@company.com",
  "subject": "飞书报表",
  "pushMode": "webhook",
  "webHookUrl": "https://open.feishu.cn/...",
  "attachments": ["IMAGE"],
  "vizContents": [
    { "vizType": "DASHBOARD", "vizId": "folder-id" }
  ]
}
```

## 错误处理

| 情况 | 处理 |
|------|------|
| 任务列表为空 | "当前没有定时任务，需要帮您创建吗？" |
| Cron 表达式无效 | 重新解析用户描述的频率，给出正确 Cron |
| 看板不存在 | "未找到该看板，请确认看板名称" |
| 邮件配置未就绪 | "请先在系统设置中配置邮件服务" |
| Webhook/AppSecret 缺失 | 提示用户补齐对应渠道配置 |
| active 任务删除失败 | 先停止任务，再归档或删除 |
| 触发执行失败 | 原文转述错误信息 |

## 注意事项

- **Cron 格式**：定时任务使用 Quartz 格式（6位），如 `0 0 9 * * ?`，第一位是秒
- **写操作确认**：必须先 `dryRun=true` 展示摘要让用户确认，不要静默创建、编辑或删除
- **时区**：默认使用服务器时区，如需指定传 `timezone` 字段（如 `Asia/Shanghai`）
- **执行身份**：定时任务运行期以创建人身份读取数据，不能把“修改收件人”误说成“修改发送人/运行人”
- 详细 API 参数见 [reference/api.md](reference/api.md)
