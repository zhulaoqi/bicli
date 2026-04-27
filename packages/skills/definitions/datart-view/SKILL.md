---
name: datart-view
description: 帮助用户在 Datart 中执行 SQL 语句查看结果，并将 SQL 保存为数据视图（View）。适用于"帮我执行这条 SQL"、"把这个 SQL 保存为视图"、"创建数据视图"、"新建一个视图"等场景。
triggers:
  - 执行SQL
  - 运行SQL
  - 创建视图
  - 保存视图
  - 新建视图
  - 数据视图
  - 帮我建个视图
  - SQL查询
  - 查询数据
requiredTools:
  - datart_view_list
  - datart_view_create
  - datart_data_test_execute
  - datart_source_list
---

# Datart 数据视图创建 Skill

帮助用户先测试 SQL，确认结果正确后，将 SQL 保存为 Datart 数据视图，供看板图表调用。

## 工作流程

### 场景一：用户提供 SQL，要求"执行看看结果"

```
步骤1: datart_source_list(orgId=<orgId>)
   → 列出可用数据源，让用户选择（如只有一个则自动使用）

步骤2: datart_data_test_execute(sourceId=<id>, script=<SQL>, size=100)
   → 试运行 SQL，返回前 100 行结果

步骤3: 展示结果摘要（列名 + 前5行 + 总行数）
```

**结果展示格式：**
```
SQL 执行成功，返回 N 行数据：

列：date | event_name | count | pv

前 5 行：
| date       | event_name | count | pv   |
|------------|------------|-------|------|
| 2026-04-01 | login      | 1234  | 5678 |
| 2026-04-01 | purchase   | 234   | 890  |
...

是否将此 SQL 保存为视图？请提供视图名称。
```

### 场景二：用户说"帮我把这个 SQL 创建成视图"

**信息收集（缺少时询问）：**

| 参数 | 必填 | 说明 |
|------|------|------|
| 视图名称 | ✅ | 用于在看板中引用 |
| SQL 脚本 | ✅ | 查询语句 |
| 数据源 | ✅ | 选哪个数据库 |
| 视图描述 | ❌ | 可选备注 |

**确认后执行：**
```
步骤1: 展示创建摘要，请用户确认
   视图名称：[name]
   数据源：[sourceName]
   SQL 预览：[前 200 字符]...

步骤2: 用户确认后 → datart_view_create(...)

步骤3: 返回创建结果（视图 ID + 名称）
```

### 场景三：用户说"先跑一下 SQL，没问题再保存"

```
步骤1: datart_data_test_execute(script=<SQL>, sourceId=<id>)
   → 执行并展示结果

步骤2: "数据符合预期吗？确认后我可以帮您保存为视图。"

步骤3: 用户确认 → 收集视图名称 → datart_view_create(...)
```

## 错误处理

| 情况 | 处理 |
|------|------|
| SQL 语法错误 | 原文转述错误，提示检查 SQL |
| 数据源连接失败 | "数据源连接异常，请确认数据源配置正常" |
| 视图名称重复 | "该名称已存在，请换一个视图名称" |
| SQL 执行超时 | "查询超时，建议添加 WHERE 条件缩小范围" |
| 无可用数据源 | "当前组织下没有数据源，请先在 Datart 添加数据源" |

## 注意事项

- **先执行再保存**：总是先 `test_execute` 验证 SQL 正确性，再创建视图
- **确认步骤**：创建前必须展示摘要让用户确认，不要静默创建
- **不支持 DDL**：视图 script 只支持 SELECT 语句，不支持 INSERT/UPDATE/DELETE
- 详细 API 参数见 [reference/api.md](reference/api.md)
