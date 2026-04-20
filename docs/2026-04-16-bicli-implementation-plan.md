# BiCLI 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 AI 驱动的终端工具平台，包含 MCP Server（11 个工具）、Skills（3 个默认 Skill）和 CLI（TUI + 多模型适配）三个子项目。

**Architecture:** pnpm monorepo，三个包独立运行。CLI 作为 MCP Client 通过 stdio 连接 MCP Server，Skills 提供结构化知识注入 LLM System Prompt。

**Tech Stack:** Node.js 22, TypeScript 6.0, pnpm 10, Ink 7, Commander 14, Drizzle ORM, MySQL 8, Vercel AI SDK 6, Vitest 4

**Spec:** `docs/2026-04-16-bicli-system-design.md`

---

## 技术选型版本锁定

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | `>=22.0.0` | 运行时（Ink 7 + Commander 14 要求） |
| pnpm | `>=10.0.0` | 包管理器 |
| TypeScript | `~6.0.2` | 编译器 |
| `@modelcontextprotocol/sdk` | `^1.29.0` | MCP 协议 SDK |
| `ink` | `^7.0.0` | TUI 渲染（React for CLI） |
| `react` | `^19.2.0` | Ink 7 依赖 |
| `commander` | `^14.0.3` | CLI 命令框架 |
| `drizzle-orm` | `^0.45.2` | ORM |
| `drizzle-kit` | `^0.31.10` | 数据库迁移工具 |
| `mysql2` | `^3.21.0` | MySQL 驱动 |
| `ai` | `^6.0.140` | Vercel AI SDK 核心 |
| `@ai-sdk/openai` | `^3.0.53` | OpenAI Provider |
| `@ai-sdk/anthropic` | `^3.0.69` | Anthropic Provider |
| `@ai-sdk/alibaba` | `^1.0.17` | 阿里千问 Provider |
| `gray-matter` | `^4.0.3` | YAML frontmatter 解析 |
| `tsx` | `^4.21.0` | TypeScript 执行器（开发用） |
| `vitest` | `^4.1.4` | 测试框架 |
| `zod` | `^3.24.0` | Schema 校验（MCP Tool inputSchema） |
| `dotenv` | `^16.4.0` | 环境变量加载 |

---

## Chunk 1: Monorepo 基础搭建

### Task 1: 初始化 monorepo 根目录

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: 初始化 pnpm 项目**

```bash
cd /Users/zhujinqi/Documents/javacode/yeahmobi/bicli
pnpm init
```

- [ ] **Step 2: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: 创建根 package.json**

```json
{
  "name": "bicli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  },
  "scripts": {
    "dev:mcp": "pnpm --filter @bicli/mcp-server dev",
    "dev:cli": "pnpm --filter @bicli/cli dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "seed": "pnpm --filter @bicli/mcp-server seed",
    "db:migrate": "pnpm --filter @bicli/mcp-server db:migrate",
    "db:push": "pnpm --filter @bicli/mcp-server db:push"
  }
}
```

- [ ] **Step 4: 创建 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 5: 创建 .env.example**

```env
# MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=bicli

# LLM API Keys (至少配置一个)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
DASHSCOPE_API_KEY=
```

- [ ] **Step 6: 创建 .gitignore**

```
node_modules/
dist/
.env
*.tsbuildinfo
.turbo/
coverage/
```

- [ ] **Step 7: 创建 .npmrc**

```
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 8: 安装根级开发依赖**

```bash
pnpm add -Dw typescript@~6.0.2 tsx@^4.21.0 vitest@^4.1.4
```

- [ ] **Step 9: 初始化 git 并提交**

```bash
git init
git add .
git commit -m "chore: init monorepo with pnpm workspace"
```

---

### Task 2: 搭建 @bicli/mcp-server 包骨架

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/drizzle.config.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p packages/mcp-server/src/{tools,resources,prompts,db,auth,types}
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "@bicli/mcp-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "bicli-mcp-server": "./dist/index.js"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "seed": "tsx src/db/seed.ts",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: 安装依赖**

```bash
cd packages/mcp-server
pnpm add @modelcontextprotocol/sdk@^1.29.0 drizzle-orm@^0.45.2 mysql2@^3.21.0 zod@^3.24.0 dotenv@^16.4.0
pnpm add -D drizzle-kit@^0.31.10
cd ../..
```

- [ ] **Step 5: 创建入口占位文件 src/index.ts**

```typescript
#!/usr/bin/env node
console.log("@bicli/mcp-server starting...");
```

- [ ] **Step 6: 创建 drizzle.config.ts**

```typescript
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME || "bicli",
  },
});
```

- [ ] **Step 7: 提交**

```bash
git add packages/mcp-server
git commit -m "chore: scaffold @bicli/mcp-server package"
```

---

### Task 3: 搭建 @bicli/skills 包骨架

**Files:**
- Create: `packages/skills/package.json`
- Create: `packages/skills/tsconfig.json`
- Create: `packages/skills/src/index.ts`
- Create: `packages/skills/src/parser.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p packages/skills/{src,definitions}
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "@bicli/skills",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: 安装依赖**

```bash
cd packages/skills
pnpm add gray-matter@^4.0.3
cd ../..
```

- [ ] **Step 5: 创建占位文件**

`packages/skills/src/index.ts`:
```typescript
export { parseSkill, loadAllSkills } from "./parser.js";
export type { Skill } from "./parser.js";
```

`packages/skills/src/parser.ts`:
```typescript
export interface Skill {
  name: string;
  title: string;
  description: string;
  triggers: string[];
  requiredTools: string[];
  requiredPermissions: string[];
  content: string;
}

export function parseSkill(raw: string): Skill {
  throw new Error("Not implemented");
}

export function loadAllSkills(definitionsDir: string): Skill[] {
  throw new Error("Not implemented");
}
```

- [ ] **Step 6: 提交**

```bash
git add packages/skills
git commit -m "chore: scaffold @bicli/skills package"
```

---

### Task 4: 搭建 @bicli/cli 包骨架

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/bin/bicli.ts`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p packages/cli/{src/{tui,commands,llm/providers,mcp-client,skill-loader,config},bin}
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "@bicli/cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "bicli": "./bin/bicli.ts"
  },
  "scripts": {
    "dev": "tsx bin/bicli.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*", "bin/**/*"]
}
```

- [ ] **Step 4: 安装依赖**

```bash
cd packages/cli
pnpm add commander@^14.0.3 ink@^7.0.0 react@^19.2.0 @modelcontextprotocol/sdk@^1.29.0 ai@^6.0.140 @ai-sdk/openai@^3.0.53 @ai-sdk/anthropic@^3.0.69 @ai-sdk/alibaba@^1.0.17 @bicli/skills@workspace:* dotenv@^16.4.0 zod@^3.24.0
pnpm add -D @types/react@^19.0.0
cd ../..
```

- [ ] **Step 5: 创建入口文件**

`packages/cli/bin/bicli.ts`:
```typescript
#!/usr/bin/env tsx
import { main } from "../src/index.js";
main(process.argv);
```

`packages/cli/src/index.ts`:
```typescript
export function main(argv: string[]) {
  console.log("bicli v1.0.0");
}
```

- [ ] **Step 6: 验证 monorepo 依赖安装**

```bash
pnpm install
```

Expected: 所有依赖成功安装，无冲突。

- [ ] **Step 7: 提交**

```bash
git add packages/cli
git commit -m "chore: scaffold @bicli/cli package"
```

---

## Chunk 2: MCP Server — 数据库与权限

### Task 5: 数据库 Schema 定义（Drizzle）

**Files:**
- Create: `packages/mcp-server/src/db/schema.ts`
- Create: `packages/mcp-server/src/db/connection.ts`
- Create: `packages/mcp-server/src/types/index.ts`
- Test: `packages/mcp-server/src/db/__tests__/schema.test.ts`

- [ ] **Step 1: 写测试 — schema 导出验证**

`packages/mcp-server/src/db/__tests__/schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { users, roles, rolePermissions, forms, formFields, configs } from "../schema.js";

describe("Database Schema", () => {
  it("should export all 6 table definitions", () => {
    expect(users).toBeDefined();
    expect(roles).toBeDefined();
    expect(rolePermissions).toBeDefined();
    expect(forms).toBeDefined();
    expect(formFields).toBeDefined();
    expect(configs).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/mcp-server
pnpm vitest run src/db/__tests__/schema.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: 实现 schema.ts**

`packages/mcp-server/src/db/schema.ts`:
```typescript
import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  json,
  mysqlEnum,
  serial,
} from "drizzle-orm/mysql-core";

