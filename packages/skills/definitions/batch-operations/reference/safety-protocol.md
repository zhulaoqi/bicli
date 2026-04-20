# 批量操作安全协议与 API 参考

## 批量操作安全五步法

```
查询 → 预览 → 确认 → 执行 → 验证
```

每一步都不可跳过。

## user_manage API

```json
{
  "action": "create | update | delete",
  "userId": 123,         // update/delete 时必填
  "data": {
    "username": "string",  // create 时必填
    "email": "string",     // create 时必填
    "role_id": 1,          // create 时必填
    "status": "active | inactive"
  }
}
```

## user_list API（查询阶段用）

```json
{
  "status": "active | inactive",  // 可选
  "role_id": 1,                    // 可选
  "keyword": "搜索词",             // 可选，匹配 username
  "page": 1,
  "pageSize": 20
}
```

## form_manage API

```json
{
  "action": "update | delete",
  "formId": 1,           // 必填
  "data": {
    "name": "string",
    "description": "string",
    "status": "draft | published | archived"
  }
}
```

## form_query API（查询阶段用）

```json
{
  "formId": 1,           // 查单个（可选）
  "status": "draft | published | archived",  // 筛选（可选）
  "page": 1,
  "pageSize": 20
}
```

## 批量操作限制

| 规则 | 值 |
|------|-----|
| 单次最大条数 | 50 |
| 是否支持批量删除 | 否（只支持状态变更） |
| admin 用户能否被批量操作 | 否 |
| 是否需要逐条执行 | 是（无批量 API） |

## 批量创建用户示例流程

```
1. 用户给出列表: "张三 zhangsan@co.com editor, 李四 lisi@co.com viewer"
2. 解析为:
   - { username: "zhangsan", email: "zhangsan@co.com", role_id: 2 }
   - { username: "lisi", email: "lisi@co.com", role_id: 3 }
3. 展示预览表格，请用户确认
4. 逐条调用 user_manage(action: "create", data: {...})
5. 汇报: "成功 2/2"
```

## 批量状态变更示例流程

```
1. user_list({ status: "active", role_id: 3 }) → 查出 viewer 用户
2. 展示: "将 5 个 viewer 用户的状态改为 inactive"
3. 等待确认
4. 逐条 user_manage(action: "update", userId: X, data: { status: "inactive" })
5. user_list 验证结果
```
