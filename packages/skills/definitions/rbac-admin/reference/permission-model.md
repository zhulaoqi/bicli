# BiCLI RBAC 权限模型参考

## 权限格式

所有权限采用 `resource:action` 格式。

## 资源与操作矩阵

| 资源 (resource) | read | write | 说明 |
|----------------|------|-------|------|
| user | 查询用户列表 | 创建/更新/删除用户 | 用户管理 |
| form | 查询表单列表和详情 | 创建/更新/删除表单 | 表单管理 |
| data | 通用数据查询、聚合统计 | — | 数据读取 |
| config | 查看系统配置项 | 创建/更新配置 | 配置管理 |
| role | 查看角色和权限列表 | 创建/更新/删除角色 | 角色管理 |

## 内置角色

| 角色 | 权限 | 说明 |
|------|------|------|
| admin | 全部 `*:read` + `*:write` | 超级管理员 |
| editor | `form:read/write`, `user:read`, `data:read`, `config:read` | 内容编辑者 |
| viewer | `form:read`, `user:read`, `data:read`, `config:read` | 只读查看者 |

## 数据权限层级

### 行级过滤 (data_scope_rules)
按角色控制能看到哪些行数据，规则存储在 `data_scope_rules` 表。

### 字段级过滤 (field_scope_rules)
按角色控制字段可见性：
- `visible`: 正常展示
- `hidden`: 从返回结果中移除
- `masked`: 脱敏展示（如邮箱 `z***@example.com`）

## role_manage API 参考

### 创建角色
```json
{
  "action": "create",
  "data": {
    "name": "custom-role",
    "description": "自定义角色描述",
    "permissions": ["form:read", "form:write", "data:read"]
  }
}
```

### 更新角色权限
```json
{
  "action": "update",
  "roleId": 4,
  "data": {
    "permissions": ["form:read", "data:read", "user:read"]
  }
}
```

### 删除角色
```json
{
  "action": "delete",
  "roleId": 4
}
```

## 安全注意事项

- 删除角色前务必检查是否有用户绑定该角色
- 修改 admin 权限需要双重确认
- 权限变更立即生效，无需重启
