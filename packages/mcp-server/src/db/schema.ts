import {
  mysqlTable,
  int,
  bigint,
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
  roleId: bigint("role_id", { mode: "number", unsigned: true })
    .references(() => roles.id)
    .notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const rolePermissions = mysqlTable("role_permissions", {
  id: serial().primaryKey(),
  roleId: bigint("role_id", { mode: "number", unsigned: true })
    .references(() => roles.id)
    .notNull(),
  permission: varchar({ length: 50 }).notNull(),
  resource: varchar({ length: 50 }).notNull(),
});

export const forms = mysqlTable("forms", {
  id: serial().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  description: text(),
  createdBy: bigint("created_by", { mode: "number", unsigned: true })
    .references(() => users.id)
    .notNull(),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const formFields = mysqlTable("form_fields", {
  id: serial().primaryKey(),
  formId: bigint("form_id", { mode: "number", unsigned: true })
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
  updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const fieldScopeRules = mysqlTable("field_scope_rules", {
  id: serial().primaryKey(),
  roleId: bigint("role_id", { mode: "number", unsigned: true })
    .references(() => roles.id)
    .notNull(),
  resource: varchar({ length: 50 }).notNull(),
  fieldName: varchar("field_name", { length: 50 }).notNull(),
  visibility: mysqlEnum("visibility", ["visible", "hidden", "masked"]).default("visible").notNull(),
  maskPattern: varchar("mask_pattern", { length: 50 }),
  priority: int().default(0).notNull(),
});

export const dataScopeRules = mysqlTable("data_scope_rules", {
  id: serial().primaryKey(),
  roleId: bigint("role_id", { mode: "number", unsigned: true })
    .references(() => roles.id)
    .notNull(),
  resource: varchar({ length: 50 }).notNull(),
  scopeType: mysqlEnum("scope_type", ["all", "own", "condition", "deny"]).notNull(),
  ownerField: varchar("owner_field", { length: 100 }),
  conditionField: varchar("condition_field", { length: 50 }),
  conditionOperator: mysqlEnum("condition_operator", ["eq", "in", "ne"]).default("eq"),
  conditionValue: json("condition_value"),
  priority: int().default(0).notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  userRole: varchar("user_role", { length: 50 }).notNull(),
  toolName: varchar("tool_name", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId: varchar("resource_id", { length: 100 }),
  inputSummary: json("input_summary"),
  outputSummary: json("output_summary"),
  status: mysqlEnum("status", ["success", "failed", "denied", "confirmed"]).notNull(),
  sessionId: bigint("session_id", { mode: "number", unsigned: true }),
  ipAddress: varchar("ip_address", { length: 45 }),
  durationMs: int("duration_ms"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const approvals = mysqlTable("approvals", {
  id: serial().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  content: json("content").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  submittedBy: bigint("submitted_by", { mode: "number", unsigned: true }).notNull(),
  reviewerId: bigint("reviewer_id", { mode: "number", unsigned: true }).notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewComment: varchar("review_comment", { length: 500 }),
  relatedResourceType: varchar("related_resource_type", { length: 50 }),
  relatedResourceId: bigint("related_resource_id", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const sessions = mysqlTable("sessions", {
  id: serial().primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 200 }),
  metadata: json("metadata"),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const sessionMessages = mysqlTable("session_messages", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  sessionId: bigint("session_id", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system", "tool_call", "tool_result"]).notNull(),
  content: text("content").notNull(),
  toolName: varchar("tool_name", { length: 100 }),
  durationMs: int("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const approvalActions = mysqlTable("approval_actions", {
  id: serial().primaryKey(),
  approvalId: bigint("approval_id", { mode: "number", unsigned: true }).notNull(),
  actorId: bigint("actor_id", { mode: "number", unsigned: true }).notNull(),
  action: mysqlEnum("action", ["submit", "approve", "reject", "cancel", "reassign"]).notNull(),
  comment: varchar("comment", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
