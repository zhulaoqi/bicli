# DataEye 聊天编排优化设计（去硬分流 + 自动纠偏版）

日期：2026-04-28  
范围：`packages/mcp-server` 聊天编排链路

## 1. 背景

原实现两个结构性问题：

1. 通过关键词正则区分"知识咨询 vs 实时查询"，对口语化表达鲁棒性差，容易误判。
2. 通过 `toolChoice: required` 强压工具调用，会损伤混合意图场景（先问概念再查数据）。

目标是把"分流判断"从硬编码迁移为"模型自主决策 + 证据校验 + 自动纠偏"。

## 2. 设计原则

- 不用关键词正则做最终路由决策。
- 让模型在完整工具集合内自主选择工具（`toolChoice: auto`）。
- 后端只做边界约束：写操作确认、结果证据化、失败纠偏。
- 幻觉探测后先自动纠偏，再降级提示，不直接甩锅给用户。

## 3. 目标架构

### 3.1 能力层（Tools）

- 保持工具全集暴露，不按意图提前裁剪。
- DataEye 帮助技能命中后仅注入知识上下文，不再禁用其他工具。
- `requiredTools` 改为"候选工具提示"，不是"唯一允许工具集合"。

### 3.2 决策层（LLM Orchestration）

- 统一使用 `toolChoice: auto`。
- 模型根据上下文决定是否调用工具、调用哪些工具、调用顺序。

### 3.3 约束层（Guard + AutoRepair）

```
主轮流式响应
  │
  ├─ [fake-tool-call] → text_replace 警告（模型不支持 function calling）
  │
  └─ [无工具调用 + 大量列表（>8项）]
       │
       ├─ text_replace "⏳ 重新查询中..."
       │
       └─ runRepairRound（generateText, toolChoice:required, maxSteps:5）
            ├─ 成功 → 补发 tool_start/result SSE → text_replace 真实结果
            └─ 失败/超时 → text_replace 原有警告
```

## 4. 分阶段实施

### P0（已完成 2026-04-28）

1. 移除关键词硬分流（`skill-routing`）。
2. 移除基于关键词触发的 `toolChoice: required`。
3. 保留现有输出拦截保护机制。
4. 增加单测，确保"命中帮助技能时也不裁剪工具集合"。

### P1（已完成 2026-04-28）

#### 变更文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/chat/response-repair.ts` | 新建 | 自动纠偏模块：`REPAIR_PROMPT_SUFFIX` + `runRepairRound` |
| `src/chat/stream.ts` | 修改 | 幻觉探测块升级为"先自救后降级"流程 |
| `src/chat/system-prompt.ts` | 修改 | 补充"必须调用工具的强制触发规则" |
| `src/chat/__tests__/response-repair.test.ts` | 新建 | repair 模块单测 |

#### runRepairRound 关键设计

- 在 `systemPrompt` 末尾附加 `REPAIR_PROMPT_SUFFIX`（明确告知模型上一轮违规）
- 使用 `generateText`（非流式），`toolChoice: "required"`，`maxSteps: 5`
- 超时保护 25 秒，超时返回 `null`
- 从 `result.steps` 提取 toolCall/toolResult，逆向补发 SSE 事件给前端
- `aiTools` 的 execute 闭包（含 `chart_data` 事件）在修复轮中自动生效

### P2（待实施）

1. 建立真实用户问题评测集（知识、实时、混合、追问、写操作）。
2. 指标化追踪：误拦截率、无证据回答率、纠偏成功率、额外时延。
3. 评测驱动迭代工具描述、返回格式与裁剪策略。

## 5. 验收标准（P0 + P1）

- 不再存在基于关键词的硬分流逻辑。
- 命中帮助技能时，工具集合仍保持完整。
- 幻觉探测触发时，系统先自动重试，而不是直接提示用户。
- 构建通过（tsc exit 0），14 个单测全量通过。

## 6. 风险与回滚

风险：
- 自动纠偏额外增加 1 次 LLM 调用，时延增加约 3~10 秒。
- `toolChoice: auto` 下，个别模型可能减少工具调用频次。

缓解：
- 纠偏失败时立即降级为警告提示，不无限等待。
- 保留现有 Guard 拦截机制作为兜底。
- 使用支持 function calling 的模型作为默认模型。

回滚策略：
- 如线上出现明显回归，可删除 `runRepairRound` 调用，恢复原来的直接 `text_replace` 警告。
- 不建议恢复关键词硬分流，优先推进 P2 评测体系。