export const roles = mysqlTable("roles", {
  id: serial().primaryKey(),
  name: varchar({ length: 50 }).unique().notNull(),
  description: varchar({ length: 200 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = mysqlTable("users", {
  id: serial().primaryKey(),
  username: varchar({ length: 50 }).unique().notNull(),
  email: varchar({ length: 100 }).unique().notNull(),
  roleId: int("role_id")
    .references(() => roles.id)
    .notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const rolePermissions = mysqlTable("role_permissions", {
  id: serial().primaryKey(),
  roleId: int("role_id")
    .references(() => roles.id)
    .notNull(),
  permission: varchar({ length: 50 }).notNull(),
  resource: varchar({ length: 50 }).notNull(),
});

export const forms = mysqlTable("forms", {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  description: text(),
  createdBy: int("created_by")
    .references(() => users.id)
    .notNull(),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const formFields = mysqlTable("form_fields", {
  id: serial().primaryKey(),
  formId: int("form_id")
    .references(() => forms.id)
    .notNull(),
  label: varchar({ length: 100 }).notNull(),
  type: mysqlEnum("type", ["text", "email", "number", "select", "date", "textarea"]).notNull(),
  fieldOrder: int("field_order").notNull(),
  required: boolean().default(false).notNull(),
  validation: json(),
  options: json(),
});

export const configs = mysqlTable("configs", {
  id: serial().primaryKey(),
  key: varchar({ length: 100 }).unique().notNull(),
  value: json().notNull(),
  description: varchar({ length: 200 }),
  updatedBy: int("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run src/db/__tests__/schema.test.ts
```
Expected: PASS

- [ ] **Step 5: 实现 connection.ts**

`packages/mcp-server/src/db/connection.ts`:
```typescript
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function getDb() {
  if (db) return db;

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "bicli",
  });

  db = drizzle(pool, { schema, mode: "default" });
  return db;
}

export type Database = Awaited<ReturnType<typeof getDb>>;
```

- [ ] **Step 6: 实现类型定义**

`packages/mcp-server/src/types/index.ts`:
```typescript
export interface ToolContext {
  userId: number;
  role: string;
}

export interface ToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

export type WhereCondition =
  | string
  | number
  | boolean
  | { $in: (string | number)[] }
  | { $like: string }
  | { $gte?: number | string; $lte?: number | string };

export type WhereClause = Record<string, WhereCondition>;

export const TABLE_PERMISSION_MAP: Record<string, string> = {
  users: "user:read",
  forms: "form:read",
  form_fields: "form:read",
  configs: "config:read",
};

export const ALLOWED_DATA_TABLES = ["users", "forms", "form_fields", "configs"] as const;
export type AllowedDataTable = (typeof ALLOWED_DATA_TABLES)[number];
```

- [ ] **Step 7: 提交**

```bash
git add .
git commit -m "feat(mcp-server): add database schema and connection"
```

---

### Task 6: 数据库迁移与 Mock 数据

**Files:**
- Create: `packages/mcp-server/src/db/seed.ts`
- Create: `packages/mcp-server/src/db/migrate.ts`

- [ ] **Step 1: 生成迁移文件**

```bash
cd packages/mcp-server
pnpm db:generate
```
Expected: `drizzle/` 目录下生成 SQL 迁移文件

- [ ] **Step 2: 实现 seed.ts**

`packages/mcp-server/src/db/seed.ts`:
```typescript
import "dotenv/config";
import { getDb } from "./connection.js";
import { roles, rolePermissions, users, forms, formFields, configs } from "./schema.js";

async function seed() {
  const db = await getDb();
  console.log("Seeding database...");

  // 清理现有数据（按外键顺序）
  await db.delete(formFields);
  await db.delete(forms);
  await db.delete(configs);
  await db.delete(users);
  await db.delete(rolePermissions);
  await db.delete(roles);

  // 1. 角色
  const [adminRole] = await db.insert(roles).values({ name: "admin", description: "系统管理员，拥有全部权限" }).$returningId();
  const [editorRole] = await db.insert(roles).values({ name: "editor", description: "编辑者，可管理表单和查看数据" }).$returningId();
  const [viewerRole] = await db.insert(roles).values({ name: "viewer", description: "观察者，仅可查看数据" }).$returningId();

  // 2. 角色权限
  const allPermissions = [
    "user:read", "user:write", "form:read", "form:write",
    "data:read", "config:read", "config:write", "role:read", "role:write",
  ];
  const editorPermissions = ["user:read", "form:read", "form:write", "data:read", "config:read"];
  const viewerPermissions = ["user:read", "form:read", "data:read", "config:read"];

  for (const perm of allPermissions) {
    const [resource, action] = perm.split(":");
    await db.insert(rolePermissions).values({ roleId: adminRole.id, permission: perm, resource });
  }
  for (const perm of editorPermissions) {
    const [resource] = perm.split(":");
    await db.insert(rolePermissions).values({ roleId: editorRole.id, permission: perm, resource });
  }
  for (const perm of viewerPermissions) {
    const [resource] = perm.split(":");
    await db.insert(rolePermissions).values({ roleId: viewerRole.id, permission: perm, resource });
  }

  // 3. 用户（10个）
  const userValues = [
    { username: "admin", email: "admin@bicli.dev", roleId: adminRole.id, status: "active" as const },
    { username: "alice", email: "alice@bicli.dev", roleId: adminRole.id, status: "active" as const },
    { username: "bob", email: "bob@bicli.dev", roleId: editorRole.id, status: "active" as const },
    { username: "carol", email: "carol@bicli.dev", roleId: editorRole.id, status: "active" as const },
    { username: "dave", email: "dave@bicli.dev", roleId: editorRole.id, status: "active" as const },
    { username: "eve", email: "eve@bicli.dev", roleId: viewerRole.id, status: "active" as const },
    { username: "frank", email: "frank@bicli.dev", roleId: viewerRole.id, status: "active" as const },
    { username: "grace", email: "grace@bicli.dev", roleId: viewerRole.id, status: "active" as const },
    { username: "heidi", email: "heidi@bicli.dev", roleId: viewerRole.id, status: "inactive" as const },
    { username: "ivan", email: "ivan@bicli.dev", roleId: viewerRole.id, status: "inactive" as const },
  ];
  const insertedUsers = [];
  for (const u of userValues) {
    const [result] = await db.insert(users).values(u).$returningId();
    insertedUsers.push(result);
  }

  // 4. 表单（3个）
  const [form1] = await db.insert(forms).values({
    name: "员工入职登记表", description: "新员工入职时填写的基本信息登记表",
    createdBy: insertedUsers[0].id, status: "published",
  }).$returningId();

  const [form2] = await db.insert(forms).values({
    name: "客户反馈表", description: "收集客户对产品和服务的反馈意见",
    createdBy: insertedUsers[2].id, status: "published",
  }).$returningId();

  const [form3] = await db.insert(forms).values({
    name: "请假申请表", description: "员工请假审批流程表单",
    createdBy: insertedUsers[0].id, status: "draft",
  }).$returningId();

  // 5. 表单字段
  await db.insert(formFields).values([
    { formId: form1.id, label: "姓名", type: "text", fieldOrder: 1, required: true, validation: { minLength: 2, maxLength: 20 } },
    { formId: form1.id, label: "邮箱", type: "email", fieldOrder: 2, required: true },
    { formId: form1.id, label: "部门", type: "select", fieldOrder: 3, required: true, options: [{ label: "技术部", value: "tech" }, { label: "产品部", value: "product" }, { label: "市场部", value: "marketing" }] },
    { formId: form1.id, label: "入职日期", type: "date", fieldOrder: 4, required: true },
    { formId: form1.id, label: "备注", type: "textarea", fieldOrder: 5, required: false },
  ]);

  await db.insert(formFields).values([
    { formId: form2.id, label: "客户姓名", type: "text", fieldOrder: 1, required: true },
    { formId: form2.id, label: "评分", type: "number", fieldOrder: 2, required: true, validation: { min: 1, max: 10 } },
    { formId: form2.id, label: "反馈类型", type: "select", fieldOrder: 3, required: true, options: [{ label: "功能建议", value: "feature" }, { label: "Bug报告", value: "bug" }, { label: "服务体验", value: "service" }] },
    { formId: form2.id, label: "详细描述", type: "textarea", fieldOrder: 4, required: false },
  ]);

  await db.insert(formFields).values([
    { formId: form3.id, label: "请假类型", type: "select", fieldOrder: 1, required: true, options: [{ label: "年假", value: "annual" }, { label: "病假", value: "sick" }, { label: "事假", value: "personal" }] },
    { formId: form3.id, label: "开始日期", type: "date", fieldOrder: 2, required: true },
    { formId: form3.id, label: "结束日期", type: "date", fieldOrder: 3, required: true },
    { formId: form3.id, label: "请假原因", type: "textarea", fieldOrder: 4, required: true },
  ]);

  // 6. 系统配置
  await db.insert(configs).values([
    { key: "site.name", value: "BiCLI Demo", description: "站点名称", updatedBy: insertedUsers[0].id },
    { key: "site.language", value: "zh-CN", description: "默认语言", updatedBy: insertedUsers[0].id },
    { key: "user.default_role", value: "viewer", description: "新用户默认角色", updatedBy: insertedUsers[0].id },
    { key: "form.max_fields", value: 50, description: "单个表单最大字段数", updatedBy: insertedUsers[0].id },
    { key: "system.version", value: "1.0.0", description: "系统版本号", updatedBy: insertedUsers[0].id },
  ]);

  console.log("Seed completed successfully!");
  console.log(`  - ${3} roles with permissions`);
  console.log(`  - ${userValues.length} users`);
  console.log(`  - ${3} forms with fields`);
  console.log(`  - ${5} config entries`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: 推送 Schema 到数据库并填充数据**

```bash
pnpm db:push
pnpm seed
```
Expected: 输出 "Seed completed successfully!" 及数据统计

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat(mcp-server): add database migration and seed data"
```

---

### Task 7: RBAC 权限模块

**Files:**
- Create: `packages/mcp-server/src/auth/rbac.ts`
- Test: `packages/mcp-server/src/auth/__tests__/rbac.test.ts`

- [ ] **Step 1: 写测试**

`packages/mcp-server/src/auth/__tests__/rbac.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPermission, extractContext, getUserPermissions } from "../rbac.js";

describe("RBAC", () => {
  describe("extractContext", () => {
    it("should extract _context from tool arguments", () => {
      const args = { name: "test", _context: { userId: 1, role: "admin" } };
      const { context, cleanArgs } = extractContext(args);
      expect(context).toEqual({ userId: 1, role: "admin" });
      expect(cleanArgs).toEqual({ name: "test" });
    });

    it("should throw if _context is missing", () => {
      expect(() => extractContext({ name: "test" })).toThrow("Missing _context");
    });
  });

  describe("checkPermission", () => {
    it("should return true when permission is in the list", () => {
      const permissions = ["user:read", "form:read"];
      expect(checkPermission(permissions, "user:read")).toBe(true);
    });

    it("should return false when permission is not in the list", () => {
      const permissions = ["user:read"];
      expect(checkPermission(permissions, "user:write")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm vitest run src/auth/__tests__/rbac.test.ts
```
Expected: FAIL

- [ ] **Step 3: 实现 rbac.ts**

`packages/mcp-server/src/auth/rbac.ts`:
```typescript
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { rolePermissions, roles, users } from "../db/schema.js";
import type { ToolContext } from "../types/index.js";

export function extractContext(args: Record<string, unknown>): {
  context: ToolContext;
  cleanArgs: Record<string, unknown>;
} {
  const { _context, ...cleanArgs } = args;
  if (!_context || typeof _context !== "object") {
    throw new Error("Missing _context in tool arguments");
  }
  const ctx = _context as Record<string, unknown>;
  if (typeof ctx.userId !== "number" || typeof ctx.role !== "string") {
    throw new Error("Invalid _context: requires userId (number) and role (string)");
  }
  return {
    context: { userId: ctx.userId, role: ctx.role },
    cleanArgs,
  };
}

export function checkPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes(required);
}

export function checkPermissions(userPermissions: string[], required: string[]): boolean {
  return required.every((p) => userPermissions.includes(p));
}

export async function getUserPermissions(db: Database, roleId: number): Promise<string[]> {
  const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
  if (!role) return [];

  const perms = await db.query.rolePermissions.findMany({
    where: eq(rolePermissions.roleId, roleId),
  });
  return perms.map((p) => p.permission);
}

export async function resolveUserPermissions(
  db: Database,
  context: ToolContext
): Promise<string[]> {
  const user = await db.query.users.findFirst({ where: eq(users.id, context.userId) });
  if (!user) throw new Error(`User ${context.userId} not found`);
  return getUserPermissions(db, user.roleId);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run src/auth/__tests__/rbac.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat(mcp-server): implement RBAC permission module"
```

---

## Chunk 3: MCP Server — 11 个 Tools

### Task 8: Tool 基础设施 + 用户管理工具

**Files:**
- Create: `packages/mcp-server/src/tools/base.ts`
- Create: `packages/mcp-server/src/tools/user-list.ts`
- Create: `packages/mcp-server/src/tools/user-manage.ts`
- Test: `packages/mcp-server/src/tools/__tests__/user-tools.test.ts`

- [ ] **Step 1: 实现 Tool 基础设施 base.ts**

`packages/mcp-server/src/tools/base.ts`:
```typescript
import type { ToolResponse, ToolContext } from "../types/index.js";
import { extractContext, resolveUserPermissions, checkPermissions } from "../auth/rbac.js";
import type { Database } from "../db/connection.js";

export function formatSuccess<T>(data: T, meta?: ToolResponse["meta"]) {
  const response: ToolResponse<T> = { success: true, data };
  if (meta) response.meta = meta;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response) }],
  };
}

export function formatError(code: string, message: string) {
  const response: ToolResponse = { success: false, error: { code, message } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(response) }],
    isError: true,
  };
}

export async function withAuth(
  db: Database,
  args: Record<string, unknown>,
  requiredPermissions: string[],
  handler: (db: Database, cleanArgs: Record<string, unknown>, context: ToolContext) => Promise<ReturnType<typeof formatSuccess>>
) {
  try {
    const { context, cleanArgs } = extractContext(args);
    const userPerms = await resolveUserPermissions(db, context);
    if (!checkPermissions(userPerms, requiredPermissions)) {
      return formatError(
        "PERMISSION_DENIED",
        `需要权限: ${requiredPermissions.join(", ")}，当前角色 ${context.role} 不具备`
      );
    }
    return await handler(db, cleanArgs, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return formatError("INTERNAL_ERROR", message);
  }
}
```

- [ ] **Step 2: 实现 user-list.ts**

`packages/mcp-server/src/tools/user-list.ts`:
```typescript
import { z } from "zod";
import { eq, like, and, sql } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { users, roles } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const userListSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  role_id: z.number().optional(),
  keyword: z.string().optional(),
  page: z.number().default(1),
  pageSize: z.number().default(20),
});

export async function userList(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["user:read"], async (db, cleanArgs) => {
    const input = userListSchema.parse(cleanArgs);
    const conditions = [];

    if (input.status) conditions.push(eq(users.status, input.status));
    if (input.role_id) conditions.push(eq(users.roleId, input.role_id));
    if (input.keyword) {
      conditions.push(
        like(users.username, `%${input.keyword}%`)
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [data, countResult] = await Promise.all([
      db.select().from(users).where(where).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(users).where(where),
    ]);

    return formatSuccess(data, {
      total: countResult[0].count,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
}
```

- [ ] **Step 3: 实现 user-manage.ts**

`packages/mcp-server/src/tools/user-manage.ts`:
```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { users } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const userManageSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  userId: z.number().optional(),
  data: z.object({
    username: z.string().optional(),
    email: z.string().optional(),
    role_id: z.number().optional(),
    status: z.enum(["active", "inactive"]).optional(),
  }).optional(),
});

export async function userManage(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["user:write"], async (db, cleanArgs) => {
    const input = userManageSchema.parse(cleanArgs);

    switch (input.action) {
      case "create": {
        if (!input.data?.username || !input.data?.email || !input.data?.role_id) {
          return formatError("VALIDATION_ERROR", "创建用户需要 username, email, role_id");
        }
        const [result] = await db.insert(users).values({
          username: input.data.username,
          email: input.data.email,
          roleId: input.data.role_id,
          status: input.data.status || "active",
        }).$returningId();
        const created = await db.query.users.findFirst({ where: eq(users.id, result.id) });
        return formatSuccess(created);
      }
      case "update": {
        if (!input.userId) return formatError("VALIDATION_ERROR", "更新用户需要 userId");
        const updateData: Record<string, unknown> = {};
        if (input.data?.username) updateData.username = input.data.username;
        if (input.data?.email) updateData.email = input.data.email;
        if (input.data?.role_id) updateData.roleId = input.data.role_id;
        if (input.data?.status) updateData.status = input.data.status;
        await db.update(users).set(updateData).where(eq(users.id, input.userId));
        const updated = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
        return formatSuccess(updated);
      }
      case "delete": {
        if (!input.userId) return formatError("VALIDATION_ERROR", "删除用户需要 userId");
        await db.delete(users).where(eq(users.id, input.userId));
        return formatSuccess({ deleted: true, userId: input.userId });
      }
    }
  });
}
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat(mcp-server): implement user management tools"
```

---

### Task 9: 表单引擎工具

**Files:**
- Create: `packages/mcp-server/src/tools/form-create.ts`
- Create: `packages/mcp-server/src/tools/form-manage.ts`
- Create: `packages/mcp-server/src/tools/form-query.ts`

- [ ] **Step 1: 实现 form-create.ts**

`packages/mcp-server/src/tools/form-create.ts`:
```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { forms, formFields } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const formCreateSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(z.object({
    label: z.string(),
    type: z.enum(["text", "email", "number", "select", "date", "textarea"]),
    required: z.boolean().default(false),
    validation: z.record(z.unknown()).optional(),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  })),
});

export async function formCreate(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["form:write"], async (db, cleanArgs, context) => {
    const input = formCreateSchema.parse(cleanArgs);

    const [result] = await db.insert(forms).values({
      name: input.name,
      description: input.description,
      createdBy: context.userId,
      status: "draft",
    }).$returningId();

    if (input.fields.length > 0) {
      await db.insert(formFields).values(
        input.fields.map((f, i) => ({
          formId: result.id,
          label: f.label,
          type: f.type,
          fieldOrder: i + 1,
          required: f.required,
          validation: f.validation || null,
          options: f.options || null,
        }))
      );
    }

    const form = await db.query.forms.findFirst({ where: eq(forms.id, result.id) });
    const fields = await db.query.formFields.findMany({ where: eq(formFields.formId, result.id) });

    return formatSuccess({ ...form, fields });
  });
}
```

- [ ] **Step 2: 实现 form-manage.ts**

`packages/mcp-server/src/tools/form-manage.ts`:
```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { forms, formFields } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const formManageSchema = z.object({
  action: z.enum(["update", "delete"]),
  formId: z.number(),
  data: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  }).optional(),
});

export async function formManage(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["form:write"], async (db, cleanArgs) => {
    const input = formManageSchema.parse(cleanArgs);

    switch (input.action) {
      case "update": {
        const updateData: Record<string, unknown> = {};
        if (input.data?.name) updateData.name = input.data.name;
        if (input.data?.description) updateData.description = input.data.description;
        if (input.data?.status) updateData.status = input.data.status;
        await db.update(forms).set(updateData).where(eq(forms.id, input.formId));
        const updated = await db.query.forms.findFirst({ where: eq(forms.id, input.formId) });
        return formatSuccess(updated);
      }
      case "delete": {
        await db.delete(formFields).where(eq(formFields.formId, input.formId));
        await db.delete(forms).where(eq(forms.id, input.formId));
        return formatSuccess({ deleted: true, formId: input.formId });
      }
    }
  });
}
```

- [ ] **Step 3: 实现 form-query.ts**

`packages/mcp-server/src/tools/form-query.ts`:
```typescript
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { forms, formFields } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const formQuerySchema = z.object({
  formId: z.number().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  page: z.number().default(1),
  pageSize: z.number().default(20),
});

export async function formQuery(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["form:read"], async (db, cleanArgs) => {
    const input = formQuerySchema.parse(cleanArgs);

    if (input.formId) {
      const form = await db.query.forms.findFirst({ where: eq(forms.id, input.formId) });
      if (!form) return formatSuccess(null);
      const fields = await db.query.formFields.findMany({
        where: eq(formFields.formId, input.formId),
        orderBy: (f, { asc }) => [asc(f.fieldOrder)],
      });
      return formatSuccess({ ...form, fields });
    }

    const conditions = [];
    if (input.status) conditions.push(eq(forms.status, input.status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [data, countResult] = await Promise.all([
      db.select().from(forms).where(where).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(forms).where(where),
    ]);

    return formatSuccess(data, {
      total: countResult[0].count,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
}
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat(mcp-server): implement form engine tools"
```

---

### Task 10: 数据查询工具

**Files:**
- Create: `packages/mcp-server/src/tools/data-query.ts`
- Create: `packages/mcp-server/src/tools/data-aggregate.ts`

- [ ] **Step 1: 实现 data-query.ts**

`packages/mcp-server/src/tools/data-query.ts`:
```typescript
import { z } from "zod";
import { eq, like, and, inArray, gte, lte, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { users, forms, formFields, configs } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";
import { TABLE_PERMISSION_MAP, ALLOWED_DATA_TABLES, type WhereClause } from "../types/index.js";
import { resolveUserPermissions, checkPermission } from "../auth/rbac.js";

const whereValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ $in: z.array(z.union([z.string(), z.number()])) }),
  z.object({ $like: z.string() }),
  z.object({ $gte: z.union([z.string(), z.number()]).optional(), $lte: z.union([z.string(), z.number()]).optional() }),
]);

export const dataQuerySchema = z.object({
  table: z.enum(ALLOWED_DATA_TABLES),
  where: z.record(whereValueSchema).optional(),
  orderBy: z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  page: z.number().default(1),
  pageSize: z.number().default(20),
});

const tableMap = { users, forms, form_fields: formFields, configs } as const;

function buildWhereConditions(table: any, where: WhereClause): SQL[] {
  const conditions: SQL[] = [];
  for (const [field, value] of Object.entries(where)) {
    const column = table[field];
    if (!column) continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      conditions.push(eq(column, value));
    } else if (typeof value === "object" && value !== null) {
      if ("$in" in value) conditions.push(inArray(column, value.$in));
      if ("$like" in value) conditions.push(like(column, value.$like));
      if ("$gte" in value && value.$gte !== undefined) conditions.push(gte(column, value.$gte));
      if ("$lte" in value && value.$lte !== undefined) conditions.push(lte(column, value.$lte));
    }
  }
  return conditions;
}

export async function dataQuery(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["data:read"], async (db, cleanArgs, context) => {
    const input = dataQuerySchema.parse(cleanArgs);

    const extraPerm = TABLE_PERMISSION_MAP[input.table];
    if (extraPerm) {
      const perms = await resolveUserPermissions(db, context);
      if (!checkPermission(perms, extraPerm)) {
        return formatError("PERMISSION_DENIED", `查询 ${input.table} 表还需要 ${extraPerm} 权限`);
      }
    }

    const table = tableMap[input.table];
    const conditions = input.where ? buildWhereConditions(table, input.where as WhereClause) : [];
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (input.page - 1) * input.pageSize;

    const [data, countResult] = await Promise.all([
      db.select().from(table).where(where).limit(input.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(table).where(where),
    ]);

    return formatSuccess(data, {
      total: countResult[0].count,
      page: input.page,
      pageSize: input.pageSize,
    });
  });
}
```

- [ ] **Step 2: 实现 data-aggregate.ts**

`packages/mcp-server/src/tools/data-aggregate.ts`:
```typescript
import { z } from "zod";
import { sql, and, eq, like, inArray, gte, lte, type SQL } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { users, forms, formFields, configs } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";
import { TABLE_PERMISSION_MAP, ALLOWED_DATA_TABLES, type WhereClause } from "../types/index.js";
import { resolveUserPermissions, checkPermission } from "../auth/rbac.js";

const whereValueSchema = z.union([
  z.string(), z.number(), z.boolean(),
  z.object({ $in: z.array(z.union([z.string(), z.number()])) }),
  z.object({ $like: z.string() }),
  z.object({ $gte: z.union([z.string(), z.number()]).optional(), $lte: z.union([z.string(), z.number()]).optional() }),
]);

export const dataAggregateSchema = z.object({
  table: z.enum(ALLOWED_DATA_TABLES),
  metric: z.enum(["count", "sum", "avg"]),
  field: z.string().optional(),
  groupBy: z.string().optional(),
  where: z.record(whereValueSchema).optional(),
});

const tableMap = { users, forms, form_fields: formFields, configs } as const;

export async function dataAggregate(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["data:read"], async (db, cleanArgs, context) => {
    const input = dataAggregateSchema.parse(cleanArgs);

    const extraPerm = TABLE_PERMISSION_MAP[input.table];
    if (extraPerm) {
      const perms = await resolveUserPermissions(db, context);
      if (!checkPermission(perms, extraPerm)) {
        return formatError("PERMISSION_DENIED", `聚合查询 ${input.table} 表还需要 ${extraPerm} 权限`);
      }
    }

    if ((input.metric === "sum" || input.metric === "avg") && !input.field) {
      return formatError("VALIDATION_ERROR", `${input.metric} 操作需要指定 field 参数`);
    }

    const table = tableMap[input.table];

    let metricSql: SQL;
    switch (input.metric) {
      case "count": metricSql = sql<number>`count(*)`; break;
      case "sum": metricSql = sql<number>`sum(${sql.raw(input.field!)})`; break;
      case "avg": metricSql = sql<number>`avg(${sql.raw(input.field!)})`; break;
    }

    const selectFields: Record<string, SQL> = { value: metricSql };
    if (input.groupBy) {
      selectFields.group = sql.raw(input.groupBy);
    }

    let query = db.select(selectFields).from(table);

    if (input.where) {
      const conditions: SQL[] = [];
      for (const [field, value] of Object.entries(input.where)) {
        const column = (table as any)[field];
        if (!column) continue;
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          conditions.push(eq(column, value));
        } else if (typeof value === "object" && value !== null) {
          if ("$in" in value) conditions.push(inArray(column, (value as any).$in));
          if ("$like" in value) conditions.push(like(column, (value as any).$like));
          if ("$gte" in value && (value as any).$gte !== undefined) conditions.push(gte(column, (value as any).$gte));
          if ("$lte" in value && (value as any).$lte !== undefined) conditions.push(lte(column, (value as any).$lte));
        }
      }
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
    }

    if (input.groupBy) {
      query = (query as any).groupBy(sql.raw(input.groupBy));
    }

    const result = await query;
    return formatSuccess(result);
  });
}
```

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat(mcp-server): implement data query and aggregate tools"
```

---

### Task 11: 配置管理 + 权限管理工具

**Files:**
- Create: `packages/mcp-server/src/tools/config-get.ts`
- Create: `packages/mcp-server/src/tools/config-set.ts`
- Create: `packages/mcp-server/src/tools/role-list.ts`
- Create: `packages/mcp-server/src/tools/role-manage.ts`

- [ ] **Step 1: 实现 config-get.ts**

`packages/mcp-server/src/tools/config-get.ts`:
```typescript
import { z } from "zod";
import { eq, like, or } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { configs } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const configGetSchema = z.object({
  key: z.string().optional(),
  keyword: z.string().optional(),
});

export async function configGet(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["config:read"], async (db, cleanArgs) => {
    const input = configGetSchema.parse(cleanArgs);

    if (input.key) {
      const config = await db.query.configs.findFirst({ where: eq(configs.key, input.key) });
      return formatSuccess(config);
    }

    if (input.keyword) {
      const results = await db.select().from(configs).where(
        or(
          like(configs.key, `%${input.keyword}%`),
          like(configs.description, `%${input.keyword}%`)
        )
      );
      return formatSuccess(results);
    }

    const all = await db.select().from(configs);
    return formatSuccess(all);
  });
}
```

- [ ] **Step 2: 实现 config-set.ts**

`packages/mcp-server/src/tools/config-set.ts`:
```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { configs } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const configSetSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string().optional(),
});

export async function configSet(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["config:write"], async (db, cleanArgs, context) => {
    const input = configSetSchema.parse(cleanArgs);

    const existing = await db.query.configs.findFirst({ where: eq(configs.key, input.key) });

    if (existing) {
      await db.update(configs).set({
        value: input.value,
        description: input.description ?? existing.description,
        updatedBy: context.userId,
      }).where(eq(configs.id, existing.id));
    } else {
      await db.insert(configs).values({
        key: input.key,
        value: input.value,
        description: input.description,
        updatedBy: context.userId,
      });
    }

    const result = await db.query.configs.findFirst({ where: eq(configs.key, input.key) });
    return formatSuccess(result);
  });
}
```

- [ ] **Step 3: 实现 role-list.ts**

`packages/mcp-server/src/tools/role-list.ts`:
```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { roles, rolePermissions } from "../db/schema.js";
import { withAuth, formatSuccess } from "./base.js";

export const roleListSchema = z.object({
  roleId: z.number().optional(),
});

export async function roleList(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["role:read"], async (db, cleanArgs) => {
    const input = roleListSchema.parse(cleanArgs);

    if (input.roleId) {
      const role = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
      if (!role) return formatSuccess(null);
      const perms = await db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, input.roleId),
      });
      return formatSuccess({ ...role, permissions: perms.map((p) => p.permission) });
    }

    const allRoles = await db.select().from(roles);
    const result = await Promise.all(
      allRoles.map(async (role) => {
        const perms = await db.query.rolePermissions.findMany({
          where: eq(rolePermissions.roleId, role.id),
        });
        return { ...role, permissions: perms.map((p) => p.permission) };
      })
    );
    return formatSuccess(result);
  });
}
```

- [ ] **Step 4: 实现 role-manage.ts**

`packages/mcp-server/src/tools/role-manage.ts`:
```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Database } from "../db/connection.js";
import { roles, rolePermissions } from "../db/schema.js";
import { withAuth, formatSuccess, formatError } from "./base.js";

export const roleManageSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  roleId: z.number().optional(),
  data: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }).optional(),
});

export async function roleManage(db: Database, args: Record<string, unknown>) {
  return withAuth(db, args, ["role:write"], async (db, cleanArgs) => {
    const input = roleManageSchema.parse(cleanArgs);

    switch (input.action) {
      case "create": {
        if (!input.data?.name) return formatError("VALIDATION_ERROR", "创建角色需要 name");
        const [result] = await db.insert(roles).values({
          name: input.data.name,
          description: input.data.description,
        }).$returningId();

        if (input.data.permissions?.length) {
          await db.insert(rolePermissions).values(
            input.data.permissions.map((perm) => ({
              roleId: result.id,
              permission: perm,
              resource: perm.split(":")[0],
            }))
          );
        }
        const created = await db.query.roles.findFirst({ where: eq(roles.id, result.id) });
        return formatSuccess({ ...created, permissions: input.data.permissions || [] });
      }
      case "update": {
        if (!input.roleId) return formatError("VALIDATION_ERROR", "更新角色需要 roleId");
        if (input.data?.name || input.data?.description) {
          const updateData: Record<string, unknown> = {};
          if (input.data.name) updateData.name = input.data.name;
          if (input.data.description) updateData.description = input.data.description;
          await db.update(roles).set(updateData).where(eq(roles.id, input.roleId));
        }
        if (input.data?.permissions) {
          await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
          if (input.data.permissions.length > 0) {
            await db.insert(rolePermissions).values(
              input.data.permissions.map((perm) => ({
                roleId: input.roleId!,
                permission: perm,
                resource: perm.split(":")[0],
              }))
            );
          }
        }
        const updated = await db.query.roles.findFirst({ where: eq(roles.id, input.roleId) });
        return formatSuccess(updated);
      }
      case "delete": {
        if (!input.roleId) return formatError("VALIDATION_ERROR", "删除角色需要 roleId");
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
        await db.delete(roles).where(eq(roles.id, input.roleId));
        return formatSuccess({ deleted: true, roleId: input.roleId });
      }
    }
  });
}
```

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat(mcp-server): implement config and role management tools"
```

---

### Task 12: MCP Server 入口 — 注册所有 Tools

**Files:**
- Modify: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/tools/register.ts`

- [ ] **Step 1: 创建 tools/register.ts — 统一注册所有工具**

`packages/mcp-server/src/tools/register.ts`:
```typescript
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Database } from "../db/connection.js";
import { userList, userListSchema } from "./user-list.js";
import { userManage, userManageSchema } from "./user-manage.js";
import { formCreate, formCreateSchema } from "./form-create.js";
import { formManage, formManageSchema } from "./form-manage.js";
import { formQuery, formQuerySchema } from "./form-query.js";
import { dataQuery, dataQuerySchema } from "./data-query.js";
import { dataAggregate, dataAggregateSchema } from "./data-aggregate.js";
import { configGet, configGetSchema } from "./config-get.js";
import { configSet, configSetSchema } from "./config-set.js";
import { roleList, roleListSchema } from "./role-list.js";
import { roleManage, roleManageSchema } from "./role-manage.js";
import { zodToJsonSchema } from "zod-to-json-schema";

interface ToolDef {
  name: string;
  description: string;
  schema: any;
  handler: (db: Database, args: Record<string, unknown>) => Promise<any>;
}

const tools: ToolDef[] = [
  { name: "user_list", description: "分页查询用户列表，支持按状态/角色/关键词筛选", schema: userListSchema, handler: userList },
  { name: "user_manage", description: "创建/更新/删除用户", schema: userManageSchema, handler: userManage },
  { name: "form_create", description: "根据描述创建表单及字段定义", schema: formCreateSchema, handler: formCreate },
  { name: "form_manage", description: "更新或删除表单（修改名称/描述/状态）", schema: formManageSchema, handler: formManage },
  { name: "form_query", description: "查询表单列表或详情（含字段定义）", schema: formQuerySchema, handler: formQuery },
  { name: "data_query", description: "通用数据查询，支持条件筛选/排序/分页", schema: dataQuerySchema, handler: dataQuery },
  { name: "data_aggregate", description: "聚合统计（COUNT/SUM/AVG），支持 GROUP BY", schema: dataAggregateSchema, handler: dataAggregate },
  { name: "config_get", description: "读取系统配置项", schema: configGetSchema, handler: configGet },
  { name: "config_set", description: "创建或更新系统配置项（JSON值）", schema: configSetSchema, handler: configSet },
  { name: "role_list", description: "查询角色及其权限列表", schema: roleListSchema, handler: roleList },
  { name: "role_manage", description: "创建/更新/删除角色，分配权限", schema: roleManageSchema, handler: roleManage },
];

export function registerTools(server: Server, db: Database) {
  server.setRequestHandler(
    { method: "tools/list" } as any,
    async () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.schema),
      })),
    })
  );

  server.setRequestHandler(
    { method: "tools/call" } as any,
    async (request: any) => {
      const { name, arguments: args } = request.params;
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "TOOL_NOT_FOUND", message: `未知工具: ${name}` } }) }],
          isError: true,
        };
      }
      return tool.handler(db, args || {});
    }
  );
}
```

- [ ] **Step 2: 实现 MCP Server 主入口**

`packages/mcp-server/src/index.ts`:
```typescript
#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "./db/connection.js";
import { registerTools } from "./tools/register.js";

async function main() {
  const server = new Server(
    { name: "bicli-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const db = await getDb();
  registerTools(server, db);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BiCLI MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Failed to start MCP Server:", err);
  process.exit(1);
});
```

- [ ] **Step 3: 添加 zod-to-json-schema 依赖**

```bash
cd packages/mcp-server
pnpm add zod-to-json-schema@^3.24.0
cd ../..
```

- [ ] **Step 4: 验证 MCP Server 启动**

```bash
cd packages/mcp-server
pnpm dev
```
Expected: 输出 "BiCLI MCP Server running on stdio"（Ctrl+C 退出）

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat(mcp-server): register all 11 tools and create server entry"
```

---

## Chunk 4: Skills 包

### Task 13: Skill 解析器

**Files:**
- Modify: `packages/skills/src/parser.ts`
- Test: `packages/skills/src/__tests__/parser.test.ts`

- [ ] **Step 1: 写测试**

`packages/skills/src/__tests__/parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseSkill } from "../parser.js";

const sampleSkill = `---
name: form-builder
title: 智能表单创建
description: 根据用户需求创建动态表单
triggers:
  - 创建表单
  - 新建表单
required_tools:
  - form_create
  - form_query
required_permissions:
  - form:write
  - form:read
---

# 智能表单创建

这是 Skill 的正文内容。`;

describe("parseSkill", () => {
  it("should parse frontmatter and content correctly", () => {
    const skill = parseSkill(sampleSkill);
    expect(skill.name).toBe("form-builder");
    expect(skill.title).toBe("智能表单创建");
    expect(skill.triggers).toEqual(["创建表单", "新建表单"]);
    expect(skill.requiredTools).toEqual(["form_create", "form_query"]);
    expect(skill.requiredPermissions).toEqual(["form:write", "form:read"]);
    expect(skill.content).toContain("这是 Skill 的正文内容");
  });

  it("should throw on invalid frontmatter", () => {
    expect(() => parseSkill("no frontmatter here")).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/skills
pnpm vitest run src/__tests__/parser.test.ts
```
Expected: FAIL

- [ ] **Step 3: 实现 parser.ts**

`packages/skills/src/parser.ts`:
```typescript
import matter from "gray-matter";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Skill {
  name: string;
  title: string;
  description: string;
  triggers: string[];
  requiredTools: string[];
  requiredPermissions: string[];
  content: string;
}

export function parseSkill(raw: string): Skill {
  const { data, content } = matter(raw);

  if (!data.name || !data.title) {
    throw new Error("Skill frontmatter must include 'name' and 'title'");
  }

  return {
    name: data.name,
    title: data.title,
    description: data.description || "",
    triggers: data.triggers || [],
    requiredTools: data.required_tools || [],
    requiredPermissions: data.required_permissions || [],
    content: content.trim(),
  };
}

export function loadAllSkills(definitionsDir: string): Skill[] {
  const dir = resolve(definitionsDir);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const skills: Skill[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      skills.push(parseSkill(raw));
    } catch (err) {
      console.warn(`Warning: Failed to parse skill ${file}:`, err);
    }
  }

  return skills;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm vitest run src/__tests__/parser.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat(skills): implement skill parser with gray-matter"
```

---

### Task 14: 默认 Skill 定义文件

**Files:**
- Create: `packages/skills/definitions/form-builder.md`
- Create: `packages/skills/definitions/data-query.md`
- Create: `packages/skills/definitions/rbac-admin.md`

- [ ] **Step 1: 创建 form-builder.md**

`packages/skills/definitions/form-builder.md`:
```markdown
---
name: form-builder
title: 智能表单创建
description: 根据用户的自然语言描述，自动推断字段类型和校验规则，创建动态表单
triggers:
  - 创建表单
  - 新建表单
  - 生成表单
  - 做一个表单
  - 建一个表
required_tools:
  - form_create
  - form_manage
  - form_query
required_permissions:
  - form:write
  - form:read
---

# 智能表单创建

## 你的职责
你是一个表单设计专家。当用户描述他想要的表单时，你需要：
1. 分析用户需求，提取表单字段
2. 为每个字段推断合适的类型
3. 设置合理的校验规则
4. 调用 form_create 创建表单
5. 调用 form_query 确认创建结果并展示给用户

## 字段类型映射
- 姓名/用户名/标题 → text
- 邮箱/邮件 → email
- 年龄/数量/金额/评分 → number
- 性别/状态/类别/部门 → select（提供选项）
- 日期/生日/时间 → date
- 备注/描述/详情/原因 → textarea

## 交互流程
1. 用户描述表单需求
2. 列出解析后的字段清单，请用户确认
3. 确认后调用 form_create
4. 展示创建结果
```

- [ ] **Step 2: 创建 data-query.md**

`packages/skills/definitions/data-query.md`:
```markdown
---
name: data-query
title: 数据查询助手
description: 将用户的自然语言查询需求转化为结构化查询，支持筛选、排序、分页和聚合统计
triggers:
  - 查询
  - 查一下
  - 有多少
  - 统计
  - 列出
  - 搜索
  - 找一下
required_tools:
  - data_query
  - data_aggregate
  - user_list
required_permissions:
  - data:read
  - user:read
---

# 数据查询助手

## 你的职责
你是一个数据查询专家。将用户的自然语言查询转化为结构化的数据查询操作。

## 查询策略
- 用户查具体用户列表时 → 优先用 user_list（有更好的筛选支持）
- 用户要统计/汇总数据时 → 用 data_aggregate
- 通用数据查询 → 用 data_query

## 可查询的表
- users: 用户数据（字段: username, email, status, role_id, created_at）
- forms: 表单数据（字段: name, description, status, created_by, created_at）
- form_fields: 表单字段（字段: form_id, label, type, required）
- configs: 系统配置（字段: key, value, description）

## 交互流程
1. 理解用户查询意图
2. 选择合适的工具和参数
3. 执行查询
4. 以易读格式展示结果（表格形式优先）
```

- [ ] **Step 3: 创建 rbac-admin.md**

`packages/skills/definitions/rbac-admin.md`:
```markdown
---
name: rbac-admin
title: 权限管理向导
description: 引导用户完成角色创建、权限分配、用户角色变更等权限管理操作
triggers:
  - 权限
  - 角色
  - 授权
  - 分配权限
  - 创建角色
  - 修改角色
required_tools:
  - role_list
  - role_manage
  - user_manage
required_permissions:
  - role:read
  - role:write
  - user:write
---

# 权限管理向导

## 你的职责
引导用户完成权限管理操作，确保操作安全和合理。

## 可用权限标识
- user:read / user:write — 用户管理
- form:read / form:write — 表单管理
- data:read — 数据查询
- config:read / config:write — 配置管理
- role:read / role:write — 角色管理

## 操作流程
1. 先用 role_list 展示当前角色和权限状况
2. 确认用户的操作意图（创建角色/修改权限/变更用户角色）
3. 列出即将执行的变更，请用户确认
4. 执行操作并展示结果

## 安全提醒
- 修改 admin 角色权限前务必警告用户
- 删除角色前检查是否有用户绑定该角色
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat(skills): add 3 default skill definitions"
```

---

## Chunk 5: CLI 包

### Task 15: 配置管理模块

**Files:**
- Create: `packages/cli/src/config/manager.ts`
- Test: `packages/cli/src/config/__tests__/manager.test.ts`

- [ ] **Step 1: 写测试**

`packages/cli/src/config/__tests__/manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigManager } from "../manager.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ConfigManager", () => {
  let tmpDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "bicli-test-"));
    manager = new ConfigManager(join(tmpDir, "config.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return default config when no file exists", () => {
    const config = manager.load();
    expect(config.model.provider).toBe("openai");
    expect(config.user.userId).toBe(1);
  });

  it("should save and reload config", () => {
    const config = manager.load();
    config.model.provider = "anthropic";
    manager.save(config);
    const reloaded = manager.load();
    expect(reloaded.model.provider).toBe("anthropic");
  });
});
```

- [ ] **Step 2: 实现 manager.ts**

`packages/cli/src/config/manager.ts`:
```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface BiCliConfig {
  model: {
    provider: "openai" | "anthropic" | "alibaba";
    model: string;
  };
  mcp: {
    transport: "stdio";
    command: string;
  };
  user: {
    userId: number;
    role: string;
  };
  session: {
    maxTurns: number;
  };
}

const DEFAULT_CONFIG: BiCliConfig = {
  model: { provider: "openai", model: "gpt-4" },
  mcp: { transport: "stdio", command: "bicli-mcp-server" },
  user: { userId: 1, role: "admin" },
  session: { maxTurns: 20 },
};

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(homedir(), ".bicli", "config.json");
  }

  load(): BiCliConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      // fall through to default
    }
    return { ...DEFAULT_CONFIG };
  }

  save(config: BiCliConfig): void {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  getDefault(): BiCliConfig {
    return { ...DEFAULT_CONFIG };
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
cd packages/cli
pnpm vitest run src/config/__tests__/manager.test.ts
```
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat(cli): implement config manager"
```

---

### Task 16: Skill Loader（Matcher + Injector）

**Files:**
- Create: `packages/cli/src/skill-loader/matcher.ts`
- Create: `packages/cli/src/skill-loader/injector.ts`
- Test: `packages/cli/src/skill-loader/__tests__/matcher.test.ts`

- [ ] **Step 1: 写测试**

`packages/cli/src/skill-loader/__tests__/matcher.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { SkillMatcher } from "../matcher.js";
import type { Skill } from "@bicli/skills";

const mockSkills: Skill[] = [
  {
    name: "form-builder",
    title: "智能表单创建",
    description: "创建动态表单",
    triggers: ["创建表单", "新建表单", "生成表单"],
    requiredTools: ["form_create", "form_query"],
    requiredPermissions: ["form:write", "form:read"],
    content: "# Skill content",
  },
  {
    name: "data-query",
    title: "数据查询助手",
    description: "数据查询",
    triggers: ["查询", "查一下", "统计", "列出"],
    requiredTools: ["data_query", "data_aggregate"],
    requiredPermissions: ["data:read"],
    content: "# Query content",
  },
];

describe("SkillMatcher", () => {
  const matcher = new SkillMatcher(mockSkills);

  it("should match skill by trigger keyword", () => {
    const result = matcher.match("帮我创建表单");
    expect(result?.name).toBe("form-builder");
  });

  it("should match data query skill", () => {
    const result = matcher.match("查询所有用户");
    expect(result?.name).toBe("data-query");
  });

  it("should return null when no match", () => {
    const result = matcher.match("你好");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 实现 matcher.ts**

`packages/cli/src/skill-loader/matcher.ts`:
```typescript
import type { Skill } from "@bicli/skills";

export class SkillMatcher {
  private skills: Skill[];

  constructor(skills: Skill[]) {
    this.skills = skills;
  }

  match(userInput: string): Skill | null {
    for (const skill of this.skills) {
      for (const trigger of skill.triggers) {
        if (userInput.includes(trigger)) {
          return skill;
        }
      }
    }
    return null;
  }
}
```

- [ ] **Step 3: 实现 injector.ts**

`packages/cli/src/skill-loader/injector.ts`:
```typescript
import type { Skill } from "@bicli/skills";

const BASE_SYSTEM_PROMPT = `你是 BiCLI 智能助手，可以通过工具帮用户完成用户管理、表单创建、数据查询、配置管理和权限管理等操作。
请根据用户请求选择合适的工具来完成任务。执行工具调用后，用简洁友好的语言向用户展示结果。`;

export function buildSystemPrompt(matchedSkill: Skill | null): string {
  if (!matchedSkill) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\n---\n\n${matchedSkill.content}`;
}

export function filterTools(
  allTools: Array<{ name: string; [key: string]: unknown }>,
  matchedSkill: Skill | null
): Array<{ name: string; [key: string]: unknown }> {
  if (!matchedSkill) return allTools;
  return allTools.filter((t) => matchedSkill.requiredTools.includes(t.name));
}
```

- [ ] **Step 4: 运行测试**

```bash
pnpm vitest run src/skill-loader/__tests__/matcher.test.ts
```
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat(cli): implement skill matcher and injector"
```

---

### Task 17: LLM 适配层

**Files:**
- Create: `packages/cli/src/llm/provider.ts`
- Create: `packages/cli/src/llm/providers/openai.ts`
- Create: `packages/cli/src/llm/providers/anthropic.ts`
- Create: `packages/cli/src/llm/providers/qwen.ts`
- Create: `packages/cli/src/llm/tool-caller.ts`
- Create: `packages/cli/src/llm/session.ts`

- [ ] **Step 1: 实现 provider.ts — 统一模型创建**

`packages/cli/src/llm/provider.ts`:
```typescript
import type { LanguageModelV1 } from "ai";
import { createOpenAIProvider } from "./providers/openai.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createQwenProvider } from "./providers/qwen.js";

export type ProviderName = "openai" | "anthropic" | "alibaba";

export function createModel(provider: ProviderName, modelId: string): LanguageModelV1 {
  switch (provider) {
    case "openai": return createOpenAIProvider(modelId);
    case "anthropic": return createAnthropicProvider(modelId);
    case "alibaba": return createQwenProvider(modelId);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
```

- [ ] **Step 2: 实现三个 Provider 文件**

`packages/cli/src/llm/providers/openai.ts`:
```typescript
import { createOpenAI } from "@ai-sdk/openai";

export function createOpenAIProvider(model: string) {
  const openai = createOpenAI({});
  return openai(model);
}
```

`packages/cli/src/llm/providers/anthropic.ts`:
```typescript
import { createAnthropic } from "@ai-sdk/anthropic";

export function createAnthropicProvider(model: string) {
  const anthropic = createAnthropic({});
  return anthropic(model);
}
```

`packages/cli/src/llm/providers/qwen.ts`:
```typescript
import { createAlibaba } from "@ai-sdk/alibaba";

export function createQwenProvider(model: string) {
  const alibaba = createAlibaba({});
  return alibaba(model);
}
```

- [ ] **Step 3: 实现 tool-caller.ts — _context 注入**

`packages/cli/src/llm/tool-caller.ts`:
```typescript
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface ToolCallerConfig {
  userId: number;
  role: string;
}

export class ToolCaller {
  private client: Client;
  private config: ToolCallerConfig;

  constructor(client: Client, config: ToolCallerConfig) {
    this.client = client;
    this.config = config;
  }

  async call(toolName: string, args: Record<string, unknown>) {
    const argsWithContext = {
      ...args,
      _context: {
        userId: this.config.userId,
        role: this.config.role,
      },
    };
    const result = await this.client.callTool({ name: toolName, arguments: argsWithContext });
    return result;
  }
}
```

- [ ] **Step 4: 实现 session.ts — 会话管理**

`packages/cli/src/llm/session.ts`:
```typescript
import type { CoreMessage } from "ai";

export class Session {
  private messages: CoreMessage[] = [];
  private maxTurns: number;

  constructor(maxTurns: number = 20) {
    this.maxTurns = maxTurns;
  }

  addMessage(message: CoreMessage) {
    this.messages.push(message);
    this.trim();
  }

  getMessages(): CoreMessage[] {
    return [...this.messages];
  }

  clear() {
    this.messages = [];
  }

  private trim() {
    const maxMessages = this.maxTurns * 2;
    if (this.messages.length > maxMessages) {
      const keep = 10;
      this.messages = this.messages.slice(-keep);
    }
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat(cli): implement LLM adapter layer with multi-model support"
```

---

### Task 18: MCP Client 连接管理

**Files:**
- Create: `packages/cli/src/mcp-client/connection.ts`

- [ ] **Step 1: 实现 connection.ts**

`packages/cli/src/mcp-client/connection.ts`:
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export class McpConnection {
  private client: Client | null = null;
  private tools: Tool[] = [];

  async connect(command: string, args: string[] = []) {
    this.client = new Client(
      { name: "bicli-cli", version: "1.0.0" },
      { capabilities: {} }
    );

    const transport = new StdioClientTransport({ command, args });
    await this.client.connect(transport);

    const toolsResult = await this.client.listTools();
    this.tools = toolsResult.tools;
  }

  getClient(): Client {
    if (!this.client) throw new Error("MCP Client not connected");
    return this.client;
  }

  getTools(): Tool[] {
    return this.tools;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add .
git commit -m "feat(cli): implement MCP client connection manager"
```

---

### Task 19: CLI 命令注册 + 主入口

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/chat.ts`
- Create: `packages/cli/src/commands/config-cmd.ts`
- Create: `packages/cli/src/commands/mcp-cmd.ts`
- Modify: `packages/cli/bin/bicli.ts`

- [ ] **Step 1: 实现 CLI 主入口**

`packages/cli/src/index.ts`:
```typescript
import { Command } from "commander";
import { chatCommand } from "./commands/chat.js";
import { configCommand } from "./commands/config-cmd.js";
import { mcpCommand } from "./commands/mcp-cmd.js";

export function main(argv: string[]) {
  const program = new Command();

  program
    .name("bicli")
    .description("AI-powered terminal tool platform")
    .version("1.0.0");

  program.addCommand(chatCommand());
  program.addCommand(configCommand());
  program.addCommand(mcpCommand());

  program
    .action(() => {
      // 默认启动 TUI 对话界面（等同于 bicli chat）
      chatCommand().parse(["chat"], { from: "user" });
    });

  program.parse(argv);
}
```

- [ ] **Step 2: 实现 chat 命令**

`packages/cli/src/commands/chat.ts`:
```typescript
import { Command } from "commander";
import "dotenv/config";
import { generateText } from "ai";
import { ConfigManager } from "../config/manager.js";
import { McpConnection } from "../mcp-client/connection.js";
import { createModel } from "../llm/provider.js";
import { ToolCaller } from "../llm/tool-caller.js";
import { Session } from "../llm/session.js";
import { loadAllSkills } from "@bicli/skills";
import { SkillMatcher } from "../skill-loader/matcher.js";
import { buildSystemPrompt, filterTools } from "../skill-loader/injector.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function chatCommand() {
  const cmd = new Command("chat")
    .description("Start AI chat session")
    .option("-m, --message <message>", "Send a single message (non-interactive)")
    .action(async (options) => {
      const configManager = new ConfigManager();
      const config = configManager.load();

      if (options.message) {
        await handleSingleMessage(config, options.message);
      } else {
        // TUI 模式（后续实现）
        console.log("TUI mode coming soon. Use -m for single message mode.");
        console.log('Example: bicli chat -m "查询所有用户"');
      }
    });

  return cmd;
}

async function handleSingleMessage(config: any, message: string) {
  const mcp = new McpConnection();

  try {
    console.log("Connecting to MCP Server...");
    const mcpServerPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../mcp-server/src/index.ts"
    );
    await mcp.connect("tsx", [mcpServerPath]);

    const skillsDir = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../skills/definitions"
    );
    const skills = loadAllSkills(skillsDir);
    const matcher = new SkillMatcher(skills);
    const matchedSkill = matcher.match(message);

    const systemPrompt = buildSystemPrompt(matchedSkill);
    const mcpTools = mcp.getTools();
    const filteredTools = filterTools(mcpTools, matchedSkill);

    const toolCaller = new ToolCaller(mcp.getClient(), {
      userId: config.user.userId,
      role: config.user.role,
    });

    const model = createModel(config.model.provider, config.model.model);

    const aiTools: Record<string, any> = {};
    for (const tool of filteredTools) {
      aiTools[tool.name] = {
        description: tool.description,
        parameters: tool.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          const result = await toolCaller.call(tool.name, args);
          const text = (result.content as any[])?.[0]?.text || "{}";
          return JSON.parse(text);
        },
      };
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
      tools: aiTools,
      maxSteps: 5,
    });

    console.log("\n" + result.text);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  } finally {
    await mcp.disconnect();
  }
}
```

- [ ] **Step 3: 实现 config 命令**

`packages/cli/src/commands/config-cmd.ts`:
```typescript
import { Command } from "commander";
import { ConfigManager } from "../config/manager.js";

export function configCommand() {
  const cmd = new Command("config")
    .description("Manage BiCLI configuration");

  cmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const manager = new ConfigManager();
      const config = manager.load();
      console.log(JSON.stringify(config, null, 2));
    });

  cmd
    .command("set <key> <value>")
    .description("Set a configuration value (e.g., model.provider openai)")
    .action((key: string, value: string) => {
      const manager = new ConfigManager();
      const config = manager.load();

      const keys = key.split(".");
      let obj: any = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }

      const finalKey = keys[keys.length - 1];
      const numVal = Number(value);
      obj[finalKey] = isNaN(numVal) ? value : numVal;

      manager.save(config);
      console.log(`Set ${key} = ${value}`);
    });

  cmd
    .command("reset")
    .description("Reset configuration to defaults")
    .action(() => {
      const manager = new ConfigManager();
      manager.save(manager.getDefault());
      console.log("Configuration reset to defaults.");
    });

  return cmd;
}
```

- [ ] **Step 4: 实现 mcp 命令**

`packages/cli/src/commands/mcp-cmd.ts`:
```typescript
import { Command } from "commander";
import { McpConnection } from "../mcp-client/connection.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function mcpCommand() {
  const cmd = new Command("mcp")
    .description("Manage MCP Server connection");

  cmd
    .command("status")
    .description("Check MCP Server connection status")
    .action(async () => {
      const mcp = new McpConnection();
      try {
        const mcpServerPath = resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../../mcp-server/src/index.ts"
        );
        await mcp.connect("tsx", [mcpServerPath]);
        const tools = mcp.getTools();
        console.log(`MCP Server: ● Connected`);
        console.log(`Available tools: ${tools.length}`);
        tools.forEach((t) => console.log(`  - ${t.name}: ${t.description}`));
        await mcp.disconnect();
      } catch (err) {
        console.log(`MCP Server: ○ Disconnected`);
        console.log(`Error: ${err instanceof Error ? err.message : err}`);
      }
    });

  return cmd;
}
```

- [ ] **Step 5: 更新 bin/bicli.ts**

`packages/cli/bin/bicli.ts`:
```typescript
#!/usr/bin/env tsx
import "dotenv/config";
import { main } from "../src/index.js";
main(process.argv);
```

- [ ] **Step 6: 提交**

```bash
git add .
git commit -m "feat(cli): implement CLI commands (chat, config, mcp)"
```

---

### Task 20: TUI 界面（Ink）

**Files:**
- Create: `packages/cli/src/tui/App.tsx`
- Create: `packages/cli/src/tui/components/StatusBar.tsx`
- Create: `packages/cli/src/tui/components/ChatArea.tsx`
- Create: `packages/cli/src/tui/components/InputBar.tsx`
- Create: `packages/cli/src/tui/index.tsx`

- [ ] **Step 1: 实现 StatusBar 组件**

`packages/cli/src/tui/components/StatusBar.tsx`:
```tsx
import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  version: string;
  model: string;
  mcpStatus: "connected" | "disconnected" | "connecting";
  role: string;
}

