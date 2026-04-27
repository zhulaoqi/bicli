# BiCLI 一期实施计划 — UX 升级 + 整页工作台

> **Goal:** 把抽屉面板体验做到产品级（3 档宽度 / 浮球拖拽 / 无遮罩并排），并交付 `/bicli/chat/:sessionId` 独立整页工作台（SSE 流式 + 会话持久化 + 模型切换 + 5 个核心 slash 命令 + 右侧预览栏）。
>
> **Architecture:** 三层改动 — ① dataeye-frontend 的抽屉和新整页路由；② BiCLI MCP Server 新增 `/chat/stream` SSE + `/session/*` + `/chat/models`；③ BiCLI MySQL 新增 sessions/messages 两张表。共享 sessionId 打通抽屉和整页。
>
> **Tech Stack:** React 17 + antd 4 + styled-components / Express + MCP SDK + Drizzle ORM / MySQL 8 / Vercel AI SDK / SSE / ECharts（复用 dataeye 现有）/ react-markdown + shiki。
>
> **决策依据：** 基于 `2026-04-16-bicli-fullpage-design.md` 第 14、19 节用户拍板的 11 个决策点。

---

## 0. 非目标（本期不做）

明确列出，避免 scope creep：

- ❌ `@` 引用上下文（项目/事件/表）— 移至 P2
- ❌ 消息分叉、分享链接、导出 Markdown — P2
- ❌ 命令面板 `cmd+K`（cmdk 库）— P2，P1 只实现 slash 菜单
- ❌ 虚拟滚动（react-virtuoso）— 等单会话 > 200 条再加
- ❌ Token 速率徽章 / 配额横幅 — P2
- ❌ 浮球"双击点选业务元素"— P3
- ❌ 移动端 < 768 的底部 sheet 适配 — P2（dataeye 目前只做桌面）

---

## 1. 文件结构规划

### BiCLI MCP Server 新增/修改

```
packages/mcp-server/src/
├── db/
│   └── schema.ts                   [修改] 新增 sessions, messages 表
├── http-server.ts                  [修改] 新增 /chat/stream, /session/*, /chat/models
├── chat/
│   ├── stream.ts                   [新建] SSE 流式编排，替代 http-server 里的 chatWithTools
│   ├── session-store.ts            [新建] 会话 CRUD
│   ├── models-registry.ts          [新建] 可用模型清单构建
│   └── system-prompt.ts            [新建] 从 http-server 抽出
```

### dataeye-frontend 新增/修改

```
src/app/pages/
├── MainPage/Layout/
│   ├── BiCLIPanel.tsx              [修改] 3 档宽度切换 + 无遮罩开关 + 全屏按钮
│   └── BiCLIFloatButton.tsx        [新建] 从 BiCLIPanel 拆出，支持拖拽/右键菜单/隐藏
├── BiCLIWorkbench/                 [新建] 整页工作台
│   ├── index.tsx                   路由入口
│   ├── Workbench.tsx               三栏布局
│   ├── api.ts                      调 BiCLI MCP 的封装
│   ├── hooks/
│   │   ├── useChatStream.ts        SSE 封装
│   │   ├── useSession.ts           会话加载/切换
│   │   └── useHotkeys.ts
│   ├── Sidebar/
│   │   ├── index.tsx
│   │   └── SessionList.tsx
│   ├── Chat/
│   │   ├── index.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx
│   │   ├── ToolTimeline.tsx
│   │   ├── Composer.tsx
│   │   ├── SlashMenu.tsx
│   │   ├── ModelPicker.tsx
│   │   ├── StarterCards.tsx
│   │   └── FollowUps.tsx
│   ├── Preview/
│   │   ├── index.tsx
│   │   ├── ChartTab.tsx
│   │   ├── SqlTab.tsx
│   │   └── DataTab.tsx
│   └── Topbar.tsx
└── index.tsx                       [修改] 挂 /bicli 路由

src/utils/
└── bicliStore.ts                   [新建] localStorage 偏好（宽度/浮球位置/遮罩）
```

### 文档

```
docs/
├── 2026-04-16-bicli-fullpage-plan.md   [本文件]
├── getting-started.md                  [修改] 新增整页入口说明
└── dataeye-integration-whitepaper.md   [修改] 附加整页工作台集成章节
```

---

## Chunk 1：紧急 UX 升级（抽屉面板）

> **目标**：不依赖后端改动，今天就能上线的前端改进。预计 2-3 小时。

### Task 1.1：宽度偏好持久化 Store

**Files:**
- Create: `dataeye-frontend/src/utils/bicliStore.ts`

- [ ] **写 localStorage 读写工具**

```ts
const KEY = 'bicli_prefs_v1';

export interface BiCLIPrefs {
  panelSize: 'S' | 'M' | 'L';          // 420 / 560 / 720
  noMask: boolean;                     // 是否无遮罩并排
  fabPos: { edge: 'left' | 'right'; y: number };
  fabHidden: boolean;                  // 是否折叠成边缘条
}

const DEFAULT: BiCLIPrefs = {
  panelSize: 'M',
  noMask: false,
  fabPos: { edge: 'right', y: window.innerHeight - 200 },
  fabHidden: false,
};

export function loadPrefs(): BiCLIPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function savePrefs(prefs: Partial<BiCLIPrefs>) {
  const cur = loadPrefs();
  localStorage.setItem(KEY, JSON.stringify({ ...cur, ...prefs }));
}

export const PANEL_WIDTHS = { S: 420, M: 560, L: 720 } as const;
```

- [ ] **Commit**

