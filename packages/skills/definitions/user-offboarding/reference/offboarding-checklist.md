# 离职操作检查清单与 API 参考

## 离职检查清单

```
- [ ] 1. 确认目标用户身份（user_list 搜索）
- [ ] 2. 检查用户角色（是否为 admin）
- [ ] 3. 查询创建的表单（data_query forms where created_by=userId）
- [ ] 4. 评估风险等级
- [ ] 5. 执行停用（user_manage update status=inactive）
- [ ] 6. 验证结果（user_list 确认）
```

## 关联数据查询方法

### 查询用户创建的表单

```json
// data_query
{
  "table": "forms",
  "where": { "created_by": 用户ID },
  "page": 1,
  "pageSize": 50
}
```

### 查询用户的角色详情

```json
// role_list
{ "roleId": 角色ID }
```

### 统计用户创建的表单数量

```json
// data_aggregate
{
  "table": "forms",
  "metric": "count",
  "where": { "created_by": 用户ID }
}
```

## user_manage 停用 API

```json
{
  "action": "update",
  "userId": 目标用户ID,
  "data": { "status": "inactive" }
}
```

## 风险评估矩阵

| 条件 | 风险 | 处理 |
|------|:----:|------|
| admin 角色 + 系统唯一 admin | 🔴 | **阻止操作** |
| admin 角色 + 非唯一 | 🔴 | 需管理员书面确认 |
| 有 published 表单 | 🟡 | 提示转交或归档 |
| 有 draft 表单 | 🟢 | 可直接停用 |
| viewer 角色 | 🟢 | 直接停用 |

## 检查唯一 admin 的方法

```json
// user_list
{ "role_id": 1, "status": "active" }
```

如果返回 total = 1 且就是目标用户 → 阻止操作。

## 停用 vs 删除

BiCLI 采用**软停用**策略：
- `status = inactive`：账号停用，不可登录，数据保留
- 不支持通过离职流程删除用户（delete 操作仅限极端场景）
- 历史数据中的 `created_by` 等字段保持不变
