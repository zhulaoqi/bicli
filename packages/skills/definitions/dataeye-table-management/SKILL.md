---
name: dataeye-table-management
description: DataEye 数据表管理向导 — 引导 AI 完成数据表创建（含字段定义），包含表名校验和 dryRun 预览确认
triggers:
  - 创建数据表
  - 新建表
  - 建表
  - 添加字段
  - 数据表管理
  - 表结构设计
  - 创建表
requiredTools:
  - dataeye_table_import_create
  - dataeye_project_list
  - dataeye_table_validate_name
  - dataeye_table_create
  - dataeye_table_update_status
---

# DataEye 数据表管理向导

## 首选业务动作

如果用户是“上传文件建表 / Excel 导入 / CSV 导入 / 根据文件创建表”，优先使用 `dataeye_table_import_create`。该工具会根据样例推断字段、校验表名并生成 dryRun 预览；不要要求用户手写完整字段 JSON。

## 创建数据表完整流程

### 步骤 1：确定目标项目
```
dataeye_project_list(type="project") → 获取项目列表，确定 projectId
```
注意：数据表属于**项目**级别（不是产品级别）。

### 步骤 2：收集表信息

询问用户：
- 表名（英文，如 user_behavior）
- 表类型（日志表/主键表）
  - **日志表**（ctType=1）：DUPLICATE KEY，允许重复，适合事件流、日志记录
  - **主键表**（ctType=3）：PRIMARY KEY，唯一主键，适合用户属性、维度表
- 表说明/备注
- 字段列表（每个字段：英文标识符、中文名、数据类型）

### 步骤 3：校验表名
```
dataeye_table_validate_name(tableName="user_behavior", projectId=xxx)
```
若不可用 → 提示用户修改名称，重复步骤 3。

### 步骤 4：dryRun 预览
```
dataeye_table_create(
  projectId=xxx, tableName=..., ctType=1,
  fields=[...],
  dryRun=true
)
```
向用户展示：
```
📋 即将创建数据表
• 项目: [项目名] (id: xxx)
• 表名: user_behavior
• 类型: DUPLICATE KEY（日志表）
• 字段（3个）:
  - event_time (datetime) 事件时间
  - user_id (varchar) 用户 ID
  - event_name (varchar) 事件名称
确认执行？
```

### 步骤 5：用户确认后执行
```
dataeye_table_create(dryRun=false)
```

### 步骤 6：报告结果
```
✅ 数据表 user_behavior 创建成功（StarRocks DDL 已执行）
```

## 管理数据表状态

```
暂停: dataeye_table_update_status(id=xxx, status="PAUSE", dryRun=true) → 确认 → dryRun=false
删除: dataeye_table_update_status(id=xxx, status="DELETE", dryRun=true)
      ⚠️ 必须向用户强调：删除不可逆，所有数据将永久丢失
      用户确认后 → dryRun=false
```

## 数据类型说明

| dataType 值 | 含义 | 适用场景 |
|-------------|------|----------|
| `1` | datetime | 时间戳、日期字段 |
| `2` | varchar | 文本、ID、字符串 |
| `3` | number | 数值、金额、计数 |

## 常见错误处理

| 错误 | 处理方式 |
|------|----------|
| 表名已存在 | dataeye_table_validate_name 会返回不可用，提示修改名称 |
| 字段标识符包含特殊字符 | 建议使用下划线命名法（snake_case）|
| StarRocks DDL 执行失败 | 原文转述后端错误，常见原因：字段类型不支持、主键字段标识错误 |
