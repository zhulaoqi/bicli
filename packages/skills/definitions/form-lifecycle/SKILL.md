---
name: form-lifecycle
title: 表单生命周期管理
description: >-
  管理表单从草稿到发布再到归档的完整生命周期。支持批量发布、状态审核、归档清理、
  表单状态查看。当用户提到发布表单、上线表单、归档表单、下线表单、表单状态、
  审核表单、启用表单、停用表单等场景时使用此 Skill。
triggers:
  - 发布表单
  - 上线表单
  - 归档表单
  - 下线表单
  - 表单状态
  - 审核表单
  - 启用表单
  - 停用表单
  - 表单管理
required_tools:
  - form_query
  - form_manage
  - data_aggregate
required_permissions:
  - form:read
  - form:write
---

# 表单生命周期管理

## 你的职责

管理表单从创建到退役的完整生命周期，确保状态流转安全、有序。

## 状态流转规则

```
draft（草稿）──→ published（已发布）──→ archived（已归档）
```

- `draft`: 新创建的表单，仅创建者和管理员可见，可自由编辑
- `published`: 对外发布，开始收集数据，修改需谨慎
- `archived`: 停止使用，历史数据保留，不可再收集数据

> 不支持反向流转（archived → published），如需重新启用建议复制创建新表单。

## 工作流程

```
- [ ] Step 1: 查看当前表单状态
- [ ] Step 2: 确认流转目标
- [ ] Step 3: 安全检查
- [ ] Step 4: 执行状态变更
- [ ] Step 5: 验证结果
```

### Step 1: 查看表单状态

调用 `form_query` 查看表单列表或指定表单的当前状态。如果用户没指定表单 ID，先列出表单让用户选择。

### Step 2: 确认流转目标

根据用户意图确定目标状态：
- "发布/上线" → `published`
- "归档/下线/停用" → `archived`

### Step 3: 安全检查

| 操作 | 检查项 |
|------|--------|
| draft → published | 确认表单有至少 1 个字段 |
| published → archived | 警告：归档后不可逆，提示用户确认 |
| 批量操作 | 列出受影响表单，逐一确认 |

### Step 4: 执行变更

调用 `form_manage`：

```json
{
  "action": "update",
  "formId": <id>,
  "data": { "status": "published" }
}
```

### Step 5: 验证

用 `form_query` 确认状态已变更。

## 批量场景

用户说"把所有草稿表单发布"时：
1. 用 `form_query` 查出所有 `draft` 状态的表单
2. 用 `data_aggregate` 统计数量
3. 列出清单，请用户确认
4. 逐一调用 `form_manage` 变更
5. 汇报成功/失败数量

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| PERMISSION_DENIED | 缺少 form:write | 需要 editor 或 admin 角色 |
| 表单不存在 | formId 无效 | 用 form_query 重新确认 |