```
git add src/utils/bicliStore.ts
git commit -m "feat(bicli): add preferences store for panel width / FAB position"
```

---

### Task 1.2：抽屉 3 档宽度切换 + 无遮罩开关

**Files:**
- Modify: `dataeye-frontend/src/app/pages/MainPage/Layout/BiCLIPanel.tsx`

- [ ] **Step 1：顶部增加尺寸 / 遮罩 / 全屏三组按钮**

把 `DrawerHeader` 里的 `HeaderActions` 扩充：

```tsx
import { CompressOutlined, ColumnWidthOutlined, ExpandAltOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { loadPrefs, savePrefs, PANEL_WIDTHS } from 'utils/bicliStore';

const [prefs, setPrefs] = useState(loadPrefs);
const updatePref = (p: Partial<typeof prefs>) => {
  const next = { ...prefs, ...p };
  setPrefs(next);
  savePrefs(p);
};

<HeaderActions>
  <Tooltip title="紧凑"><Button type={prefs.panelSize === 'S' ? 'primary' : 'text'} size="small" icon={<CompressOutlined />} onClick={() => updatePref({ panelSize: 'S' })} /></Tooltip>
  <Tooltip title="中等"><Button type={prefs.panelSize === 'M' ? 'primary' : 'text'} size="small" icon={<ColumnWidthOutlined />} onClick={() => updatePref({ panelSize: 'M' })} /></Tooltip>
  <Tooltip title="宽松"><Button type={prefs.panelSize === 'L' ? 'primary' : 'text'} size="small" icon={<ExpandAltOutlined />} onClick={() => updatePref({ panelSize: 'L' })} /></Tooltip>
  <Divider type="vertical" />
  <Tooltip title={prefs.noMask ? '点击启用遮罩' : '点击并排显示'}>
    <Button type="text" size="small" icon={prefs.noMask ? <UnlockOutlined /> : <LockOutlined />} onClick={() => updatePref({ noMask: !prefs.noMask })} />
  </Tooltip>
  <Tooltip title="全屏工作台">
    <Button type="text" size="small" icon={<FullscreenOutlined />} onClick={openFullpage} />
  </Tooltip>
  <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearMessages} />
</HeaderActions>
```

- [ ] **Step 2：Drawer 接入动态宽度 + mask 开关**

```tsx
<Drawer
  placement="right"
  width={PANEL_WIDTHS[prefs.panelSize]}
  mask={!prefs.noMask}
  maskClosable={true}
  {/* 其它原样 */}
>
```

- [ ] **Step 3：消息气泡微调（圆角、留白、背景色）**

在 styled-components 里：

```ts
const MessagesContainer = styled.div`
  background: #fafbfc;
  padding: 16px;
  /* ... */
`;
const MessageContent = styled.div<{ role: string }>`
  border-radius: 12px;
  padding: 12px 16px;
  line-height: 1.6;
  /* ... */
`;
```

- [ ] **Step 4：新增跳整页函数（先留空，整页路由 Chunk 3 建好再联）**

```tsx
const openFullpage = () => {
  window.open('/bicli/chat', '_blank', 'noopener');
};
```

- [ ] **Step 5：手测**
  - 打开抽屉，点三档按钮，宽度切换正确，刷新后记忆
  - 点遮罩按钮，业务页可交互，再点回来恢复
  - 全屏按钮先跳 404（整页没做），但不报错即可

- [ ] **Commit**

```
git add src/app/pages/MainPage/Layout/BiCLIPanel.tsx
git commit -m "feat(bicli): add panel size switcher + mask-less mode + fullpage entry"
```

---

### Task 1.3：浮球拆出独立组件 + 拖拽

**Files:**
- Create: `dataeye-frontend/src/app/pages/MainPage/Layout/BiCLIFloatButton.tsx`
- Modify: `dataeye-frontend/src/app/pages/MainPage/Layout/BiCLIPanel.tsx`（移除原 FloatingButton）

