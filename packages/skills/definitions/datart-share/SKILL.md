---
name: datart-share
description: 为 Datart 看板或图表创建分享链接，支持无需登录访问、密码保护、角色限制等访问模式，并可设置有效期。适用于"帮我分享这个看板"、"生成看板分享链接"、"创建外部访问链接"、"给别人看我的看板"等场景。
triggers:
  - 分享看板
  - 生成分享链接
  - 创建分享
  - 分享链接
  - 外部访问
  - 给别人看
  - 分享图表
  - 公开看板
  - 看板链接
requiredTools:
  - datart_dashboard_list
  - datart_share_create
  - datart_share_list
---

# Datart 看板分享 Skill

帮助用户为看板或图表创建分享链接，配置访问权限和有效期。

## 访问模式说明

| authenticationMode | 说明 | 适用场景 |
|--------------------|------|---------|
| `FREE` | 无需登录，任何人可访问 | 公开报告、外部展示 |
| `CODE` | 需要输入密码 | 有限分享，防止随意访问 |
| `LOGIN` | 必须登录 Datart 账号 | 内部同事 |
| `ROLE` | 仅指定角色可访问 | 权限精细控制 |

默认推荐 **`FREE`**（无密码），如用户提到"加密码"则用 `CODE`。

## 工作流程

### 场景：用户说"帮我分享 [看板名] 的链接"

```
步骤1: datart_dashboard_list() → 找到目标看板 ID

步骤2: 收集分享参数（缺少时询问）：
   - 访问方式：无密码 / 需要密码 / 仅登录用户
   - 有效期：几天后过期（默认 7 天）

步骤3: 展示确认摘要

步骤4: 用户确认 → datart_share_create(...)

步骤5: 构造并返回完整分享 URL
```

### 确认摘要格式

```
准备创建分享链接：

📊 看板：[看板名称]
🔐 访问方式：无需登录（任何人可访问）
⏰ 有效期至：2026-04-23
🔑 访问密码：无

确认创建？
```

### 创建成功后输出

```
✅ 分享链接已创建！

🔗 分享地址：
${DATART_FRONTEND_URL}/shareDashboard/{authorizedToken}

访问方式：无需登录
有效期至：2026-04-23
```

**如有密码，额外显示：**
```
🔑 访问密码：abc123
（请将密码单独告知对方）
```

## 信息收集规则

| 参数 | 默认值 | 何时询问 |
|------|--------|---------|
| 访问方式 | FREE（无密码） | 用户提到"加密"、"私密"时 |
| 有效期 | 7 天后 | 用户提到"长期"、"一个月"等 |
| 密码 | 随机 6 位 | authenticationMode=CODE 时 |
| 指定角色 | 无 | authenticationMode=ROLE 时 |

**如用户没有特殊要求，直接用默认值，不要逐一追问。**

## 查看已有分享

```
步骤1: datart_share_list(vizId=<dashboardId>)
   → 列出该看板下的所有分享链接

步骤2: 展示列表
```

**列表格式：**
```
该看板共有 N 个分享链接：

🔗 链接1  访问方式：无密码  有效期至：2026-05-01  ID: xxx
🔗 链接2  访问方式：需密码  有效期至：2026-04-30  ID: xxx
```

## 错误处理

| 情况 | 处理 |
|------|------|
| 看板不存在 | "未找到该看板，请确认名称" |
| expiryDate 已过期 | "有效期必须是未来时间，请重新输入" |
| 创建失败 | 原文转述错误信息 |

## 注意事项

- **分享 URL 构造**：`${DATART_FRONTEND_URL}/shareDashboard/{authorizedToken}`，`authorizedToken` 来自创建响应的 `ShareToken.authorizedToken`
- **有密码时**：`authenticationCode` 字段传入密码，用户分享时需告知对方
- **expiryDate 格式**：ISO 8601，且必须是未来时间（接口有 `@Future` 校验）
- 详细 API 参数见 [reference/api.md](reference/api.md)
