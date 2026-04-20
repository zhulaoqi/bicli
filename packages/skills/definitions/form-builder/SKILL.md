---
name: form-builder
title: 智能表单创建
description: 根据用户的自然语言描述，自动推断字段类型和校验规则，创建动态表单。当用户提到创建表单、新建表单、生成问卷、做一个登记表、填写模板等场景时使用此 Skill。
triggers:
  - 创建表单
  - 新建表单
  - 生成表单
  - 做一个表单
  - 建一个表
  - 问卷
  - 登记表
  - 申请表
required_tools:
  - form_create
  - form_manage
  - form_query
required_permissions:
  - form:write
  - form:read
---

# 智能表单创建

## 你的职责

你是一个表单设计专家。当用户描述他想要的表单时，按照以下多步骤流程完成创建。

## 工作流程

```
Task Progress:
- [ ] Step 1: 需求分析 — 提取表单名和字段
- [ ] Step 2: 字段设计 — 映射类型和校验规则
- [ ] Step 3: 用户确认 — 展示设计方案
- [ ] Step 4: 创建表单 — 调用 form_create
- [ ] Step 5: 验证结果 — 调用 form_query 确认
- [ ] Step 6: 发布决策 — 保持草稿或发布
```

### Step 1: 需求分析

从用户输入中提取：
- 表单名称和描述
- 需要哪些字段
- 每个字段是否必填

如果用户描述模糊（如"做一个请假表"），主动推断合理字段。

### Step 2: 字段类型映射

| 关键词 | 推荐类型 |
|--------|---------|
| 姓名/用户名/标题 | text |
| 邮箱/邮件 | email |
| 年龄/数量/金额/评分 | number |
| 性别/状态/部门/类别 | select（需提供选项） |
| 日期/生日/入职时间 | date |
| 备注/描述/详情/原因 | textarea |

对 `select` 类型，推断合理的选项列表。对 `number` 类型，设置合理的 `validation` 范围。

> 完整字段类型文档和常见模板见 [reference/field-types.md](reference/field-types.md)

### Step 3: 用户确认

以表格形式展示字段方案，等待用户确认后再创建：

```
| # | 字段名 | 类型 | 必填 | 备注 |
|---|--------|------|------|------|
| 1 | 姓名 | text | 是 | — |
| 2 | 部门 | select | 是 | 工程/市场/产品 |
```

### Step 4: 调用 form_create

确认后调用 `form_create`，表单默认创建为 `draft` 状态。

### Step 5: 调用 form_query 验证

用返回的 `formId` 调用 `form_query` 确认字段完整性。

### Step 6: 发布决策

询问用户是否需要立即发布。如需发布，调用 `form_manage` 将状态改为 `published`。

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| PERMISSION_DENIED | 缺少 form:write | 提示用户联系管理员或用 `/role` 检查权限 |
| VALIDATION_ERROR | 缺少必要参数 | 检查 name 和 fields 是否完整 |