- [ ] **Step 1：建文件、骨架**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components/macro';
import { Badge, Dropdown, Menu, Tooltip } from 'antd';
import { RobotOutlined, LeftOutlined, RightOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { loadPrefs, savePrefs } from 'utils/bicliStore';

interface Props {
  hasUnread?: boolean;
  onClick: () => void;
}

const DRAG_THRESHOLD = 5;
const SAFE_TOP = 64;
const SAFE_BOTTOM = 80;

const BiCLIFloatButton: React.FC<Props> = ({ hasUnread, onClick }) => {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(prefs.fabPos);
  const downRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const movedRef = useRef(false);

  // 拖拽
  const onPointerDown = (e: React.PointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    movedRef.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!downRef.current) return;
    const dx = e.clientX - downRef.current.x;
    const dy = e.clientY - downRef.current.y;
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    movedRef.current = true;
    setDragging(true);
    const y = Math.max(SAFE_TOP, Math.min(window.innerHeight - SAFE_BOTTOM, e.clientY - 24));
    const edge: 'left' | 'right' = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
    setPos({ edge, y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!downRef.current) return;
    const distance = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
    if (distance < DRAG_THRESHOLD) {
      onClick();
    } else {
      savePrefs({ fabPos: pos });
      setPrefs(p => ({ ...p, fabPos: pos }));
    }
    setDragging(false);
    downRef.current = null;
  };

  // Window resize 时吸附到最新边缘、Y 超限
  useEffect(() => {
    const onResize = () => {
      setPos(p => ({
        ...p,
        y: Math.max(SAFE_TOP, Math.min(window.innerHeight - SAFE_BOTTOM, p.y)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 隐藏模式渲染边缘条
  if (prefs.fabHidden) {
    return (
      <EdgeHandle
        style={{ [pos.edge]: 0, top: pos.y } as any}
        onClick={() => {
          savePrefs({ fabHidden: false });
          setPrefs(p => ({ ...p, fabHidden: false }));
        }}
      >
        <RobotOutlined />
      </EdgeHandle>
    );
  }

  // 右键菜单
  const menu = (
    <Menu
      onClick={({ key }) => {
        if (key === 'left' || key === 'right') {
          const next = { edge: key as 'left' | 'right', y: pos.y };
          setPos(next);
          savePrefs({ fabPos: next });
        } else if (key === 'hide') {
          savePrefs({ fabHidden: true });
          setPrefs(p => ({ ...p, fabHidden: true }));
        }
      }}
      items={[
        { key: 'left', icon: <LeftOutlined />, label: '固定到左侧' },
        { key: 'right', icon: <RightOutlined />, label: '固定到右侧' },
        { type: 'divider' },
        { key: 'hide', icon: <EyeInvisibleOutlined />, label: '折叠为边缘条' },
      ]}
    />
  );

  return (
    <Dropdown overlay={menu} trigger={['contextMenu']}>
      <Ball
        $dragging={dragging}
        style={{ [pos.edge]: 24, top: pos.y } as any}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Badge dot={hasUnread}>
          <RobotOutlined style={{ fontSize: 24, color: '#fff' }} />
        </Badge>
      </Ball>
    </Dropdown>
  );
};

export default BiCLIFloatButton;

const Ball = styled.div<{ $dragging: boolean }>`
  position: fixed;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: ${p => (p.$dragging ? '0 8px 24px rgba(0,0,0,.3)' : '0 4px 12px rgba(0,0,0,.15)')};
  cursor: ${p => (p.$dragging ? 'grabbing' : 'grab')};
  opacity: ${p => (p.$dragging ? 0.7 : 1)};
  transition: ${p => (p.$dragging ? 'none' : 'all 0.2s ease-out')};
  z-index: 990;
  touch-action: none;
  user-select: none;
  &:hover { transform: scale(1.05); }
`;

const EdgeHandle = styled.div`
  position: fixed;
  width: 6px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px 0 0 3px;
  z-index: 990;
  cursor: pointer;
  &:hover {
    width: 32px;
    padding: 4px;
    color: #fff;
    text-align: center;
  }
`;
```

- [ ] **Step 2：BiCLIPanel.tsx 里替换原 FloatingButton**

删除原 `FloatingButton` styled + 其 JSX 用法，改为：

```tsx
import BiCLIFloatButton from './BiCLIFloatButton';

// 渲染（visible 打开时不渲染浮球）
{!visible && <BiCLIFloatButton hasUnread={false} onClick={() => setVisible(true)} />}
```

- [ ] **Step 3：手测**
  - 按住浮球拖到屏幕中间 → 松开自动贴边
  - 拖到左边 → 贴左；右边 → 贴右
  - 刷新 → 位置记忆
  - 右键 → 菜单出现，选"固定到左侧"即跳
  - 选"折叠为边缘条" → 变成细条，点细条恢复
  - 打开面板 → 浮球消失；关闭面板 → 浮球恢复
  - 缩小窗口 → Y 自动压回可视区域

- [ ] **Commit**

```
git add src/app/pages/MainPage/Layout/BiCLIFloatButton.tsx src/app/pages/MainPage/Layout/BiCLIPanel.tsx
git commit -m "feat(bicli): draggable floating button with snap-to-edge + right-click menu"
```

---

## Chunk 2：后端会话持久化 + SSE 流式

> **目标**：给前端准备好真正能支撑整页的后端接口。预计 1 天。

### Task 2.1：数据库 schema

**Files:**
- Modify: `bicli/packages/mcp-server/src/db/schema.ts`

- [ ] **Step 1：新增 sessions 和 session_messages 表**

```ts
import { mysqlTable, varchar, int, json, text, timestamp, index } from 'drizzle-orm/mysql-core';

export const sessions = mysqlTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  orgId: varchar('org_id', { length: 64 }),
  title: varchar('title', { length: 200 }).notNull().default('新对话'),
  model: varchar('model', { length: 64 }).notNull().default('qwen-plus'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().onUpdateNow(),
}, (t) => ({
  userIdx: index('idx_sess_user').on(t.userId, t.updatedAt),
}));

export const sessionMessages = mysqlTable('session_messages', {
  id: int('id').autoincrement().primaryKey(),
  sessionId: varchar('session_id', { length: 64 }).notNull(),
  role: varchar('role', { length: 16 }).notNull(),         // user | assistant | system | tool
  content: text('content').notNull(),
  toolCalls: json('tool_calls'),                           // [{name, args, result, duration, status}]
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  sessionIdx: index('idx_msg_session').on(t.sessionId, t.id),
}));
```

> `userId` 设计为 `varchar(64)` 而非 `int`，是因为 dataeye 的 user.id 是 `varchar(32)`。本地 local-adapter 下它存数字字符串。

- [ ] **Step 2：推表**

```bash
cd /Users/zhujinqi/Documents/javacode/yeahmobi/bicli
pnpm db:push
```

Expected：MySQL 里出现 `sessions` 和 `session_messages` 两张新表。

- [ ] **Commit**

```
git add packages/mcp-server/src/db/schema.ts
git commit -m "feat(db): add sessions + session_messages tables"
```

---

### Task 2.2：会话 CRUD 模块

**Files:**
- Create: `bicli/packages/mcp-server/src/chat/session-store.ts`

- [ ] **实现**

```ts
import { eq, desc, and } from 'drizzle-orm';
import { sessions, sessionMessages } from '../db/schema.js';

export interface SessionRecord {
  id: string;
  userId: string;
  orgId?: string;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{ name: string; args: unknown; result?: unknown; duration?: number; status: string }>;
  createdAt: Date;
}

export class SessionStore {
  constructor(private db: any) {}

  async create(userId: string, orgId: string | undefined, model: string): Promise<SessionRecord> {
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.db.insert(sessions).values({ id, userId: String(userId), orgId, model, title: '新对话' });
    return this.get(id) as unknown as Promise<SessionRecord>;
  }

  async list(userId: string, limit = 50): Promise<SessionRecord[]> {
    return this.db.select().from(sessions)
      .where(eq(sessions.userId, String(userId)))
      .orderBy(desc(sessions.updatedAt))
      .limit(limit);
  }

  async get(id: string): Promise<SessionRecord | null> {
    const rows = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async getMessages(sessionId: string): Promise<MessageRecord[]> {
    return this.db.select().from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(sessionMessages.id);
  }

  async addMessage(sessionId: string, msg: Omit<MessageRecord, 'id' | 'sessionId' | 'createdAt'>): Promise<void> {
    await this.db.insert(sessionMessages).values({
      sessionId,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls ?? null,
    });
    await this.db.update(sessions).set({ updatedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    await this.db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
  }

  async updateModel(sessionId: string, model: string): Promise<void> {
    await this.db.update(sessions).set({ model }).where(eq(sessions.id, sessionId));
  }

  async delete(id: string, userId: string): Promise<void> {
    await this.db.delete(sessionMessages).where(eq(sessionMessages.sessionId, id));
    await this.db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, String(userId))));
  }
}
```

- [ ] **Commit**

```
git commit -m "feat(chat): session store with CRUD + message persistence"
```

---

### Task 2.3：系统提示词 + 模型解析模块抽取

**Files:**
- Create: `bicli/packages/mcp-server/src/chat/system-prompt.ts`
- Create: `bicli/packages/mcp-server/src/chat/models-registry.ts`

- [ ] **system-prompt.ts**：从 `http-server.ts` 把 `buildSystemPrompt` 搬过来，并添加 follow-up 指令

```ts
export function buildSystemPrompt(
  identity: { userId: string | number; role: string; orgId?: string },
  permissions: string[],
  tools: Array<{ name: string; description: string }>,
): string {
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return `你是 DataEye AI 助手，嵌入在数据分析平台中。

当前用户: ID=${identity.userId}, 角色=${identity.role}, 组织=${identity.orgId || 'unknown'}
用户权限: ${permissions.join(', ')}

可用工具:
${toolList}

规则:
1. 所有工具调用自动注入用户身份和 token，你无需处理权限
2. 使用中文回复
3. 数据查询先用 dataeye_project_list 确定项目，再用具体工具
4. SQL 查询先用 dataeye_datasource_list 获取 sourceId
5. 在每次回复的最后一段，用独立一行输出 3 个建议的后续问题，格式严格如下（不要多余说明）：
__FOLLOWUPS__["建议1","建议2","建议3"]__END__
`;
}
```

> `__FOLLOWUPS__...__END__` 是约定的魔法串，前端解析并剥离后再渲染。

- [ ] **models-registry.ts**

```ts
export interface ModelOption {
  id: string;
  name: string;
  provider: 'alibaba' | 'openai' | 'anthropic' | 'custom';
  tags: string[];           // ['推荐','快','贵','视觉']
  supportsTools: boolean;
  available: boolean;       // 当前环境是否配置了对应 Key
}

export function listModels(): ModelOption[] {
  const out: ModelOption[] = [];
  const hasAli = !!process.env.ALIBABA_API_KEY;
  const hasOAI = !!process.env.OPENAI_API_KEY;
  const hasCus = !!(process.env.CUSTOM_API_URL && process.env.CUSTOM_API_KEY);

  out.push({ id: 'qwen-turbo', name: '千问 Turbo', provider: 'alibaba', tags: ['快','免费'], supportsTools: true, available: hasAli });
  out.push({ id: 'qwen-plus',  name: '千问 Plus (推荐)', provider: 'alibaba', tags: ['推荐'], supportsTools: true, available: hasAli });
  out.push({ id: 'qwen-max',   name: '千问 Max', provider: 'alibaba', tags: ['最强','慢'], supportsTools: true, available: hasAli });

  if (hasOAI) {
    out.push({ id: 'gpt-4o',      name: 'GPT-4o',      provider: 'openai', tags: ['视觉'],   supportsTools: true, available: true });
    out.push({ id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', tags: ['便宜'],   supportsTools: true, available: true });
  }

  if (hasCus) {
    out.push({
      id: process.env.CUSTOM_MODEL || 'custom',
      name: `自定义: ${process.env.CUSTOM_MODEL || 'custom'}`,
      provider: 'custom',
      tags: ['自建'],
      supportsTools: true,
      available: true,
    });
  }

  return out.filter(m => m.available);
}
```

- [ ] **Commit**

```
git commit -m "feat(chat): extract system-prompt + model registry modules"
```

---

### Task 2.4：SSE 流式编排模块

**Files:**
- Create: `bicli/packages/mcp-server/src/chat/stream.ts`

> **重点**：**不再手写 OpenAI-compatible HTTP**，改用 `@bicli/core` 的 `createModel` + Vercel AI SDK `streamText`（和 CLI 保持同一条路径）。

- [ ] **实现**

```ts
import { streamText, stepCountIs, type LanguageModel } from 'ai';
import { createModel } from '@bicli/core';
import type { Response } from 'express';
import type { SessionStore } from './session-store.js';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any, context: any) => Promise<any>;
}

export async function handleChatStream(params: {
  res: Response;
  sessionId: string;
  userMessage: string;
  model: string;
  provider: 'alibaba' | 'openai' | 'anthropic' | 'custom';
  systemPrompt: string;
  history: Array<{ role: string; content: string }>;
  tools: ToolDef[];
  context: { userId: string | number; role: string; orgId?: string; token: string };
  store: SessionStore;
}) {
  const { res, sessionId, userMessage, model, provider, systemPrompt, history, tools, context, store } = params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  await store.addMessage(sessionId, { role: 'user', content: userMessage });

  const customCfg = provider === 'custom' ? {
    endpoint: process.env.CUSTOM_API_URL!,
    apiKey:   process.env.CUSTOM_API_KEY!,
    modelId:  process.env.CUSTOM_MODEL || model,
  } : undefined;

  const llm: LanguageModel = createModel(provider as any, model, customCfg);

  const aiTools = Object.fromEntries(tools.map(t => [t.name, {
    description: t.description,
    parameters: t.inputSchema,
    execute: async (args: any) => t.handler(args, context),
  }]));

  try {
    const result = streamText({
      model: llm,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: userMessage }] as any,
      tools: aiTools,
      stopWhen: stepCountIs(8),
    });

    let fullText = '';
    const toolStart: Record<string, number> = {};
    const recordedCalls: Array<{ name: string; args: unknown; result?: unknown; duration?: number; status: string }> = [];

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullText += part.text;
          send('text_delta', { content: part.text });
          break;
        case 'tool-call':
          toolStart[part.toolCallId] = Date.now();
          send('tool_start', { id: part.toolCallId, name: part.toolName, args: part.input });
          recordedCalls.push({ name: part.toolName, args: part.input, status: 'running' });
          break;
        case 'tool-result': {
          const duration = Date.now() - (toolStart[part.toolCallId] || 0);
          send('tool_result', { id: part.toolCallId, name: part.toolName, result: part.output, duration });
          const rec = recordedCalls.find(r => r.name === part.toolName && r.status === 'running');
          if (rec) { rec.result = part.output; rec.duration = duration; rec.status = 'done'; }
          break;
        }
        case 'error':
          send('error', { message: String(part.error) });
          break;
      }
    }

    const { clean, followUps } = extractFollowUps(fullText);
    if (followUps.length) send('follow_ups', { questions: followUps });

    await store.addMessage(sessionId, {
      role: 'assistant',
      content: clean,
      toolCalls: recordedCalls.length ? recordedCalls : undefined,
    });

    send('done', { sessionId });
    res.end();
  } catch (e: any) {
    send('error', { message: e?.message || String(e) });
    res.end();
  }
}

function extractFollowUps(text: string): { clean: string; followUps: string[] } {
  const m = text.match(/__FOLLOWUPS__(\[[\s\S]*?\])__END__/);
  if (!m) return { clean: text, followUps: [] };
  try {
    const arr = JSON.parse(m[1]);
    return { clean: text.replace(m[0], '').trim(), followUps: Array.isArray(arr) ? arr.slice(0, 3) : [] };
  } catch {
    return { clean: text.replace(m[0], '').trim(), followUps: [] };
  }
}
```

- [ ] **Commit**

```
git commit -m "feat(chat): SSE streaming orchestration via @bicli/core + ai-sdk"
```

---

### Task 2.5：HTTP 端点对接

**Files:**
- Modify: `bicli/packages/mcp-server/src/http-server.ts`

- [ ] **Step 1：引入新模块 + 初始化 SessionStore**

在 `main()` 里：

```ts
import { SessionStore } from './chat/session-store.js';
import { handleChatStream } from './chat/stream.js';
import { listModels } from './chat/models-registry.js';
import { buildSystemPrompt } from './chat/system-prompt.js';

const store = new SessionStore(db);
```

- [ ] **Step 2：新增 `/chat/models`**

```ts
app.get('/chat/models', (req, res) => {
  res.json({ models: listModels() });
});
```

- [ ] **Step 3：新增 `/session/*`**

```ts
app.post('/session/create', async (req, res) => {
  const identity = await resolveIdentityFromReq(req, adapter);
  if (!identity) return res.status(401).json({ error: 'unauthorized' });
  const model = (req.body?.model as string) || 'qwen-plus';
  const s = await store.create(String(identity.userId), identity.orgId, model);
  res.json(s);
});

app.get('/session/list', async (req, res) => {
  const identity = await resolveIdentityFromReq(req, adapter);
  if (!identity) return res.status(401).json({ error: 'unauthorized' });
  const list = await store.list(String(identity.userId), 50);
  res.json({ sessions: list });
});

app.get('/session/:id', async (req, res) => {
  const identity = await resolveIdentityFromReq(req, adapter);
  if (!identity) return res.status(401).json({ error: 'unauthorized' });
  const s = await store.get(req.params.id);
  if (!s || s.userId !== String(identity.userId)) return res.status(404).json({ error: 'not found' });
  const messages = await store.getMessages(s.id);
  res.json({ session: s, messages });
});

app.delete('/session/:id', async (req, res) => {
  const identity = await resolveIdentityFromReq(req, adapter);
  if (!identity) return res.status(401).json({ error: 'unauthorized' });
  await store.delete(req.params.id, String(identity.userId));
  res.json({ ok: true });
});
```

`resolveIdentityFromReq` 提炼成小辅助：

```ts
async function resolveIdentityFromReq(req: express.Request, adapter: any) {
  const token = extractBearerToken(req);
  if (!token) return null;
  try { return await adapter.resolveIdentity({ type: 'token', token }); }
  catch { return null; }
}
```

- [ ] **Step 4：新增 `/chat/stream`**

```ts
app.post('/chat/stream', async (req, res) => {
  const identity = await resolveIdentityFromReq(req, adapter);
  if (!identity) return res.status(401).json({ error: 'unauthorized' });

  const { sessionId, message, model } = req.body as { sessionId: string; message: string; model?: string };
  const session = await store.get(sessionId);
  if (!session || session.userId !== String(identity.userId)) return res.status(404).json({ error: 'session not found' });

  if (model && model !== session.model) await store.updateModel(sessionId, model);
  const usedModel = model || session.model;
  const provider = guessProvider(usedModel);

  const permissions = await adapter.getPermissions(identity.role);
  await initToolHandlers();
  const tools = toolDefCache;
  const systemPrompt = buildSystemPrompt(identity, permissions, tools);
  const history = (await store.getMessages(sessionId)).map(m => ({ role: m.role, content: m.content }));
  const token = extractBearerToken(req)!;

  await handleChatStream({
    res, sessionId, userMessage: message, model: usedModel, provider,
    systemPrompt, history, tools,
    context: { userId: identity.userId, role: identity.role, orgId: identity.orgId, token },
    store,
  });
});

function guessProvider(model: string): 'alibaba' | 'openai' | 'anthropic' | 'custom' {
  if (model.startsWith('qwen')) return 'alibaba';
  if (model.startsWith('gpt')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  return 'custom';
}
```

- [ ] **Step 5：保留老 `/chat` 为兼容**（抽屉目前用的是这个），不动它，但在顶部注释标记 deprecated。后面抽屉重构时再切到 `/chat/stream`。

- [ ] **Step 6：curl 冒烟**

```bash
TOKEN=eyJh...
# 1. 模型列表
curl http://127.0.0.1:3211/chat/models | jq

# 2. 新建会话
SID=$(curl -s -X POST http://127.0.0.1:3211/session/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-plus"}' | jq -r .id)

# 3. 流式问
curl -N -X POST http://127.0.0.1:3211/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SID\",\"message\":\"你好\"}"
```

期望：
- 模型列表至少含 `qwen-plus`
- 会话创建返回 `{id: "sess_xxx"}`
- 流式请求看到一连串 `event: text_delta` / `event: done`

- [ ] **Commit**

```
git commit -m "feat(http): add /chat/stream (SSE), /session CRUD, /chat/models"
```

---

## Chunk 3：前端整页工作台

> **目标**：交付 `/bicli/chat/:sessionId` 整页工作台可用版本。预计 2-3 天。

### Task 3.1：路由 + 骨架

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/index.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Workbench.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/api.ts`
- Modify: `dataeye-frontend/src/app/index.tsx`（或相应路由表）

- [ ] **Step 1：注册路由 `/bicli` 和 `/bicli/chat/:sessionId?`**

用户登录后才能访问，复用 `LoginAuthRoute`。

- [ ] **Step 2：api.ts —— 调 `/bicli-mcp/*` 的所有接口**

```ts
const BASE = '/bicli-mcp';

export async function listModels() {
  const r = await fetch(`${BASE}/chat/models`);
  return (await r.json()).models;
}

export async function createSession(model: string, token: string) {
  const r = await fetch(`${BASE}/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ model }),
  });
  return r.json();
}

export async function listSessions(token: string) {
  const r = await fetch(`${BASE}/session/list`, { headers: { Authorization: `Bearer ${token}` } });
  return (await r.json()).sessions;
}

export async function getSession(id: string, token: string) {
  const r = await fetch(`${BASE}/session/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

export async function deleteSession(id: string, token: string) {
  await fetch(`${BASE}/session/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}
```

- [ ] **Step 3：Workbench.tsx 布局骨架**

```tsx
<Topbar />
<Body>
  <Sidebar />
  <Chat />
  <Preview />  {/* 有结果才显示 */}
</Body>
<StatusBar />
```

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): route + layout skeleton"
```

---

### Task 3.2：useChatStream SSE Hook

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useChatStream.ts`

- [ ] **实现**

```ts
export interface StreamState {
  streaming: boolean;
  text: string;
  toolCalls: Array<{ id: string; name: string; args: any; result?: any; duration?: number; status: 'running' | 'done' | 'error' }>;
  followUps: string[];
  error?: string;
}

export function useChatStream() {
  const [state, setState] = useState<StreamState>({ streaming: false, text: '', toolCalls: [], followUps: [] });
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (params: { sessionId: string; message: string; model?: string; token: string; onDone?: () => void }) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ streaming: true, text: '', toolCalls: [], followUps: [] });

    try {
      const resp = await fetch('/bicli-mcp/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.token}` },
        body: JSON.stringify({ sessionId: params.sessionId, message: params.message, model: params.model }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const raw of events) {
          const lines = raw.split('\n');
          const evt = lines.find(l => l.startsWith('event: '))?.slice(7);
          const data = lines.find(l => l.startsWith('data: '))?.slice(6);
          if (!evt || !data) continue;
          const payload = JSON.parse(data);
          setState(s => applyEvent(s, evt, payload));
          if (evt === 'done') params.onDone?.();
        }
      }
    } catch (e: any) {
      setState(s => ({ ...s, streaming: false, error: e.message }));
    } finally {
      setState(s => ({ ...s, streaming: false }));
    }
  }, []);

  const abort = useCallback(() => abortRef.current?.abort(), []);
  return { state, send, abort };
}

