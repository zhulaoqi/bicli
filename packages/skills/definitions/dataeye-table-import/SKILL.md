---
name: dataeye-table-import
description: 指导 AI 根据用户上传的 CSV、Excel 或样例数据创建 DataEye 数据表，并在能力允许时导入数据。用户提到上传文件建表、Excel 导入、CSV 导入、根据文件创建表时使用。
triggers:
  - 上传文件建表
  - Excel 导入
  - CSV 导入
  - 根据文件创建表
  - 文件导入数据表
  - 导入成数据表
requiredTools:
  - dataeye_table_import_create
  - dataeye_project_list
---

# DataEye 文件建表导入

## 首选工具

文件上传或样例数据建表优先使用 `dataeye_table_import_create`。不要要求用户手写完整字段 JSON，除非工具无法从样例推断字段。

## 信息收集

缺少以下信息时先询问：

- `projectId`：数据表所属项目。
- `tableName`：英文表名。
- `ctType`：`1` 日志表，`3` 主键表。
- `sampleText` 或 `sampleRows`：用于字段推断。当前 MCP 不能只凭 `fileId` 读取文件内容。

## 执行流程

1. 如果项目不明确，调用 `dataeye_project_list` 让用户选择。
2. 调用 `dataeye_table_import_create(dryRun=true)` 推断字段并校验表名。
3. 展示字段名、类型、主键建议和表类型，让用户确认或修改。
4. 用户确认后调用 `dataeye_table_import_create(dryRun=false)`。
5. 如果工具返回 `dataImportStatus=not_supported`，必须明确说明“已建表但未导入数据”，不能声称上传成功。

## 字段规则

- 日期字段优先映射为 `dataType=1`。
- 数值字段映射为 `dataType=3`。
- 其他字段映射为 `dataType=2`。
- 字段英文标识使用 snake_case。

## 禁止事项

- 不要把全量大文件内容放进对话上下文。
- 如果用户只提供了文件引用但没有样例数据，先说明当前需要样例行或文件内容预览。
- 不要在导入接口未接入时声称“数据已上传”。
- 表名已存在时必须让用户换名或确认使用其他表。
