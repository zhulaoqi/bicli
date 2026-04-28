---
name: dataeye-schedule
description: 查看 DataEye 定时任务列表、创建新的定时任务（定时推送看板报表/截图/邮件）、立即触发执行、启动/停止任务。适用于"帮我创建定时任务"、"每天定时发送报表"、"设置看板定时推送"、"查看定时任务"等场景。
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
requiredTools:
  - dataeye_schedule_list
  - dataeye_schedule_create
  - dataeye_schedule_execute
  - dataeye_schedule_execute
  - dataeye_schedule_execute
  - dataeye_dashboard_list
---

# DataEye 定时任务 Skill

帮助用户查看、创建和管理 DataEye 数据看板的定时推送任务。

## Cron 表达式快速参考

| 频率 | 表达式 | 说明 |
|------|--------|------|
| 每天上午 9:00 | `0 0 9 * * ?` | 工作日/每天 9:00 |
| 每周一上午 9:00 | `0 0 9 ? * MON` | 每周一 |
| 每月1日上午 9:00 | `0 0 9 1 * ?` | 每月初 |
| 每小时 | `0 0 * * * ?` | 每整点 |
| 每天 8:30 | `0 30 8 * * ?` | 8点半 |

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

⏰ [任务名称A]  状态: 运行中 🟢  类型: EMAIL
   Cron: 0 0 9 * * ?（每天9:00）
   ID: xxx

⏰ [任务名称B]  状态: 已停止 ⭕  类型: WECHAT
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
| 推送方式 | ✅ | EMAIL / WECHAT / DINGDING |
| 发送时间 | ✅ | 如"每天上午9点" |
| 接收人 | ✅ | 邮箱或群组 |
| 开始日期 | ❌ | 默认立即生效 |
| 结束日期 | ❌ | 默认永久 |

**确认后执行：**
```
步骤1: 展示创建摘要，请用户确认
   任务名：[name]
   看板：[dashboardName]
   频率：每天 09:00（0 0 9 * * ?）
   推送方式：EMAIL → 张三 <zhangsan@company.com>

步骤2: 用户确认 → dataeye_schedule_create(...)

步骤3: 返回创建结果 + 提示"是否立即测试执行一次？"
```

### 场景三：用户说"立即触发一次任务"

```
步骤1: dataeye_schedule_list() → 找到目标任务 ID（如需要）
步骤2: dataeye_schedule_execute(scheduleId=<id>)
   → 触发立即执行
步骤3: "已触发执行，可查看任务日志确认结果"
```

### 场景四：启动/停止任务

```
启动: dataeye_schedule_execute(scheduleId=<id>, action="start")
停止: dataeye_schedule_execute(scheduleId=<id>, action="stop")
```

## config 字段说明

`ScheduleCreateParam.config` 是 JSON 字符串，按推送类型不同：

**EMAIL 类型：**
```json
{
  "vizType": "DASHBOARD",
  "vizId": "dashboard-id",
  "contentType": "IMAGE",
  "to": ["user1@company.com", "user2@company.com"],
  "subject": "看板日报",
  "imageWidth": 1200
}
```

**企业微信（WECHAT）类型：**
```json
{
  "vizType": "DASHBOARD",
  "vizId": "dashboard-id",
  "contentType": "IMAGE",
  "webHookUrl": "https://qyapi.weixin.qq.com/...",
  "imageWidth": 800
}
```

## 错误处理

| 情况 | 处理 |
|------|------|
| 任务列表为空 | "当前没有定时任务，需要帮您创建吗？" |
| Cron 表达式无效 | 重新解析用户描述的频率，给出正确 Cron |
| 看板不存在 | "未找到该看板，请确认看板名称" |
| 邮件配置未就绪 | "请先在系统设置中配置邮件服务" |
| 触发执行失败 | 原文转述错误信息 |

## 注意事项

- **Cron 格式**：定时任务使用 Quartz 格式（6位），如 `0 0 9 * * ?`，第一位是秒
- **创建前确认**：必须展示摘要让用户确认，不要静默创建
- **时区**：默认使用服务器时区，如需指定传 `timezone` 字段（如 `Asia/Shanghai`）
- 详细 API 参数见 [reference/api.md](reference/api.md)