function applyEvent(s: StreamState, evt: string, d: any): StreamState {
  switch (evt) {
    case 'text_delta':  return { ...s, text: s.text + d.content };
    case 'tool_start':  return { ...s, toolCalls: [...s.toolCalls, { id: d.id, name: d.name, args: d.args, status: 'running' }] };
    case 'tool_result': return { ...s, toolCalls: s.toolCalls.map(t => t.id === d.id ? { ...t, result: d.result, duration: d.duration, status: 'done' } : t) };
    case 'follow_ups':  return { ...s, followUps: d.questions };
    case 'done':        return { ...s, streaming: false };
    case 'error':       return { ...s, streaming: false, error: d.message };
    default: return s;
  }
}
```

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): SSE useChatStream hook"
```

---

### Task 3.3：消息流 + 工具时间轴

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageList.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/MessageItem.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/ToolTimeline.tsx`

- [ ] **要点**
  - `MessageItem` 用 `react-markdown` + `rehype-highlight`（或 `shiki`，体积大可选 `prism-react-renderer`）
  - 悬停消息右上角出现 `[复制] [重试] [编辑]`
  - 流式时最后一条 assistant 消息末尾追加光标 `▋`
  - 代码块 ` ``` ` 未闭合时只显示纯文本
  - `ToolTimeline`：每个工具一行，状态 `⟳ 调用中... → ✓ 耗时 120ms` / `✗ 失败`

