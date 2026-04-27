---
name: dataeye-user-role-management
description: 指导 AI 在 DataEye 平台中创建用户、创建角色、为用户分配角色，处理成员管理和权限配置场景。当用户说"新增成员"、"创建账号"、"建个角色"、"分配权限"、"给用户授权"时使用此 Skill。
triggers:
  - 创建用户
  - 新增成员
  - 添加账号
  - 创建角色
  - 新建角色
  - 分配角色
  - 给用户授权
  - 用户管理
  - 角色管理
  - 邀请成员
  - 用户权限
requiredTools:
  - dataeye_role_list
  - dataeye_user_list
  - dataeye_project_list
  - dataeye_user_create
  - dataeye_role_create
  - dataeye_user_assign_role
---

# DataEye 用户与角色管理 Skill

帮助用户完成组织内的成员管理和角色配置，所有写操作默认 `dryRun=true` 预览，用户确认后再执行。

## DataEye 权限体系简述

```
组织 (Org)
 └── 角色 (Role)：绑定功能权限 + 可访问项目/产品范围
      └── 用户 (User)：可同时归属多个角色
```

- **角色** 决定用户能看到哪些菜单按钮（`permissionIdList`）以及哪些项目/产品数据
- **用户** 创建时可直接绑定角色，也可后续通过 `dataeye_user_assign_role` 调整

---

## 场景一：创建新角色

**触发词**：建角色 / 新增角色 / 角色管理

**执行流程（立即调用工具，不要先说"我来查一下"）：**

```
步骤1: dataeye_project_list()
   → 获取项目和产品 ID，供角色绑定数据范围使用

步骤2: 向用户确认角色信息
   → 角色名称（必填）
   → 需要绑定哪些项目/产品（可选，不填则无数据权限）
   → 功能权限通常不需要手动填写 permissionIdList

步骤3: dataeye_role_create(name=<>, projectIdList=<>, dryRun=true)
   → 预览创建结果

步骤4: 用户确认后 dataeye_role_create(dryRun=false)
```

**输出示例：**
```
即将创建角色：
  名称：数据分析师
  可访问项目：互动广告（ID: 19）
  
确认创建吗？回复"确认"或"是"继续。
```

---

## 场景二：创建新用户

**触发词**：新增成员 / 邀请用户 / 创建账号

**执行流程：**

```
步骤1: dataeye_role_list()
   → 获取可分配的角色列表，展示给用户选择

步骤2: 收集用户信息
   → email（必填）
   → username 显示名（必填）
   → 选择角色（可以是上一步列出的角色 ID）

步骤3: dataeye_user_create(email, username, roleIdList, dryRun=true)
   → 预览

步骤4: 用户确认后 dataeye_user_create(dryRun=false)
```

**角色展示格式：**
```
当前可分配角色：
  [ID: abc123] 数据分析师 - 可访问：互动广告项目
  [ID: def456] 产品运营   - 可访问：所有项目
  [ID: ghi789] 管理员     - 全部权限
```

---

## 场景三：给已有用户分配/更换角色

**触发词**：分配角色 / 调整权限 / 给 xxx 加权限

**执行流程：**

```
步骤1: dataeye_user_list(keyword=<用户名或邮箱>)
   → 找到目标用户 ID

步骤2: dataeye_role_list()
   → 列出可用角色供用户选择

步骤3: dataeye_user_assign_role(userId, roleIdList, dryRun=true)
   → 预览分配结果（注意：此操作会覆盖旧角色）

步骤4: 用户确认后 dataeye_user_assign_role(dryRun=false)
```

> ⚠️ `dataeye_user_assign_role` 是**覆盖**操作，会替换用户当前所有角色。执行前务必在预览中告知用户。

---

## 场景四：完整流程——建角色 + 建用户 + 授权

如果用户描述了一个完整需求（如"给新同事建个数据分析的角色并分配账号"），按顺序执行：

```
1. 查项目列表 → 确认角色的数据范围
2. 创建角色（dryRun=true → 确认 → dryRun=false）
3. 创建用户，同时在 roleIdList 里带上新建角色的 ID（dryRun=true → 确认 → dryRun=false）
```

---

## 字段快速参考

| 工具 | 必填 | 可选 |
|------|------|------|
| `dataeye_role_create` | `name` | `projectIdList`, `productIdList`, `permissionIdList` |
| `dataeye_user_create` | `email`, `username` | `phone`, `roleIdList`, `groupIdList`, `orgAuthFlag` |
| `dataeye_user_assign_role` | `userId` | `roleIdList`, `groupIdList`, `orgId` |

## 错误处理

| 情况 | 处理 |
|------|------|
| 角色名已存在 | 提示用户换一个名称，或查询现有角色列表 |
| 邮箱格式不正确 | 直接返回格式错误，请用户重新提供 |
| 用户已存在（邮箱重复） | 提示邮箱已注册，建议改为分配角色操作 |
| userId 找不到 | 用 `dataeye_user_list(keyword=xxx)` 重新搜索 |
| 无组织管理员权限 | 告知用户当前账号没有成员管理权限，需联系管理员 |
