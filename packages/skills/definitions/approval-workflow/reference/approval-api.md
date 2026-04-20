# 审批工作流 API 参考

## approval_submit - 提交审批

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 审批标题 |
| type | enum | 是 | 审批类型: leave(请假), expense(报销), publish(发布), custom(自定义) |
| content | object | 是 | 审批内容，自由结构 |
| reviewerId | number | 是 | 审批人用户 ID |
| relatedResourceType | string | 否 | 关联资源类型 |
| relatedResourceId | number | 否 | 关联资源 ID |

### content 示例

**请假审批:**
```json
{
  "startDate": "2026-04-21",
  "endDate": "2026-04-23",
  "reason": "年假",
  "days": 3
}
```

**报销审批:**
```json
{
  "amount": 3500,
  "items": ["机票", "酒店", "交通"],
  "trip": "上海客户拜访"
}
```

### 返回
```json
{
  "success": true,
  "data": {
    "id": 4,
    "title": "请假申请 - 年假",
    "type": "leave",
    "status": "pending",
    "submittedBy": 3,
    "reviewerId": 1
  }
}
```

## approval_review - 审批操作

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| approvalId | number | 是 | 审批单 ID |
| action | enum | 是 | approve(通过), reject(驳回), reassign(转审) |
| comment | string | 否 | 审批意见 |
| reassignTo | number | 否 | 转审目标用户 ID (reassign时必填) |

### 业务规则
- 只有指定审批人才能 approve/reject
- 不能审批自己提交的申请
- 只有 pending 状态的审批单可操作
- 使用乐观锁防止并发冲突

## approval_query - 查询审批

### 输入参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| approvalId | number | 否 | 查询指定审批单详情（含操作历史） |
| status | string | 否 | 按状态筛选 |
| submittedBy | number | 否 | 按提交人筛选 |
| reviewerId | number | 否 | 按审批人筛选 |
| type | string | 否 | 按审批类型筛选 |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |

### 数据权限
- admin: 可查看全部审批
- editor: 只能看到自己提交或自己是审批人的
- viewer: 只能看到自己提交的
