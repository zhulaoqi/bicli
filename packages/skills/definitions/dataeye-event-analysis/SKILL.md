---
name: dataeye-event-analysis
description: DataEye 事件分析向导 — 基于自然语言执行事件趋势/对比/漏斗分析，比 SQL 查询更高层
triggers:
  - 事件趋势
  - 趋势分析
  - 对比分析
  - 漏斗分析
  - 转化率
  - 用户行为分析
  - 事件对比
  - 日活
  - 月活
  - 留存
  - 分析事件
requiredTools:
  - dataeye_project_list
  - dataeye_event_list
  - dataeye_event_analysis
---

# DataEye 事件分析向导

本 Skill 用于“创建/配置/执行一个事件分析、漏斗分析、留存分析”的分析任务，不等同于创建原始埋点或虚拟事件。用户说“创建事件分析”时，应走本 Skill；用户说“创建事件/新增埋点/创建虚拟事件”才走事件管理。

## 与 SQL 查询的区别

| 维度 | 事件分析（本 Skill） | SQL 查询 |
|------|---------------------|---------|
| 使用接口 | `/my-query-event/report` | StarRocks SQL |
| 适用场景 | 标准事件指标分析 | 灵活自定义查询 |
| 复杂度 | LLM 构造结构化参数 | LLM 生成 SQL 字符串 |
| 图表支持 | 原生支持 | 需前端渲染 |

**优先使用事件分析**；当需要跨表 JOIN 或复杂聚合时才使用 SQL 查询。

## 标准分析流程

### 步骤 1：确定目标产品
```
dataeye_project_list(type="project") → 选项目
dataeye_project_list(type="product", projectId=xxx) → 选产品，获取 productId 和 appId
```

### 步骤 2：理解用户意图

| 用户说 | 分析类型 | measures 示例 |
|--------|----------|---------------|
| "最近7天活跃用户数" | event | `[{eventName: "any_event", aggregation: "user_count"}]` |
| "登录事件趋势" | event | `[{eventName: "login", aggregation: "count"}]` |
| "购买转化率" | funnel | measures 包含多个漏斗步骤 |
| "用户注册后7天留存" | retention | 特殊 measures 结构 |
| "各渠道事件对比" | event | measures + groupBy channel |

### 步骤 3：确认事件名

创建或执行事件分析前，必须先确认产品下存在可选事件；不要在未调用工具时直接说“没有埋点信息”。

若用户说"登录事件"但不知道具体事件名：
```
dataeye_event_list(productId=xxx, keyword="login")
→ 找到实际事件名（如 user_login, app_login）
```

如果用户没有给事件名：
```
dataeye_event_list(productId=xxx, pageSize=20)
→ 展示可选事件，让用户选择分析指标
```

### 步骤 4：构造分析参数并执行
```
dataeye_event_analysis({
  productId: xxx,
  appId: "xxx",
  startDate: "2026-04-10",
  endDate: "2026-04-16",
  type: "event",
  measures: [{eventName: "user_login", aggregation: "user_count"}],
  timeUnit: "day"
})
```

### 步骤 5：解读结果
- 以表格或趋势描述展示数据
- 指出关键洞察（最高峰值、最低谷、环比变化等）
- 如需图表，告知用户在完整页面工作台中可视化呈现

## 时间范围快捷表达

| 用户说 | startDate/endDate |
|--------|-------------------|
| 最近7天 | 今天-7天 到 今天 |
| 本周 | 本周一 到 今天 |
| 上周 | 上周一 到 上周日 |
| 本月 | 本月1日 到 今天 |

## 常见错误处理

| 错误 | 处理方式 |
|------|----------|
| appId 未知 | 提示用户查看产品详情，或调 dataeye_project_list 中的产品信息获取 |
| 事件名不存在 | 调 dataeye_event_list 搜索正确名称；返回空只能说明当前产品/关键词下未查到，不要推断没有埋点 |
| 日期格式错误 | 统一转换为 YYYY-MM-DD 格式 |