- [ ] **安装依赖**

```bash
cd /Users/zhujinqi/Documents/javacode/yeahmobi/dataeye-frontend
pnpm add react-markdown rehype-highlight remark-gfm
```

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): message list + tool timeline"
```

---

### Task 3.4：输入框 + Slash 菜单 + 模型胶囊

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/Composer.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/SlashMenu.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/ModelPicker.tsx`

- [ ] **Slash 命令 5 个**：`/help /new /clear /model /retry`

```ts
const COMMANDS = [
  { cmd: '/help',   label: '显示命令帮助' },
  { cmd: '/new',    label: '开新会话' },
  { cmd: '/clear',  label: '清空当前会话' },
  { cmd: '/model',  label: '切换模型' },
  { cmd: '/retry',  label: '重跑上一条' },
];
```

输入框第一个字符是 `/` 时，**绝对定位浮层在输入框上方**显示 COMMANDS，支持方向键 + Enter。

- [ ] **ModelPicker**：输入框右下角胶囊，下拉从 `/chat/models` 拿列表，按 provider 分组渲染。切换时调 `/session/:id`（用 PATCH 或在下次 `/chat/stream` 带 `model` 参数自动更新）。

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): composer with slash menu + model picker"
```

---

### Task 3.5：Starter 卡片 + follow-up

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/StarterCards.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Chat/FollowUps.tsx`

