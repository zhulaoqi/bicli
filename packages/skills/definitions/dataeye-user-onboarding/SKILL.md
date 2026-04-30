---
name: dataeye-user-onboarding
description: 指导 AI 完成 DataEye 新增成员、创建账号、开通用户并绑定角色的完整业务流程。用户提到创建用户、新增成员、邀请成员、开通账号、给新用户分配角色时使用。
triggers:
  - 创建用户
  - 新增成员
  - 邀请成员
  - 开通账号
  - 添加账号
  - 新用户分配角色
requiredTools:
  - dataeye_user_onboard
  - dataeye_role_list
  - dataeye_user_list
---

# DataEye 新增成员与角色绑定

## 首选工具

新增成员完整流程优先使用 `dataeye_user_onboard`，不要手动拆成 `dataeye_user_create` 和 `dataeye_user_assign_role`。

## 信息收集

缺少以下信息时先询问用户：

- `email`：用户邮箱，必填。
- `username`：显示名称，必填。
- `roleIdList` 或角色名称：建议通过 `dataeye_role_list` 帮用户选择。

## 执行流程

1. 如果角色不明确，先调用 `dataeye_role_list` 展示可选角色。
2. 调用 `dataeye_user_onboard(dryRun=true)` 生成预览计划。
3. 向用户展示将创建的用户、将绑定的角色、是否组织管理员。
4. 用户明确确认后，调用 `dataeye_user_onboard(dryRun=false)`。
5. 根据工具返回的 `verified` 字段说明是否验证成功。

## 安全规则

- `orgAuthFlag=true` 属于权限扩大，必须二次确认。
- 如果工具返回用户已存在，不要继续创建；改为建议分配或调整角色。
- 不要编造角色 ID；角色 ID 必须来自工具结果或用户明确提供。
