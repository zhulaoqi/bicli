# 命令大全与权限矩阵

## 斜杠命令

| 命令 | 说明 | 参数 |
|------|------|------|
| /help | 显示命令帮助 | — |
| /model | 查看/切换模型 | `/model list`、`/model use <id>` |
| /role | 查看当前角色和权限 | — |
| /tools | 列出可用 MCP 工具 | — |
| /skill | 查看/创建 Skill | `/skill list`、`/skill create <name>` |
| /clear | 清空对话历史 | — |
| /config | 查看运行配置 | — |

## CLI 命令

| 命令 | 说明 |
|------|------|
| `bicli chat` | 启动 TUI 交互模式 |
| `bicli chat -m "消息"` | 单次对话模式 |
| `bicli mcp status` | 查看 MCP 连接状态 |
| `bicli config show` | 显示当前配置 |
| `bicli login --token <t>` | 设置认证 token |
| `bicli logout` | 清除认证信息 |
| `bicli whoami` | 查看当前身份 |
| `bicli web` | 启动 Web GUI |

## TUI 快捷键

| 键 | 功能 |
|----|------|
| ↑ / ↓ | 浏览历史输入 |
| Tab | 斜杠命令自动补全 |
| Esc | 清空当前输入 |
| Ctrl+L | 清屏 |
| Enter | 发送 |

## 权限矩阵

| 资源 | read | write | 说明 |
|------|:----:|:-----:|------|
| user | 查询用户列表 | 创建/更新/删除用户 | 用户管理 |
| form | 查询表单和字段 | 创建/更新/删除表单 | 表单管理 |
| data | 通用查询、聚合统计 | — | 数据读取 |
| config | 查看配置项 | 创建/更新配置 | 系统配置 |
| role | 查看角色权限 | 创建/更新/删除角色 | 角色管理 |

## 内置角色

| 角色 | 权限 |
|------|------|
| admin | 全部 read + write |
| editor | form:r/w, user:r, data:r, config:r |
| viewer | form:r, user:r, data:r, config:r |

## 数据权限层级

1. **功能权限**：角色是否有 `resource:action` 权限 → 决定能否调用工具
2. **行级过滤**：`data_scope_rules` → 决定能看到哪些行
3. **字段级过滤**：`field_scope_rules` → 决定字段显示/隐藏/脱敏
