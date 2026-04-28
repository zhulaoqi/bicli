---
name: dataeye-download
description: 提交看板或图表数据的下载任务，轮询等待完成后返回下载链接。适用于"帮我下载看板数据"、"导出这个图表"、"把数据导出成 Excel"、"下载分析结果"等场景。
triggers:
  - 下载看板
  - 导出数据
  - 下载数据
  - 下载图表
  - 导出看板
  - 导出图表
  - 下载Excel
  - 下载CSV
  - 把数据导出
  - 帮我导出
requiredTools:
  - dataeye_dashboard_list
  - dataeye_dashboard_detail
  - dataeye_download_submit
  - dataeye_download_task_list
---

# DataEye 数据看板下载 Skill

帮助用户提交下载任务、等待完成并返回可下载链接。

## 工作流程

### 场景：用户说"帮我下载 [看板名] 的数据"

```
步骤1: dataeye_dashboard_list() → 找到目标看板 ID

步骤2: dataeye_dashboard_detail(dashboardId=<id>)
   → 获取看板内的 datacharts 列表（含 viewId）

步骤3: 确认下载范围 + 文件格式（EXCEL 或 CSV），展示摘要让用户确认

步骤4: 用户确认 → dataeye_download_submit(...)
   → 提交下载任务，返回 Download 对象（id + status）

步骤5: dataeye_download_task_list() → 轮询直到 status = DONE

步骤6: 返回下载链接
   下载地址：{可视化服务地址}/api/v1/download/files/{downloadId}
```

### 确认摘要格式

```
准备导出以下数据：

📊 看板：[看板名称]
📁 文件名：[看板名]-20260416.xlsx
📋 格式：Excel
📦 包含图表：[图表1]、[图表2]、[图表3]

确认导出？
```

### 完成后输出

```
✅ 导出完成！

📥 下载链接：{可视化服务地址}/api/v1/download/files/{id}

（链接有效期 24 小时，点击即可下载）
```

## 文件格式说明

| 格式 | downloadType 值 | 适用场景 |
|------|-----------------|---------|
| Excel | `EXCEL` | 多图表、表格数据，默认推荐 |
| CSV | `CSV` | 单个图表、大数据量 |
| 图片 | `IMAGE` | 看板截图，适合报告插图 |

默认使用 **EXCEL**，用户未指定时不必询问。

## 错误处理

| 情况 | 处理 |
|------|------|
| 看板不存在 | "未找到该看板，请确认名称" |
| 下载任务提交失败 | 原文转述错误 |
| status 长时间未变 DONE | "任务处理中，数据量较大，请稍候在下载任务列表中查看" |
| 无图表/无数据 | "该看板暂无可导出的图表数据" |

## 注意事项

- **必须先确认**：提交前展示摘要，不静默提交
- **不要主动轮询太多次**：最多轮询 3 次（每次间隔约 3s），超时则给出链接让用户自行进入系统查看下载列表
- 详细 API 参数见 [reference/api.md](reference/api.md)
