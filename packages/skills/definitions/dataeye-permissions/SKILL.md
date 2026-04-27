---
name: dataeye-permissions
description: DataEye 平台权限体系知识 — 帮助 AI 正确理解数据访问层级和权限规则，避免错误诊断
triggers:
  - 权限
  - 看不到
  - 没有权限
  - 访问被拒
  - 列表为空
  - 项目为空
  - 产品为空
  - 无法访问
  - permission
  - forbidden
---

# DataEye 权限体系

## 核心数据层级

```
Platform（平台）
  └── Organization（组织，type=tenant）
        ├── rel_org_user → 用户-组织关联（含用户类型）
        ├── rel_role_user → 用户-角色关联（一个用户可有多个角色）
        └── Project（项目，org_id 关联，属于且仅属于一个组织）
              └── Product（产品，project_id 关联）
                    ├── 事件定义（bi_event_schema，通过 productId 关联）
                    ├── 事件属性（bi_event_schema_property）
                    └── 数据表（bi_data_source，通过 project_id 关联）
```

## 数据访问控制（三级）

```
用户 → 角色（rel_role_user）
  └── 项目权限（rel_role_project）
        ├── all_product = 1 → 该项目下【所有产品】可见
        └── all_product = 0 → 只有 rel_role_product 中明确授权的产品可见
```

**关键规则：**
- 事件和数据表的可见性由"能否访问其所属产品/项目"决定，没有独立的"事件权限"
- `permission` 表是功能权限（菜单/按钮），与数据可见性完全分离
- 用户可能在同一组织下有多个角色，访问范围取各角色的并集

## 正确导航顺序

**必须按顺序调用，不可跳步：**

```
步骤1: dataeye_project_list(type="project")
   → 获取当前用户在当前组织内有权访问的项目列表

步骤2: dataeye_project_list(type="product", projectId=<选定项目ID>)
   → 获取该项目下当前用户有权访问的产品列表

步骤3: 根据目标操作选择工具
   → 事件相关: dataeye_event_list(productId=<选定产品ID>)
   → 数据表相关: dataeye_table_list(projectId=<选定项目ID>)
   → SQL查询: dataeye_datasource_list → dataeye_sql_query
```

跳过任何一步将导致参数缺失错误，不是权限问题。

## 常见现象与正确诊断

| 现象 | 真实原因 | 正确说法 | 错误说法（禁止） |
|------|----------|----------|-----------------|
| 项目列表为空 `[]` | 角色未绑定任何项目（rel_role_project 无记录） | "您的当前角色尚未被授权访问任何项目，请联系管理员在角色配置中添加项目权限" | "权限配置异常" / "系统故障" |
| 产品列表为空 `[]` | all_product=0 且无产品授权，或项目下确实无产品 | "当前项目下您的角色未被授权访问任何产品" | "权限配置错误" |
| 事件列表为空 `[]` | 该产品尚未定义任何事件（正常状态） | "该产品当前没有已定义的事件" | "无权访问事件" |
| SQL 查询报错 | sourceId 不正确或对应表不存在 | "查询所用的数据源 ID 可能有误，请先调用 dataeye_datasource_list 确认" | "SQL执行权限不足" |
| 接口返回 401 | JWT 已过期 | "您的登录凭证已过期，请刷新页面重新登录" | "权限被拒绝" |

## 权限诊断流程

当用户遇到访问问题时：

```
1. 先确认能否访问项目（调 dataeye_project_list）
   ↓ 如果项目列表为空
2. 建议用户联系管理员检查：
   - 角色是否绑定了项目（rel_role_project）
   - 如果有项目但产品为空，检查 all_product 标志
   ↓ 如果项目存在但特定操作失败
3. 检查是否是功能权限问题（操作按钮级别）
4. 若是 DataEye 后端返回的业务错误，原文转述错误信息给用户
```

## 注意事项

- **不要推测权限配置**：看到空列表不等于权限异常，先确认层级导航是否正确
- **不要绕过层级**：必须先有 projectId 才能查产品，必须先有 productId 才能操作事件
- **组织 ID 由 JWT 自动携带**：调工具时不需要单独传 orgId，后端从 token 中解析
