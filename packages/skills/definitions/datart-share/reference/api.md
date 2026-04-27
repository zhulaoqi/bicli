# Datart 分享 API 参考

Base URL: `${DATART_API_BASE}/api/v1`

## 创建分享链接

```
POST /shares
Content-Type: application/json

{
  "vizType": "DASHBOARD",
  "vizId": "dashboard-id",
  "authenticationMode": "FREE",
  "expiryDate": "2026-04-23T23:59:59.000Z",
  "rowPermissionBy": "CREATOR",
  "roles": [],
  "users": [],
  "authenticationCode": null
}
```

**`vizType` 取值：**
- `DASHBOARD`：看板
- `DATACHART`：单个图表

**`authenticationMode` 取值：**
- `FREE`：无需登录
- `CODE`：密码访问（需配合 `authenticationCode`）
- `LOGIN`：需要登录 Datart
- `ROLE`：指定角色（需配合 `roles`）

响应 `data`（`ShareToken`）：

```json
{
  "id": "share-id",
  "authorizedToken": "eyJhbGciOiJIUzI1...",
  "authenticationMode": "FREE",
  "authenticationCode": null
}
```

**前端分享链接构造：**
```
${DATART_FRONTEND_URL}/shareDashboard/{authorizedToken}
```

---

## 获取看板下的分享列表

```
GET /shares/{vizId}
```

响应 `data`：`List<ShareInfo>`

```json
[
  {
    "id": "share-id",
    "vizType": "DASHBOARD",
    "vizId": "dashboard-id",
    "authenticationMode": "FREE",
    "expiryDate": "2026-04-23T23:59:59.000Z",
    "roles": [],
    "createBy": "user-id",
    "createTime": "2026-04-16T09:00:00"
  }
]
```

---

## 更新分享

```
PUT /shares/{shareId}
Content-Type: application/json

{
  "expiryDate": "2026-05-31T23:59:59.000Z",
  "authenticationMode": "CODE",
  "authenticationCode": "newpass123"
}
```

响应 `data`：`ShareInfo`

---

## 删除分享

```
DELETE /shares/{shareId}
```

响应 `data`：`true`

---

## share 数据表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(32) | 分享 ID |
| org_id | varchar(32) | 组织 ID |
| viz_type | varchar(128) | DASHBOARD / DATACHART |
| viz_id | varchar(32) | 看板或图表 ID |
| authentication_mode | varchar(128) | FREE/CODE/LOGIN/ROLE |
| roles | text | 角色 ID 列表（JSON） |
| row_permission_by | varchar(128) | 行权限来源 |
| authentication_code | varchar(255) | 访问密码 |
| expiry_date | timestamp | 链接过期时间 |
| create_by | varchar(128) | 创建人 |
| create_time | timestamp | 创建时间 |
