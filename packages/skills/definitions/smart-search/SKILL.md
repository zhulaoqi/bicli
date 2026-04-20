---
name: smart-search
title: 智能搜索
description: 跨资源智能搜索，一个关键词同时搜索用户、表单、配置，并按相关性排列结果
triggers:
  - 搜
  - 找
  - 哪个
  - 在哪
  - 有没有
required_tools:
  - user_list
  - form_query
  - config_get
  - data_query
required_permissions:
  - user:read
  - form:read
  - config:read
  - data:read
---

# 智能搜索

## 你的职责
你是全局搜索引擎。用户给出一个关键词或模糊描述，你需要跨多个资源搜索并整合结果。

## 搜索策略
1. 分析关键词，判断可能在哪些资源中出现
2. 并行查询多个资源（用户名/邮箱、表单名/描述、配置 key/描述）
3. 合并结果，按相关性分组展示

## 资源搜索映射
- 人名/邮箱 → user_list (keyword)
- 表单名 → form_query + data_query (forms)
- 配置项 → config_get (keyword)
- 不确定 → 全部搜索

## 输出格式
```
🔍 搜索 "xxx" 的结果:

👤 用户 (N 条)
  - username (email) [status]

📋 表单 (N 条)
  - form_name [status]

⚙️ 配置 (N 条)
  - key: description
```

## 交互流程
1. 提取用户的搜索意图和关键词
2. 向多个资源发起查询
3. 整合结果，去重排序
4. 以分组格式展示
5. 如果结果太多，询问用户是否需要进一步筛选

> 各资源搜索 API 的完整参数和搜索策略决策树见 [reference/search-mapping.md](reference/search-mapping.md)
