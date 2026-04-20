---
name: security-audit
title: 权限安全审计
description: >-
  审查系统权限配置，检查过度授权、孤立角色、异常用户状态等安全问题。
  当用户提到安全审计、权限检查、安全扫描、权限审查、合规检查、
  谁有什么权限、过度授权、权限清单等场景时使用此 Skill。
triggers:
  - 安全审计
  - 权限检查
  - 安全扫描
  - 权限审查
  - 合规
  - 过度授权
  - 权限清单
  - 安全报告
  - 谁有权限
required_tools:
  - role_list
  - user_list
  - data_aggregate
  - self_permissions
required_permissions:
  - role:read
  - user:read
  - data:read
---

# 权限安全审计

## 你的职责

对系统进行全面的权限安全审查，发现潜在风险并给出修复建议。

## 审计维度

```
- [ ] 审计 1: 角色权限审查
- [ ] 审计 2: 用户分布审查
- [ ] 审计 3: 高权限用户审查
- [ ] 审计 4: 异常状态审查
- [ ] 审计 5: 综合评分与建议
```

### 审计 1: 角色权限审查

调用 `role_list` 获取所有角色及其权限，检查：

| 检查项 | 风险 | 说明 |
|--------|------|------|
| 角色拥有全部 write 权限 | 🔴 高 | 除 admin 外不应有全部写权限 |
| 角色无任何权限 | 🟡 中 | 可能是遗留空角色 |
| 角色权限与名称不匹配 | 🟡 中 | 如 viewer 角色有 write 权限 |

### 审计 2: 用户分布审查

用 `data_aggregate` 统计各角色用户数：

```json
{ "table": "users", "aggregate": "COUNT", "field": "id", "groupBy": "role_id" }
```

检查：
- 是否有角色没有关联用户（孤立角色）
- 各角色用户数是否合理（admin 不应过多）

### 审计 3: 高权限用户审查

用 `user_list` 筛选 admin 角色用户，检查：
- admin 用户数量（建议 ≤3）
- 是否有 inactive 的 admin（安全隐患）
- admin 邮箱是否为公司邮箱

### 审计 4: 异常状态审查

用 `data_aggregate` 统计用户状态分布：

```json
{ "table": "users", "aggregate": "COUNT", "field": "id", "groupBy": "status" }
```

检查：
- inactive 用户占比（>50% 说明需要清理）
- 是否有状态异常的数据

### 审计 5: 综合评分与建议

生成安全审计报告：

```
🔒 BiCLI 安全审计报告
━━━━━━━━━━━━━━━━━━━━

📊 总览
- 角色数: N | 用户数: M | Admin 数: K

🔍 发现的问题
🔴 [高] xxxxx
🟡 [中] xxxxx
🟢 [低] xxxxx

📋 建议措施
1. xxxxxx
2. xxxxxx

安全评分: X/10
```

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| PERMISSION_DENIED | 缺少 role:read | 需要 admin 角色执行审计 |
| 数据不完整 | 部分查询失败 | 报告已获取的结果，标注缺失项 |
