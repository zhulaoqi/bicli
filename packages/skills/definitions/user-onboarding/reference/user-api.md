# 用户创建与角色 API 完整参考

## user_manage API

### 创建用户
```json
{
  "action": "create",
  "data": {
    "username": "string",   // 必填，2-50 字符，唯一
    "email": "string",      // 必填，合法邮箱，唯一
    "role_id": 2,           // 必填，必须是已存在的角色 ID
    "status": "active"      // 可选，默认 "active"
  }
}
```

### 更新用户
```json
{
  "action": "update",
  "userId": 1,             // 必填
  "data": {
    "username": "new_name", // 可选
    "email": "new@co.com",  // 可选
    "role_id": 3,           // 可选
    "status": "inactive"    // 可选
  }
}
```

### 删除用户
```json
{
  "action": "delete",
  "userId": 1              // 必填
}
```

## user_list API

```json
{
  "keyword": "搜索词",     // 可选，匹配 username
  "status": "active",      // 可选
  "role_id": 2,            // 可选
  "page": 1,
  "pageSize": 20
}
```

返回字段: `id, username, email, roleId, status, createdAt, updatedAt`

注意: viewer 角色可能看不到 `email`（masked）和 `roleId`（hidden），取决于 field_scope_rules。

## role_list API

```json
{}                         // 查全部角色
{ "roleId": 1 }           // 查单个角色（含权限列表）
```

返回: `{ id, name, description, createdAt, permissions: ["user:read", ...] }`

## role_manage API

### 创建角色
```json
{
  "action": "create",
  "data": {
    "name": "operator",           // 必填，唯一
    "description": "运营人员",     // 可选
    "permissions": [               // 可选
      "form:read", "form:write", "data:read", "user:read"
    ]
  }
}
```

## 内置角色 ID 映射

| ID | 名称 | 权限数 |
|----|------|--------|
| 1 | admin | 全部（10+） |
| 2 | editor | 6 |
| 3 | viewer | 4 |

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| VALIDATION_ERROR: 创建用户需要 username, email, role_id | 参数不全 | 检查三个必填字段 |
| PERMISSION_DENIED | 缺少 user:write | 需要 admin 角色 |
| Duplicate entry | username 或 email 重复 | 先用 user_list 检查是否已存在 |
