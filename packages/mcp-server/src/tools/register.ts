import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
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
import { selfPermissions, selfPermissionsSchema } from "./self-permissions.js";
import { auditQuery, auditQuerySchema } from "./audit-query.js";
import { auditWrite, auditWriteSchema } from "./audit-write.js";
import { approvalSubmit, approvalSubmitSchema } from "./approval-submit.js";
import { approvalReview, approvalReviewSchema } from "./approval-review.js";
import { approvalQuery, approvalQuerySchema } from "./approval-query.js";
import { sessionSave, sessionSaveSchema } from "./session-save.js";
import { sessionLoad, sessionLoadSchema } from "./session-load.js";
import { sessionList, sessionListSchema } from "./session-list.js";
import { sessionDelete, sessionDeleteSchema } from "./session-delete.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { writeAuditLog, buildAuditEntry } from "../middleware/audit.js";

interface ToolDef {
  name: string;
  description: string;
  schema: any;
  requiredPermissions: string[];
  destructive?: boolean | string[];
  internal?: boolean;
  handler: (db: Database, adapter: PermissionAdapter, args: Record<string, unknown>) => Promise<any>;
}

const tools: ToolDef[] = [
  { name: "user_list", description: "分页查询用户列表，支持按状态/角色/关键词筛选", schema: userListSchema, requiredPermissions: ["user:read"], handler: userList },
  { name: "user_manage", description: "创建/更新/删除用户", schema: userManageSchema, requiredPermissions: ["user:write"], destructive: ["delete"], handler: userManage },
  { name: "form_create", description: "根据描述创建表单及字段定义", schema: formCreateSchema, requiredPermissions: ["form:write"], handler: formCreate },
  { name: "form_manage", description: "更新或删除表单（修改名称/描述/状态）", schema: formManageSchema, requiredPermissions: ["form:write"], destructive: ["delete"], handler: formManage },
  { name: "form_query", description: "查询表单列表或详情（含字段定义）", schema: formQuerySchema, requiredPermissions: ["form:read"], handler: formQuery },
  { name: "data_query", description: "通用数据查询，支持条件筛选/排序/分页", schema: dataQuerySchema, requiredPermissions: ["data:read"], handler: dataQuery },
  { name: "data_aggregate", description: "聚合统计（COUNT/SUM/AVG），支持 GROUP BY", schema: dataAggregateSchema, requiredPermissions: ["data:read"], handler: dataAggregate },
  { name: "config_get", description: "读取系统配置项", schema: configGetSchema, requiredPermissions: ["config:read"], handler: configGet },
  { name: "config_set", description: "创建或更新系统配置项（JSON值）", schema: configSetSchema, requiredPermissions: ["config:write"], handler: configSet },
  { name: "role_list", description: "查询角色及其权限列表", schema: roleListSchema, requiredPermissions: ["role:read"], handler: roleList },
  { name: "role_manage", description: "创建/更新/删除角色，分配权限", schema: roleManageSchema, requiredPermissions: ["role:write"], destructive: ["delete"], handler: roleManage },
  { name: "self_permissions", description: "获取当前用户自身的角色和权限列表", schema: selfPermissionsSchema, requiredPermissions: [], handler: selfPermissions },
  { name: "audit_query", description: "查询操作审计日志，支持按用户/工具/时间/资源筛选", schema: auditQuerySchema, requiredPermissions: ["audit:read"], handler: auditQuery },
  { name: "audit_write", description: "内部审计写入", schema: auditWriteSchema, requiredPermissions: [], internal: true, handler: auditWrite },
  { name: "approval_submit", description: "提交审批申请（请假/报销/发布等），需指定审批人", schema: approvalSubmitSchema, requiredPermissions: ["approval:write"], handler: approvalSubmit },
  { name: "approval_review", description: "审批操作：通过、驳回或转审", schema: approvalReviewSchema, requiredPermissions: ["approval:review"], destructive: ["reject"], handler: approvalReview },
  { name: "approval_query", description: "查询审批单列表或详情，含操作历史", schema: approvalQuerySchema, requiredPermissions: ["approval:read"], handler: approvalQuery },
  { name: "session_save", description: "保存会话消息（创建新会话或追加消息到现有会话）", schema: sessionSaveSchema, requiredPermissions: [], handler: sessionSave },
  { name: "session_load", description: "加载指定会话的消息列表", schema: sessionLoadSchema, requiredPermissions: [], handler: sessionLoad },
  { name: "session_list", description: "列出当前用户的历史会话", schema: sessionListSchema, requiredPermissions: [], handler: sessionList },
  { name: "session_delete", description: "删除指定会话及其消息", schema: sessionDeleteSchema, requiredPermissions: [], destructive: true, handler: sessionDelete },
];

export function registerTools(server: Server, db: Database, adapter: PermissionAdapter) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools
      .filter((t) => !t.internal)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.schema) as any,
        _meta: {
          requiredPermissions: t.requiredPermissions,
          ...(t.destructive ? { destructive: t.destructive } : {}),
        },
      })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: { code: "TOOL_NOT_FOUND", message: `未知工具: ${name}` } }) }],
        isError: true,
      };
    }

    const startTime = Date.now();
    let status: "success" | "failed" = "success";
    let result: any;

    try {
      result = await tool.handler(db, adapter, args || {});
      const text = result?.content?.[0]?.text;
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.success === false) status = "failed";
        } catch {}
      }
    } catch (err) {
      status = "failed";
      throw err;
    } finally {
      const entry = buildAuditEntry(name, (args || {}) as Record<string, unknown>, result, status, Date.now() - startTime);
      writeAuditLog(db, entry).catch((err) =>
        console.error("[audit] write failed:", err)
      );
    }

    return result;
  });
}