- [ ] **StarterCards**：空会话时渲染 4 张卡

```ts
const STARTERS = [
  { icon: '📈', title: '7天概览',  prompt: '查看我有权限的所有项目最近7天的DAU变化' },
  { icon: '🔍', title: '事件漏斗', prompt: '帮我分析登录→注册→首次付费的转化漏斗' },
  { icon: '🗄', title: '数据表速查', prompt: '列出我能访问的所有数据表，按更新时间排序' },
  { icon: '📝', title: '自定义SQL', prompt: '' },  // 点击聚焦输入框
];
```

- [ ] **FollowUps**：流式 `state.followUps` 有值时，在输入框上方渲染 3 个可点胶囊，点击即发送。

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): starter cards + follow-ups"
```

---

### Task 3.6：Sidebar 会话列表

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Sidebar/index.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Sidebar/SessionList.tsx`

- [ ] **要点**
  - 顶部 "+ 新会话" 按钮
  - 按更新时间倒序，按日期分组（今天 / 昨天 / 本周 / 更早）
  - 当前会话高亮
  - 右键单项：重命名 / 删除
  - 响应路由：点击切换 `/bicli/chat/:sessionId`

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): session sidebar with date grouping"
```

---

### Task 3.7：右侧预览栏（有内容才展开）

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Preview/index.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Preview/ChartTab.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Preview/SqlTab.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Preview/DataTab.tsx`

