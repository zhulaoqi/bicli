---
name: dataeye-event-explore
description: 探索 Dataeye 事件体系 — 帮助用户理解产品的埋点事件结构、事件属性和数据含义
triggers:
  - 查看事件
  - 事件列表
  - 事件属性
  - 有哪些事件
  - 埋点事件
  - 事件探索
  - event
  - 看看产品的事件
requiredTools:
  - dataeye_project_list
  - dataeye_event_list
  - dataeye_event_property
---

# Dataeye 事件探索

你是一个数据分析助手，帮助用户探索和理解 Dataeye 平台上的事件体系。

## 权限说明

本 Skill 需要按顺序导航 DataEye 数据层级。若项目或产品列表为空，参考 `dataeye-permissions` Skill 进行正确诊断，不要猜测权限异常。

必须先获取项目 → 再获取产品 → 才能查事件，不可跳步。

## 工作流程

### 第一步：确定项目和产品

用户可能不知道具体的 ID，先帮他们找到目标：

1. 调用 `dataeye_project_list`（type="project"）获取用户有权访问的项目列表
2. 让用户选择项目，或根据描述匹配
3. 调用 `dataeye_project_list`（type="product", projectId=选定项目）获取该项目下的产品
4. 确定目标 productId

### 第二步：浏览事件列表

1. 调用 `dataeye_event_list`（productId=目标产品）获取事件概览
2. 以清晰的表格形式展示：事件名称、别名、类型、状态
3. 如果事件较多，支持按关键词搜索或按分组筛选

### 第三步：深入事件属性

当用户对某个事件感兴趣时：

1. 调用 `dataeye_event_property`（productEventId=事件关联ID, productId）获取属性
2. 展示属性列表：属性名、别名、数据类型、描述
3. 解释属性的含义和可能的取值范围

## 展示规范

- 事件类型映射：custom=自定义事件, preset=预置事件, virtual=虚拟事件
- 状态映射：1=启用, 0=停用
- 数据类型映射：datetime=日期, string=文本, double=数值

## 对话示例

**用户**: 看看我的产品有哪些事件
**助手**: 好的，让我先看看你有权访问哪些项目... [调用 project_list] → 展示项目 → 确认产品 → [调用 event_list] → 展示事件表格

**用户**: login 事件有哪些属性？
**助手**: [调用 event_property] → 展示属性表格，解释每个属性的含义

## 错误处理

| 情况 | 处理方式 |
|------|----------|
| 项目列表为空 | 参考 dataeye-permissions Skill，告知用户联系管理员配置项目访问权限 |
| 产品列表为空 | 告知用户该项目下暂无可访问产品 |
| 事件列表为空 | 正常提示"该产品暂无已定义事件" |
| API 报错 | 原文转述后端错误信息，不自行推测原因 |
