#!/usr/bin/env node
import "../src/env.js";
import { getDb } from "../src/db/connection.js";
import { users, forms, configs } from "../src/db/schema.js";
import { getDataScopeRules, applyDataScope, applyFieldScope } from "../src/auth/data-scope.js";
import { and, type SQL } from "drizzle-orm";

const ROLES = ["admin", "editor", "viewer"] as const;

function printTable(label: string, rows: Record<string, unknown>[]) {
  console.log(`\n  ${label} (${rows.length} 条):`);
  if (rows.length === 0) { console.log("    (空)"); return; }
  const keys = Object.keys(rows[0]);
  console.log(`    字段: ${keys.join(", ")}`);
  for (const row of rows.slice(0, 3)) {
    const vals = keys.map(k => {
      const v = row[k];
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "string" && v.length > 25) return v.slice(0, 22) + "...";
      return String(v ?? "null");
    });
    console.log(`    | ${vals.join(" | ")} |`);
  }
  if (rows.length > 3) console.log(`    ... 共 ${rows.length} 条`);
}

async function main() {
  const db = await getDb();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     BiCLI 权限对比验证 — 三角色数据差异                    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // --- Users ---
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 资源: users（用户列表）");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  for (const role of ROLES) {
    const conditions: SQL[] = [];
    const scopeRules = await getDataScopeRules(db, role, "users");
    applyDataScope(scopeRules, { userId: 1, role }, users, conditions);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const raw = await db.select().from(users).where(where);
    const filtered = await applyFieldScope(db, role, "users", raw);
    printTable(`【${role}】`, filtered);
  }

  // --- Forms ---
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 资源: forms（表单列表）");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  for (const role of ROLES) {
    const conditions: SQL[] = [];
    const scopeRules = await getDataScopeRules(db, role, "forms");
    applyDataScope(scopeRules, { userId: 1, role }, forms, conditions);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const raw = await db.select().from(forms).where(where);
    const filtered = await applyFieldScope(db, role, "forms", raw);
    printTable(`【${role}】`, filtered);
  }

  // --- Configs ---
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 资源: configs（系统配置）");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  for (const role of ROLES) {
    const raw = await db.select().from(configs);
    const filtered = await applyFieldScope(db, role, "configs", raw);
    printTable(`【${role}】`, filtered);
  }

  // --- Summary ---
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  差异总结                                                ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  行级过滤:                                               ║");
  console.log("║    admin  → users: 全部 | forms: 全部                    ║");
  console.log("║    editor → users: 全部 | forms: 全部                    ║");
  console.log("║    viewer → users: 仅active | forms: 仅published         ║");
  console.log("║                                                          ║");
  console.log("║  字段级过滤:                                              ║");
  console.log("║    admin  → 全部字段可见                                  ║");
  console.log("║    editor → 全部字段可见                                  ║");
  console.log("║    viewer → users.email脱敏 users.roleId隐藏             ║");
  console.log("║           → configs.value隐藏 configs.updatedBy隐藏      ║");
  console.log("║           → forms.createdBy隐藏                          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