- [ ] **触发**：监听 `toolCalls` 里最后一个 `name === 'dataeye_sql_query'` 且 `status === 'done'` 的调用

- [ ] **图表智能推断**（简化版）

```ts
function inferChart(rows: any[]): 'line' | 'bar' | 'pie' | 'table' {
  if (!rows?.length) return 'table';
  const keys = Object.keys(rows[0]);
  if (keys.length < 2) return 'table';
  const isTime = (v: any) => /^\d{4}-\d{2}/.test(String(v));
  if (isTime(rows[0][keys[0]])) return 'line';
  if (rows.length <= 10) return 'pie';
  return 'bar';
}
```

- [ ] **SqlTab**：`<pre>` + `shiki` 或 `prism-react-renderer` 高亮，"复制 SQL" + "在 SQL 编辑器中打开" 跳 `/dataAnalysis/sql-editor` 并预填

- [ ] **DataTab**：antd `Table` 渲染 + `导出 CSV` 按钮

- [ ] **ChartTab**：复用 dataeye 现有 ECharts 封装

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): preview panel with chart/sql/data tabs"
```

---

### Task 3.8：Topbar + StatusBar + 快捷键

**Files:**
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/Topbar.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/StatusBar.tsx`
- Create: `dataeye-frontend/src/app/pages/BiCLIWorkbench/hooks/useHotkeys.ts`

