# Skill Definitions Catalog

## 运行时准入规则

Skill 文件不会因为存在于本目录就一定注入 `/chat`。当前运行时入口是：

- `packages/mcp-server/src/chat/skill-routing.ts`
- `packages/mcp-server/src/chat/system-prompt.ts`

新增或修改 Skill 时必须确认：

1. `name` 是否属于 DataEye 业务域或帮助中心域。
2. `requiredTools` 中的每个工具都已注册到 `packages/mcp-server/src/tools/tool-domain-registry.ts`。
3. 写操作流程是否优先使用 `tier=business` 的业务动作工具。
4. 是否包含信息收集、dryRun 预览、用户确认、执行后验证、错误处理。

## Skill 分类建议

| 类型 | 命名示例 | 作用 |
| --- | --- | --- |
| 帮助知识 | `dataeye-help-*` | 解释概念、操作说明、配置帮助 |
| 业务工作流 | `dataeye-user-onboarding` | 指导模型完成多步业务动作 |
| 资源查询 | `dataeye-event-explore` | 指导模型按业务上下文查询列表/详情 |
| 高风险写操作 | `dataeye-table-import` | 必须通过业务动作工具做 dryRun 和确认 |

## 契约测试

以下测试会阻止 Skill 与 MCP 工具漂移：

- `packages/mcp-server/src/tools/__tests__/skill-tool-contract.test.ts`

如果测试失败，优先判断：

- 是 Skill 写错了工具名。
- 是确实缺少 MCP 工具，需要补 atomic 或 business action。
- 是旧 Skill 不应进入 DataEye 运行时，应调整命名或 requiredTools。
