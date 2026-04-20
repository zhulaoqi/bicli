---
name: system-dashboard
title: 系统健康仪表盘
description: >-
  快速展示系统整体健康状况：用户统计、表单统计、配置状态、角色分布。
  当用户提到系统概况、仪表盘、看板、系统状态、整体情况、今天怎么样、
  系统概览、运行状况、dashboard 等场景时使用此 Skill。
triggers:
  - 仪表盘
  - 看板
  - 系统概况
  - 系统状态
  - 系统概览
  - 整体情况
  - 运行状况
  - dashboard
  - 今天数据
  - 现在情况
required_tools:
  - data_aggregate
  - user_list
  - form_query
  - config_get
  - role_list
required_permissions:
  - data:read
  - user:read
  - form:read
  - config:read
  - role:read
---

# 系统健康仪表盘

## 你的职责

一次性收集系统各维度的核心指标，以仪表盘格式展示，让管理员快速了解系统状态。

## 工作流程

```
- [ ] Step 1: 并行采集数据
- [ ] Step 2: 组装仪表盘
- [ ] Step 3: 输出异常告警
```

### Step 1: 并行采集数据

同时发起以下查询（能并行的尽量并行）：

| 指标 | 工具 | 参数 |
|------|------|------|
| 用户总数 | data_aggregate | `{ "table": "users", "aggregate": "COUNT", "field": "id" }` |
| 用户状态分布 | data_aggregate | `{ ..., "groupBy": "status" }` |
| 用户角色分布 | data_aggregate | `{ ..., "groupBy": "role_id" }` |
| 表单总数 | data_aggregate | `{ "table": "forms", "aggregate": "COUNT", "field": "id" }` |
| 表单状态分布 | data_aggregate | `{ ..., "groupBy": "status" }` |
| 角色列表 | role_list | `{}` |
| 配置项 | config_get | `{}` |

### Step 2: 组装仪表盘

输出格式：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 BiCLI 系统仪表盘
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👥 用户
   总数: N | 活跃: X | 停用: Y
   Admin: A | Editor: B | Viewer: C

📋 表单
   总数: N | 已发布: X | 草稿: Y | 已归档: Z

🔐 角色
   角色数: N | 权限项总计: M

⚙️ 配置
   配置项: N 项

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 3: 异常告警

自动检查并标注异常：

| 指标 | 告警条件 | 级别 |
|------|---------|------|
| inactive 用户占比 | > 50% | 🟡 |
| admin 用户数 | > 3 | 🟡 |
| 0 个 admin | = 0 | 🔴 |
| draft 表单积压 | > 10 个 | 🟡 |
| 无已发布表单 | = 0 | 🟡 |

如有告警，在仪表盘末尾追加：

```
⚠️ 告警
🟡 Inactive 用户占比 67%，建议清理
🟡 Admin 用户 5 人，超出建议值（≤3）
```

## 精简模式

如果用户只问某一方面（如"用户情况怎么样"），只采集和展示相关板块，不需要全量仪表盘。

> 完整指标采集参数、告警阈值和 role_id 映射方法见 [reference/metrics-api.md](reference/metrics-api.md)