- [ ] **Topbar**：标题 + 当前组织 + 模型选择下拉 + 设置按钮
- [ ] **StatusBar**：`🟢 已连接 / sessionId: xxx / 权限: analyst`
- [ ] **快捷键**：安装 `react-hotkeys-hook`，注册 `Cmd+L`（聚焦输入框）/ `Cmd+Shift+N`（新会话）/ `Esc`（中断流）/ `Cmd+B`（切 Sidebar）

- [ ] **Commit**

```
git commit -m "feat(bicli-workbench): topbar + statusbar + hotkeys"
```

---

### Task 3.9：抽屉 → 整页跳转联通

**Files:**
- Modify: `dataeye-frontend/src/app/pages/MainPage/Layout/BiCLIPanel.tsx`

- [ ] **Step 1**：抽屉打开时也维护一个 sessionId（首次调 `/session/create`），`openFullpage` 时带上：

```ts
const openFullpage = () => {
  window.open(`/bicli/chat/${panelSessionId}`, '_blank', 'noopener');
};
```

- [ ] **Step 2**：整页打开时 `useParams().sessionId` 若存在就 `getSession` 加载历史，不然创建新会话。

- [ ] **Step 3**：抽屉也切到 `/chat/stream` 协议（删掉老的 `/chat` 调用），统一 UX。

- [ ] **Commit**

```
git commit -m "feat(bicli): unify drawer and fullpage via sessionId + SSE"
```

---

## Chunk 4：验收 + 文档

### Task 4.1：端到端验证清单

- [ ] **环境准备**：BiCLI MCP 跑 `pnpm dev:mcp-http`，dataeye 后端跑 9010，前端 `pnpm start`
- [ ] **抽屉冒烟**
  - 点浮球 → 抽屉出
  - 3 档宽度切换生效 + 刷新记忆
  - 遮罩切换生效
  - 浮球拖动 + 贴边 + 右键菜单 + 折叠为边缘条
- [ ] **整页冒烟**
  - 抽屉点"全屏 ⤢" → 新 tab 打开 `/bicli/chat/xxx`
  - 左侧显示会话列表
  - 空会话显示 4 张 starter 卡
  - 点卡 → 自动填充输入框
  - 问"列出我有哪些项目" → 流式字符逐个出现 + 工具时间轴显示 `dataeye_project_list` 调用
  - 问"查昨天每小时 DAU" → 自动链式调用 3 个工具 + 最后触发右侧预览栏（折线图 / SQL Tab / 数据 Tab）
  - 输入 `/` → slash 菜单浮出
  - 输入 `/help` → 显示帮助
  - 输入 `/new` → 开新会话
  - 输入 `/model` → 打开模型选择
  - 模型切换 → 再发消息用新模型
  - 答复末尾出现 3 个 follow-up 胶囊，点击即发送
  - `Esc` 中断流式
  - 刷新页面 → 会话历史保留
  - admin / analyst 两个账号在同一提问下可见数据不同
- [ ] **列一张权限差异表**，记录 2 个账号各自问"列出我有哪些项目"的返回，截图存证

### Task 4.2：文档更新

- [ ] **修改** `docs/getting-started.md`：新增"整页工作台"章节，含路由、快捷键、命令清单
- [ ] **修改** `docs/dataeye-integration-whitepaper.md`：附录添加前端嵌入工作台的接入说明
- [ ] **更新** `docs/BiCLI集成本地测试指南.md`：加一节"整页工作台"测试步骤

---

## 依赖清单（一次性装好）

### BiCLI 侧（已经都有，无需新增）

### dataeye-frontend 侧新增

```bash
cd /Users/zhujinqi/Documents/javacode/yeahmobi/dataeye-frontend
pnpm add react-markdown rehype-highlight remark-gfm react-hotkeys-hook
# 可选（P2 再考虑）：
# pnpm add cmdk shiki react-virtuoso
```

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Vercel AI SDK 对千问/custom provider 兼容性 | Task 2.4 先单独写个 `scripts/test-sdk-compat.ts` 快速验证三家 provider 都能 streamText 出工具调用 |
| SSE 在 nginx 代理下被缓存 | craco devServer proxy 默认不缓存；生产需 nginx 加 `proxy_buffering off` |
| Monaco / shiki 打包体积暴涨 | P1 用轻量 `prism-react-renderer` 代替 |
| 多会话并发时 SessionStore 竞争 | MySQL 自带行级锁 + 单条 `updatedAt` 更新没有事务需求 |
| `_context.token` 泄漏到消息 | `addMessage` 里 `content` 纯文本，toolCalls args 序列化时过滤 `_context` 字段 |

---

## 时间预估

| Chunk | 预估 | 累计 |
|-------|------|------|
| Chunk 1（UX） | 2-3h | 半天 |
| Chunk 2（后端） | 1d | 1.5d |
| Chunk 3（前端整页） | 2-3d | 4-4.5d |
| Chunk 4（验收 + 文档） | 0.5d | 4.5-5d |

---

## 执行建议

建议按 Chunk 串行，每个 Chunk 完成后停下来：

1. 跑一下对应冒烟
2. 给你过一眼截图/视频
3. 你反馈后再开下一 Chunk

不建议一口气做完，因为前端量大，出错概率高，分段回流比 debug 总体快。

Ready to execute?
