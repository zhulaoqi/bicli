import "../env.js";
import { sql } from "drizzle-orm";
import { getDb } from "./connection.js";
import { roles, rolePermissions, users, forms, formFields, configs, dataScopeRules, fieldScopeRules, approvals, approvalActions, auditLogs, sessions, sessionMessages } from "./schema.js";

async function seed() {
  const db = await getDb();
  console.log("Seeding database...");

  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of [
    "session_messages", "sessions",
    "audit_logs", "approval_actions", "approvals",
    "field_scope_rules", "data_scope_rules", "form_fields",
    "forms", "configs", "users", "role_permissions", "roles",
  ]) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

  const [adminRole] = await db.insert(roles).values({ name: "admin", description: "系统管理员，拥有全部权限" }).$returningId();
  const [editorRole] = await db.insert(roles).values({ name: "editor", description: "编辑者，可管理表单和查看数据" }).$returningId();
  const [viewerRole] = await db.insert(roles).values({ name: "viewer", description: "观察者，仅可查看数据" }).$returningId();

  const allPermissions = [
    "user:read", "user:write", "form:read", "form:write",
    "data:read", "config:read", "config:write", "role:read", "role:write",
    "approval:read", "approval:write", "approval:review", "audit:read",
  ];
  const editorPermissions = [
    "user:read", "form:read", "form:write", "data:read", "config:read",
    "approval:read", "approval:write", "approval:review", "audit:read",
  ];
  const viewerPermissions = [
    "user:read", "form:read", "data:read", "config:read",
    "approval:read", "approval:write",
  ];

  for (const perm of allPermissions) {
    const [resource] = perm.split(":");
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

  await db.insert(formFields).values([
    { formId: form1.id, label: "姓名", type: "text" as const, fieldOrder: 1, required: true, validation: { minLength: 2, maxLength: 20 } },
    { formId: form1.id, label: "邮箱", type: "email" as const, fieldOrder: 2, required: true },
    { formId: form1.id, label: "部门", type: "select" as const, fieldOrder: 3, required: true, options: [{ label: "技术部", value: "tech" }, { label: "产品部", value: "product" }, { label: "市场部", value: "marketing" }] },
    { formId: form1.id, label: "入职日期", type: "date" as const, fieldOrder: 4, required: true },
    { formId: form1.id, label: "备注", type: "textarea" as const, fieldOrder: 5, required: false },
  ]);

  await db.insert(formFields).values([
    { formId: form2.id, label: "客户姓名", type: "text" as const, fieldOrder: 1, required: true },
    { formId: form2.id, label: "评分", type: "number" as const, fieldOrder: 2, required: true, validation: { min: 1, max: 10 } },
    { formId: form2.id, label: "反馈类型", type: "select" as const, fieldOrder: 3, required: true, options: [{ label: "功能建议", value: "feature" }, { label: "Bug报告", value: "bug" }, { label: "服务体验", value: "service" }] },
    { formId: form2.id, label: "详细描述", type: "textarea" as const, fieldOrder: 4, required: false },
  ]);

  await db.insert(formFields).values([
    { formId: form3.id, label: "请假类型", type: "select" as const, fieldOrder: 1, required: true, options: [{ label: "年假", value: "annual" }, { label: "病假", value: "sick" }, { label: "事假", value: "personal" }] },
    { formId: form3.id, label: "开始日期", type: "date" as const, fieldOrder: 2, required: true },
    { formId: form3.id, label: "结束日期", type: "date" as const, fieldOrder: 3, required: true },
    { formId: form3.id, label: "请假原因", type: "textarea" as const, fieldOrder: 4, required: true },
  ]);

  await db.insert(configs).values([
    { key: "site.name", value: "BiCLI Demo", description: "站点名称", updatedBy: insertedUsers[0].id },
    { key: "site.language", value: "zh-CN", description: "默认语言", updatedBy: insertedUsers[0].id },
    { key: "user.default_role", value: "viewer", description: "新用户默认角色", updatedBy: insertedUsers[0].id },
    { key: "form.max_fields", value: 50, description: "单个表单最大字段数", updatedBy: insertedUsers[0].id },
    { key: "system.version", value: "1.0.0", description: "系统版本号", updatedBy: insertedUsers[0].id },
  ]);

  await db.insert(dataScopeRules).values([
    // admin: 全部资源无限制
    { roleId: adminRole.id, resource: "*", scopeType: "all" as const, priority: 0 },
    // editor: 看到所有表单、所有用户、所有配置（编辑者需要全貌来工作）
    { roleId: editorRole.id, resource: "forms", scopeType: "all" as const, priority: 0 },
    { roleId: editorRole.id, resource: "form_fields", scopeType: "all" as const, priority: 0 },
    { roleId: editorRole.id, resource: "users", scopeType: "all" as const, priority: 0 },
    { roleId: editorRole.id, resource: "configs", scopeType: "all" as const, priority: 0 },
    // viewer: 只看已发布表单、只看活跃用户、配置全部可见
    { roleId: viewerRole.id, resource: "forms", scopeType: "condition" as const, conditionField: "status", conditionOperator: "eq" as const, conditionValue: "published", priority: 0 },
    { roleId: viewerRole.id, resource: "form_fields", scopeType: "all" as const, priority: 0 },
    { roleId: viewerRole.id, resource: "users", scopeType: "condition" as const, conditionField: "status", conditionOperator: "eq" as const, conditionValue: "active", priority: 0 },
    { roleId: viewerRole.id, resource: "configs", scopeType: "all" as const, priority: 0 },
  ]);

  await db.insert(fieldScopeRules).values([
    { roleId: viewerRole.id, resource: "users", fieldName: "email", visibility: "masked" as const, maskPattern: "email", priority: 0 },
    { roleId: viewerRole.id, resource: "users", fieldName: "roleId", visibility: "hidden" as const, priority: 0 },
    { roleId: viewerRole.id, resource: "configs", fieldName: "value", visibility: "hidden" as const, priority: 0 },
    { roleId: viewerRole.id, resource: "configs", fieldName: "updatedBy", visibility: "hidden" as const, priority: 0 },
    { roleId: viewerRole.id, resource: "forms", fieldName: "createdBy", visibility: "hidden" as const, priority: 0 },
  ]);

  // --- Approval data_scope_rules ---
  await db.insert(dataScopeRules).values([
    { roleId: editorRole.id, resource: "approval", scopeType: "own" as const, ownerField: "submitted_by,reviewer_id", priority: 10 },
    { roleId: viewerRole.id, resource: "approval", scopeType: "own" as const, ownerField: "submitted_by", priority: 10 },
  ]);

  // --- Approval Mock Data ---
  // insertedUsers: [0]=admin, [1]=alice(admin), [2]=bob(editor), [3]=carol(editor), [4]=dave(editor), [5]=eve(viewer), [6]=frank(viewer)
  const bobId = insertedUsers[2].id;
  const aliceId = insertedUsers[1].id;
  const eveId = insertedUsers[5].id;
  const frankId = insertedUsers[6].id;
  const adminId = insertedUsers[0].id;

  const [approval1] = await db.insert(approvals).values({
    title: "请假申请 - 家庭原因", type: "leave",
    content: { startDate: "2026-04-21", endDate: "2026-04-23", reason: "家庭事务", days: 3 },
    submittedBy: bobId, reviewerId: aliceId, status: "approved",
    reviewedAt: new Date("2026-04-15T10:00:00Z"), reviewComment: "同意，注意交接工作",
  }).$returningId();

  const [approval2] = await db.insert(approvals).values({
    title: "差旅报销 - 上海出差", type: "expense",
    content: { amount: 3500, items: ["机票", "酒店", "交通"], trip: "上海客户拜访" },
    submittedBy: eveId, reviewerId: bobId, status: "pending",
  }).$returningId();

  const [approval3] = await db.insert(approvals).values({
    title: "请假申请 - 年假", type: "leave",
    content: { startDate: "2026-04-28", endDate: "2026-04-29", reason: "年假", days: 2 },
    submittedBy: frankId, reviewerId: adminId, status: "rejected",
    reviewedAt: new Date("2026-04-14T14:00:00Z"), reviewComment: "当月已请假超限",
  }).$returningId();

  await db.insert(approvalActions).values([
    { approvalId: approval1.id, actorId: bobId, action: "submit" as const },
    { approvalId: approval1.id, actorId: aliceId, action: "approve" as const, comment: "同意，注意交接工作" },
    { approvalId: approval2.id, actorId: eveId, action: "submit" as const },
    { approvalId: approval3.id, actorId: frankId, action: "submit" as const },
    { approvalId: approval3.id, actorId: adminId, action: "reject" as const, comment: "当月已请假超限" },
  ]);

  console.log("Seed completed successfully!");
  console.log(`  Roles: admin(id=${adminRole.id}), editor(id=${editorRole.id}), viewer(id=${viewerRole.id})`);
  console.log(`  Users: ${userValues.length} (admin user id=${insertedUsers[0].id})`);
  console.log(`  Forms: 3 with fields`);
  console.log(`  Configs: 5 entries`);
  console.log(`  Approvals: 3 (approved, pending, rejected)`);
  console.log(`  data_scope_rules + field_scope_rules + approval_scope seeded`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
