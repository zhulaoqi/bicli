---
name: dataeye-knowledge
description: 当用户询问 BiCLI / DataEye / Datart 中的概念、流程、最佳实践、接入说明、术语区别时优先匹配。适用于「事件分析是什么」「定时任务和立即执行的区别」「怎么接入 SDK」「最佳实践是什么」等知识问答。本 skill 仅触发 dataeye_knowledge_search 与 dataeye_concept_explain，不会调用实时业务工具。
triggers:
  - 是什么
  - 什么意思
  - 概念
  - 原理
  - 区别
  - 对比
  - 怎么配置
  - 如何配置
  - 怎么使用
  - 如何使用
  - 流程
  - 步骤
  - 教程
  - 最佳实践
  - 接入
  - 解释一下
  - 帮我看下流程
requiredTools:
  - dataeye_knowledge_search
  - dataeye_concept_explain
---

# DataEye 知识问答 Skill

帮助用户理解 BiCLI / DataEye / Datart 的概念、术语、流程与最佳实践。

## 何时使用

- 用户问"X 是什么 / X 怎么用 / X 和 Y 的区别"。
- 用户希望了解某模块（事件分析、定时任务、看板）的工作原理或接入方式。
- 用户询问"最佳实践 / 推荐配置 / 流程图"等纯知识问题。

> ⚠️ 当用户问题包含具体 ID、时间范围或要求实时查询时，**不要**使用本 skill；请走对应业务 skill（dataeye-event-analysis, datart-schedule, datart-dashboard 等）。

## 推荐工作流

1. **先尝试 `dataeye_concept_explain`**：当用户问的是单一术语（如「漏斗分析」「定时任务」）时，命中静态词典可立即返回结构化解释。
2. **再用 `dataeye_knowledge_search`**：用户问得更宽泛（如「数据视图怎么和图表配合使用」）时，按关键词在知识库中检索相关章节。
3. **不要**调用任何实时业务工具（dataeye_*_execute, dataeye_*_list, datart_*_create 等）。这些工具在 knowledge 路由下已被屏蔽。

## 输出建议

- 优先使用编号步骤或要点列表；
- 涉及流程时使用 Mermaid `flowchart` 或 `stateDiagram` 图；
- 在结尾给出"延伸阅读"指向具体业务 skill（如 `datart-schedule` / `dataeye-event-analysis`）。

## 术语标准

- 概念词典见 `packages/mcp-server/src/tools/knowledge/concepts.ts`。
- 长文档章节来源于本目录所有 SKILL.md 与 `reference/*.md`。