export function StatusBar({ version, model, mcpStatus, role }: StatusBarProps) {
  const statusIcon = mcpStatus === "connected" ? "●" : mcpStatus === "connecting" ? "◌" : "○";
  const statusColor = mcpStatus === "connected" ? "green" : mcpStatus === "connecting" ? "yellow" : "red";

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold>bicli {version}</Text>
      <Text>Model: <Text color="cyan">{model}</Text></Text>
      <Text>MCP: <Text color={statusColor}>{statusIcon}</Text></Text>
      <Text>Role: <Text color="magenta">{role}</Text></Text>
    </Box>
  );
}
```

- [ ] **Step 2: 实现 ChatArea 组件**

`packages/cli/src/tui/components/ChatArea.tsx`:
```tsx
import React from "react";
import { Box, Text } from "ink";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  toolCall?: string;
}

interface ChatAreaProps {
  messages: ChatMessage[];
}

export function ChatArea({ messages }: ChatAreaProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.map((msg, i) => (
        <Box key={i} marginBottom={1}>
          <Text>
            {msg.role === "user" ? (
              <Text color="green" bold>You: </Text>
            ) : msg.role === "assistant" ? (
              <Text color="blue" bold>AI: </Text>
            ) : null}
            {msg.toolCall && <Text color="yellow">[{msg.toolCall}] </Text>}
            <Text>{msg.content}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 3: 实现 InputBar 组件**

`packages/cli/src/tui/components/InputBar.tsx`:
```tsx
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface InputBarProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSubmit, disabled }: InputBarProps) {
  const [input, setInput] = useState("");

  useInput((inputChar, key) => {
    if (disabled) return;
    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput("");
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta && inputChar) {
      setInput((prev) => prev + inputChar);
    }
  });

  return (
    <Box borderStyle="single" paddingX={1}>
      <Text color="gray">&gt; </Text>
      <Text>{input}</Text>
      {!disabled && <Text color="gray">▋</Text>}
    </Box>
  );
}
```

- [ ] **Step 4: 实现 App 主组件**

`packages/cli/src/tui/App.tsx`:
```tsx
import React, { useState, useEffect } from "react";
import { Box, useApp } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { ChatArea, type ChatMessage } from "./components/ChatArea.js";
import { InputBar } from "./components/InputBar.js";

interface AppProps {
  model: string;
  provider: string;
  role: string;
  onMessage: (message: string) => Promise<string>;
  mcpStatus: "connected" | "disconnected" | "connecting";
}

export function App({ model, provider, role, onMessage, mcpStatus }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "你好！我是 BiCLI 智能助手，可以帮你管理用户、创建表单、查询数据。" },
  ]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const response = await onMessage(text);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar version="1.0.0" model={`${provider}/${model}`} mcpStatus={mcpStatus} role={role} />
      <ChatArea messages={messages} />
      <Box paddingX={1}>
        <Text color="gray">[Ctrl+C] Exit  {loading ? "⏳ Thinking..." : ""}</Text>
      </Box>
      <InputBar onSubmit={handleSubmit} disabled={loading} />
    </Box>
  );
}
```

- [ ] **Step 5: 实现 TUI 启动入口**

`packages/cli/src/tui/index.tsx`:
```tsx
import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { generateText } from "ai";
import { ConfigManager } from "../config/manager.js";
import { McpConnection } from "../mcp-client/connection.js";
import { createModel } from "../llm/provider.js";
import { ToolCaller } from "../llm/tool-caller.js";
import { Session } from "../llm/session.js";
import { loadAllSkills } from "@bicli/skills";
import { SkillMatcher } from "../skill-loader/matcher.js";
import { buildSystemPrompt, filterTools } from "../skill-loader/injector.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export async function startTui() {
  const configManager = new ConfigManager();
  const config = configManager.load();
  const session = new Session(config.session.maxTurns);

  const mcp = new McpConnection();
  let mcpStatus: "connected" | "disconnected" | "connecting" = "connecting";

  const mcpServerPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../mcp-server/src/index.ts"
  );

  try {
    await mcp.connect("tsx", [mcpServerPath]);
    mcpStatus = "connected";
  } catch {
    mcpStatus = "disconnected";
  }

  const skillsDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../skills/definitions"
  );
  const skills = loadAllSkills(skillsDir);
  const matcher = new SkillMatcher(skills);

  const toolCaller = mcpStatus === "connected"
    ? new ToolCaller(mcp.getClient(), { userId: config.user.userId, role: config.user.role })
    : null;

  const model = createModel(config.model.provider, config.model.model);

  async function handleMessage(message: string): Promise<string> {
    session.addMessage({ role: "user", content: message });

    const matchedSkill = matcher.match(message);
    const systemPrompt = buildSystemPrompt(matchedSkill);
    const mcpTools = mcp.getTools();
    const filteredTools = filterTools(mcpTools, matchedSkill);

    const aiTools: Record<string, any> = {};
    if (toolCaller) {
      for (const tool of filteredTools) {
        aiTools[tool.name] = {
          description: tool.description,
          parameters: tool.inputSchema,
          execute: async (args: Record<string, unknown>) => {
            const result = await toolCaller.call(tool.name, args);
            const text = (result.content as any[])?.[0]?.text || "{}";
            return JSON.parse(text);
          },
        };
      }
    }

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: session.getMessages(),
      tools: aiTools,
      maxSteps: 5,
    });

    session.addMessage({ role: "assistant", content: result.text });
    return result.text;
  }

  render(
    <App
      model={config.model.model}
      provider={config.model.provider}
      role={config.user.role}
      onMessage={handleMessage}
      mcpStatus={mcpStatus}
    />
  );
}
```

- [ ] **Step 6: 更新 chat 命令集成 TUI**

在 `packages/cli/src/commands/chat.ts` 中，将 `.action` 中的占位代码替换为调用 `startTui()`：

```typescript
// 在 action handler 的 else 分支中：
const { startTui } = await import("../tui/index.js");
await startTui();
```

- [ ] **Step 7: 端到端验证**

```bash
# 确保 MySQL 运行且数据已 seed
pnpm seed

# 测试单消息模式
cd packages/cli
tsx bin/bicli.ts chat -m "查询所有用户"

# 测试 MCP 状态
tsx bin/bicli.ts mcp status

# 测试配置
tsx bin/bicli.ts config show
```

- [ ] **Step 8: 提交**

```bash
git add .
git commit -m "feat(cli): implement TUI interface with Ink"
```

---

### Task 21: 最终集成验证

- [ ] **Step 1: 全量测试**

```bash
cd /Users/zhujinqi/Documents/javacode/yeahmobi/bicli
pnpm test
```
Expected: 所有包测试通过

- [ ] **Step 2: 全量构建**

```bash
pnpm build
```
Expected: 三个包全部编译成功

- [ ] **Step 3: 端到端场景测试**

```bash
# 场景 1: 查询用户
pnpm --filter @bicli/cli dev -- chat -m "列出所有活跃用户"

# 场景 2: 创建表单
pnpm --filter @bicli/cli dev -- chat -m "创建一个客户调查表单，包含姓名、邮箱和评分字段"

# 场景 3: 数据统计
pnpm --filter @bicli/cli dev -- chat -m "统计每个角色有多少用户"
```

- [ ] **Step 4: 最终提交**

```bash
git add .
git commit -m "chore: final integration and cleanup"
```

---

## 附录：文件清单

共需创建/修改 **~50 个文件**：

| 包 | 文件数 | 关键文件 |
|----|--------|---------|
| Root | 6 | package.json, pnpm-workspace.yaml, tsconfig.base.json, .env.example, .gitignore, .npmrc |
| @bicli/mcp-server | 18 | schema.ts, connection.ts, seed.ts, rbac.ts, 11 tool files, register.ts, index.ts, drizzle.config.ts |
| @bicli/skills | 7 | parser.ts, index.ts, 3 skill .md files, package.json, tsconfig.json |
| @bicli/cli | 17 | 5 commands, 3 LLM providers, provider.ts, tool-caller.ts, session.ts, connection.ts, matcher.ts, injector.ts, manager.ts, 4 TUI components, index.ts |
| Tests | ~5 | schema.test.ts, rbac.test.ts, parser.test.ts, matcher.test.ts, manager.test.ts |
