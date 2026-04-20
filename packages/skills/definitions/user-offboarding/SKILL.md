---
name: user-offboarding
title: 用户离职与停用
description: >-
  处理用户离职或账号停用的完整流程：停用账号、回收权限、检查关联数据。
  当用户提到离职、停用账号、禁用用户、注销账号、人员离开、
  回收权限、冻结账号等场景时使用此 Skill。
triggers:
  - 离职
  - 停用
  - 禁用
  - 注销
  - 冻结
  - 回收权限
  - 离开
  - 开除
  - 人员变动
required_tools:
  - user_list
  - user_manage
  - form_query
  - data_query
  - role_list
required_permissions:
  - user:read
  - user:write
  - form:read
  - data:read
---

# 用户离职与停用

## 你的职责

安全地处理用户离职或账号停用，确保不遗漏关联数据，避免误操作。

## 工作流程

```
- [ ] Step 1: 确认目标用户
- [ ] Step 2: 检查关联数据
- [ ] Step 3: 风险评估
- [ ] Step 4: 执行停用
- [ ] Step 5: 验证与报告
```

### Step 1: 确认目标用户

用 `user_list` 搜索目标用户，确认身份：

```json
{ "keyword": "用户名或邮箱" }
```

展示用户信息（ID、用户名、邮箱、当前角色、状态），请管理员确认是否为目标用户。

**如果用户已经是 inactive 状态，提示并询问是否需要其他操作。**

### Step 2: 检查关联数据

停用前必须检查该用户创建的资产：

1. **表单资产**：用 `data_query` 查询 `forms` 表中 `created_by = userId` 的记录
2. **角色信息**：用 `role_list` 查看其角色详情

展示摘要：
```
该用户关联数据:
- 创建的表单: N 个（其中 published: X, draft: Y）
- 当前角色: editor（拥有 6 项权限）
```

### Step 3: 风险评估

| 场景 | 风险等级 | 处理建议 |
|------|---------|---------|
| admin 用户 | 🔴 高 | 需双重确认，检查是否为唯一 admin |
| 有 published 表单 | 🟡 中 | 表单仍有效，建议转交或归档 |
| 普通 viewer | 🟢 低 | 直接停用即可 |

**如果是系统唯一 admin**，阻止操作并警告。

### Step 4: 执行停用

确认后调用 `user_manage`：

```json
{
  "action": "update",
  "userId": <id>,
  "data": { "status": "inactive" }
}
```

BiCLI 使用**软停用**（状态改为 inactive），不删除数据。

### Step 5: 验证与报告

用 `user_list` 确认用户状态已变更，输出离职报告：

```
离职处理完成:
- 用户: zhang_wei (zhang.wei@company.com)
- 状态: active → inactive
- 关联表单: 3 个（均为 published，未变更）
- 处理时间: 2026-04-16
```

## 安全规则

- **绝不删除用户**，只停用（status → inactive）
- admin 用户停用前必须确认系统中还有其他 admin
- 停用不影响历史数据归属（created_by 保持不变）

> 离职检查清单、关联数据查询方法和风险评估矩阵见 [reference/offboarding-checklist.md](reference/offboarding-checklist.md)
