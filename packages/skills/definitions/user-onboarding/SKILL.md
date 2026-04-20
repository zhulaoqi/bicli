---
name: user-onboarding
title: 用户创建与角色分配
description: 引导完成新用户创建、角色选择或创建、权限分配的完整流程。当用户提到新建用户、入职、添加成员、开通账号、分配角色、注册用户、设置权限等场景时使用此 Skill。
triggers:
  - 入职
  - 新员工
  - 开通账号
  - 新建用户
  - 添加用户
  - 注册用户
  - 创建用户
  - 分配角色
  - 添加成员
required_tools:
  - user_manage
  - user_list
  - role_list
  - role_manage
required_permissions:
  - user:write
  - user:read
  - role:read
---

# 用户创建与角色分配

## 你的职责

引导管理员完成完整的用户创建和权限分配流程，确保账号规范、权限合理。

## 工作流程

```
Task Progress:
- [ ] Step 1: 收集需求 — 用户名、邮箱、目标角色
- [ ] Step 2: 查看角色 — role_list 查看可用角色
- [ ] Step 3: 创建/选择角色 — 匹配或新建角色
- [ ] Step 4: 创建用户 — user_manage 创建账号
- [ ] Step 5: 验证结果 — user_list 确认用户信息
```

### Step 1: 收集需求

向用户询问：
- **用户名**（必填）：2-50 字符
- **邮箱**（必填）：合法邮箱格式
- **角色意图**：用户想让新成员做什么？

如果用户给出模糊描述（如"加一个编辑"），推断出需要 editor 角色。

### Step 2: 查看已有角色

调用 `role_list` 列出所有角色及权限，帮助用户选择：

```
现有角色:
1. admin — 全部权限（谨慎分配）
2. editor — 表单读写、数据读取
3. viewer — 只读权限
```

**如果已有角色满足需求**，记下 `roleId`，跳到 Step 4。

### Step 3: 创建新角色（如需要）

如果没有合适角色，使用 `role_manage` 创建：

```json
{
  "action": "create",
  "data": {
    "name": "operator",
    "description": "运营人员，可管理表单和查看数据",
    "permissions": ["form:read", "form:write", "data:read", "user:read"]
  }
}
```

**创建前务必与用户确认权限列表。**

> 完整权限列表见 [reference/permission-model.md](../rbac-admin/reference/permission-model.md)

### Step 4: 创建用户

确认后调用 `user_manage`：

```json
{
  "action": "create",
  "data": {
    "username": "新用户名",
    "email": "user@company.com",
    "role_id": 2,
    "status": "active"
  }
}
```

### Step 5: 验证结果

用 `user_list` 查询确认用户已创建且信息正确。

## 安全规则

- 不允许直接创建 admin 角色用户，需明确二次确认
- 邮箱格式必须合法
- 创建前检查是否已存在同名/同邮箱用户（用 user_list 查询）

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| PERMISSION_DENIED | 缺少 user:write | 当前用户需要 admin 角色 |
| VALIDATION_ERROR | 缺少必要字段 | username + email + role_id 缺一不可 |

> user_manage/user_list/role_manage 的完整参数、角色 ID 映射和常见错误见 [reference/user-api.md](reference/user-api.md)
