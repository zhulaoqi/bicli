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
import { dateyeEventList, dateyeEventListDef } from "./dataeye-event-list.js";
import { dateyeEventProperty, dateyeEventPropertyDef } from "./dataeye-event-property.js";
import { dateyeTableList, dateyeTableListDef } from "./dataeye-table-list.js";
import { dateyeTableDetail, dateyeTableDetailDef } from "./dataeye-table-detail.js";
import { dateyeSqlQuery, dateyeSqlQueryDef } from "./dataeye-sql-query.js";
import { dateyeProjectList, dateyeProjectListDef } from "./dataeye-project-list.js";
import { dateyeDwsTable, dateyeDwsTableDef } from "./dataeye-dws-table.js";
import { dateyeDatasourceList, dateyeDatasourceListDef } from "./dataeye-datasource-list.js";
import { dateyeEventGroupList, dateyeEventGroupListDef } from "./dataeye-event-group-list.js";
import { dateyeEventGroupAdd, dateyeEventGroupAddDef } from "./dataeye-event-group-add.js";
import { dateyeEventCreate, dateyeEventCreateDef } from "./dataeye-event-create.js";
import { dateyeEventUpdate, dateyeEventUpdateDef } from "./dataeye-event-update.js";
import { dateyeEventStatus, dateyeEventStatusDef } from "./dataeye-event-status.js";
import { dateyeEventPropertySave, dateyeEventPropertySaveDef } from "./dataeye-event-property-save.js";
import { dateyeEventAnalysis, dateyeEventAnalysisDef } from "./dataeye-event-analysis.js";
import { dateyeTableValidateName, dateyeTableValidateNameDef } from "./dataeye-table-validate-name.js";
import { dateyeTableCreate, dateyeTableCreateDef } from "./dataeye-table-create.js";
import { dateyeTableUpdateStatus, dateyeTableUpdateStatusDef } from "./dataeye-table-update-status.js";
import { dateyeUserList, dateyeUserListDef } from "./dataeye-user-list.js";
import { dateyeRoleList, dateyeRoleListDef } from "./dataeye-role-list.js";
import { dateyeUserCreate, dateyeUserCreateDef } from "./dataeye-user-create.js";
import { dateyeRoleCreate, dateyeRoleCreateDef } from "./dataeye-role-create.js";
import { dateyeUserAssignRole, dateyeUserAssignRoleDef } from "./dataeye-user-assign-role.js";
import { dateyeProductCreate, dateyeProductCreateDef } from "./dataeye-product-create.js";
import { dateyeAnalysisList, dateyeAnalysisListDef } from "./dataeye-analysis-list.js";
import { dateyeAnalysisExecute, dateyeAnalysisExecuteDef } from "./dataeye-analysis-execute.js";
// Datart 工具
import { datartDashboardList, datartDashboardListDef } from "./datart-dashboard-list.js";
import { datartDashboardDetail, datartDashboardDetailDef } from "./datart-dashboard-detail.js";
import { datartDataExecute, datartDataExecuteDef } from "./datart-data-execute.js";
import { datartDataTestExecute, datartDataTestExecuteDef } from "./datart-data-test-execute.js";
import { datartSourceList, datartSourceListDef } from "./datart-source-list.js";
import { datartViewList, datartViewListDef } from "./datart-view-list.js";
import { datartViewCreate, datartViewCreateDef } from "./datart-view-create.js";
import { datartScheduleList, datartScheduleListDef } from "./datart-schedule-list.js";
import { datartScheduleCreate, datartScheduleCreateDef } from "./datart-schedule-create.js";
import { datartScheduleExecute, datartScheduleExecuteDef } from "./datart-schedule-execute.js";
import { datartShareCreate, datartShareCreateDef } from "./datart-share-create.js";
import { datartOrgList, datartOrgListDef } from "./datart-org-list.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { writeAuditLog, buildAuditEntry } from "../middleware/audit.js";

interface ToolDef {
  name: string;
  description: string;
  schema?: any;
  inputSchema?: Record<string, unknown>;
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

const dateyeTools: ToolDef[] = [
  { name: dateyeProjectListDef.name, description: dateyeProjectListDef.description, inputSchema: dateyeProjectListDef.inputSchema, requiredPermissions: [], handler: dateyeProjectList },
  { name: dateyeEventListDef.name, description: dateyeEventListDef.description, inputSchema: dateyeEventListDef.inputSchema, requiredPermissions: [], handler: dateyeEventList },
  { name: dateyeEventPropertyDef.name, description: dateyeEventPropertyDef.description, inputSchema: dateyeEventPropertyDef.inputSchema, requiredPermissions: [], handler: dateyeEventProperty },
  { name: dateyeTableListDef.name, description: dateyeTableListDef.description, inputSchema: dateyeTableListDef.inputSchema, requiredPermissions: [], handler: dateyeTableList },
  { name: dateyeTableDetailDef.name, description: dateyeTableDetailDef.description, inputSchema: dateyeTableDetailDef.inputSchema, requiredPermissions: [], handler: dateyeTableDetail },
  { name: dateyeDwsTableDef.name, description: dateyeDwsTableDef.description, inputSchema: dateyeDwsTableDef.inputSchema, requiredPermissions: [], handler: dateyeDwsTable },
  { name: dateyeDatasourceListDef.name, description: dateyeDatasourceListDef.description, inputSchema: dateyeDatasourceListDef.inputSchema, requiredPermissions: [], handler: dateyeDatasourceList },
  { name: dateyeSqlQueryDef.name, description: dateyeSqlQueryDef.description, inputSchema: dateyeSqlQueryDef.inputSchema, requiredPermissions: [], handler: dateyeSqlQuery },
  // 事件管理写操作
  { name: dateyeEventGroupListDef.name, description: dateyeEventGroupListDef.description, inputSchema: dateyeEventGroupListDef.inputSchema, requiredPermissions: [], handler: dateyeEventGroupList },
  { name: dateyeEventGroupAddDef.name, description: dateyeEventGroupAddDef.description, inputSchema: dateyeEventGroupAddDef.inputSchema, requiredPermissions: [], handler: dateyeEventGroupAdd },
  { name: dateyeEventCreateDef.name, description: dateyeEventCreateDef.description, inputSchema: dateyeEventCreateDef.inputSchema, requiredPermissions: [], handler: dateyeEventCreate },
  { name: dateyeEventUpdateDef.name, description: dateyeEventUpdateDef.description, inputSchema: dateyeEventUpdateDef.inputSchema, requiredPermissions: [], handler: dateyeEventUpdate },
  { name: dateyeEventStatusDef.name, description: dateyeEventStatusDef.description, inputSchema: dateyeEventStatusDef.inputSchema, requiredPermissions: [], handler: dateyeEventStatus },
  { name: dateyeEventPropertySaveDef.name, description: dateyeEventPropertySaveDef.description, inputSchema: dateyeEventPropertySaveDef.inputSchema, requiredPermissions: [], handler: dateyeEventPropertySave },
  { name: dateyeEventAnalysisDef.name, description: dateyeEventAnalysisDef.description, inputSchema: dateyeEventAnalysisDef.inputSchema, requiredPermissions: [], handler: dateyeEventAnalysis },
  // 数据表管理
  { name: dateyeTableValidateNameDef.name, description: dateyeTableValidateNameDef.description, inputSchema: dateyeTableValidateNameDef.inputSchema, requiredPermissions: [], handler: dateyeTableValidateName },
  { name: dateyeTableCreateDef.name, description: dateyeTableCreateDef.description, inputSchema: dateyeTableCreateDef.inputSchema, requiredPermissions: [], handler: dateyeTableCreate },
  { name: dateyeTableUpdateStatusDef.name, description: dateyeTableUpdateStatusDef.description, inputSchema: dateyeTableUpdateStatusDef.inputSchema, requiredPermissions: [], handler: dateyeTableUpdateStatus },
  // 组织视角
  { name: dateyeUserListDef.name, description: dateyeUserListDef.description, inputSchema: dateyeUserListDef.inputSchema, requiredPermissions: [], handler: dateyeUserList },
  { name: dateyeRoleListDef.name, description: dateyeRoleListDef.description, inputSchema: dateyeRoleListDef.inputSchema, requiredPermissions: [], handler: dateyeRoleList },
  { name: dateyeUserCreateDef.name, description: dateyeUserCreateDef.description, inputSchema: dateyeUserCreateDef.inputSchema, requiredPermissions: [], handler: dateyeUserCreate },
  { name: dateyeRoleCreateDef.name, description: dateyeRoleCreateDef.description, inputSchema: dateyeRoleCreateDef.inputSchema, requiredPermissions: [], handler: dateyeRoleCreate },
  { name: dateyeUserAssignRoleDef.name, description: dateyeUserAssignRoleDef.description, inputSchema: dateyeUserAssignRoleDef.inputSchema, requiredPermissions: [], handler: dateyeUserAssignRole },
  { name: dateyeProductCreateDef.name, description: dateyeProductCreateDef.description, inputSchema: dateyeProductCreateDef.inputSchema, requiredPermissions: [], handler: dateyeProductCreate },
  // 自助分析
  { name: dateyeAnalysisListDef.name, description: dateyeAnalysisListDef.description, inputSchema: dateyeAnalysisListDef.inputSchema, requiredPermissions: [], handler: dateyeAnalysisList },
  { name: dateyeAnalysisExecuteDef.name, description: dateyeAnalysisExecuteDef.description, inputSchema: dateyeAnalysisExecuteDef.inputSchema, requiredPermissions: [], handler: dateyeAnalysisExecute },
];

const datartTools: ToolDef[] = [
  // 看板
  { name: datartDashboardListDef.name, description: datartDashboardListDef.description, inputSchema: datartDashboardListDef.inputSchema, requiredPermissions: [], handler: datartDashboardList },
  { name: datartDashboardDetailDef.name, description: datartDashboardDetailDef.description, inputSchema: datartDashboardDetailDef.inputSchema, requiredPermissions: [], handler: datartDashboardDetail },
  { name: datartDataExecuteDef.name, description: datartDataExecuteDef.description, inputSchema: datartDataExecuteDef.inputSchema, requiredPermissions: [], handler: datartDataExecute },
  // 数据视图
  { name: datartSourceListDef.name, description: datartSourceListDef.description, inputSchema: datartSourceListDef.inputSchema, requiredPermissions: [], handler: datartSourceList },
  { name: datartViewListDef.name, description: datartViewListDef.description, inputSchema: datartViewListDef.inputSchema, requiredPermissions: [], handler: datartViewList },
  { name: datartDataTestExecuteDef.name, description: datartDataTestExecuteDef.description, inputSchema: datartDataTestExecuteDef.inputSchema, requiredPermissions: [], handler: datartDataTestExecute },
  { name: datartViewCreateDef.name, description: datartViewCreateDef.description, inputSchema: datartViewCreateDef.inputSchema, requiredPermissions: [], handler: datartViewCreate },
  // 定时任务
  { name: datartScheduleListDef.name, description: datartScheduleListDef.description, inputSchema: datartScheduleListDef.inputSchema, requiredPermissions: [], handler: datartScheduleList },
  { name: datartScheduleCreateDef.name, description: datartScheduleCreateDef.description, inputSchema: datartScheduleCreateDef.inputSchema, requiredPermissions: [], handler: datartScheduleCreate },
  { name: datartScheduleExecuteDef.name, description: datartScheduleExecuteDef.description, inputSchema: datartScheduleExecuteDef.inputSchema, requiredPermissions: [], handler: datartScheduleExecute },
  // 分享
  { name: datartShareCreateDef.name, description: datartShareCreateDef.description, inputSchema: datartShareCreateDef.inputSchema, requiredPermissions: [], handler: datartShareCreate },
  // 组织
  { name: datartOrgListDef.name, description: datartOrgListDef.description, inputSchema: datartOrgListDef.inputSchema, requiredPermissions: [], handler: datartOrgList },
];

export function registerTools(server: Server, db: Database, adapter: PermissionAdapter) {
  const enableDateye = process.env.PERMISSION_MODE === "dataeye" || !!process.env.DATAEYE_API_URL;
  const enableDatart = !!process.env.DATART_API_URL;
  const allTools = [
    ...tools,
    ...(enableDateye ? dateyeTools : []),
    ...(enableDatart ? datartTools : []),
  ];
  if (enableDateye) {
    console.error(`[tools] Dataeye tools enabled (${dateyeTools.length} tools)`);
  }
  if (enableDatart) {
    console.error(`[tools] Datart tools enabled (${datartTools.length} tools), base: ${process.env.DATART_API_URL}`);
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools
      .filter((t) => !t.internal)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || (t.schema ? zodToJsonSchema(t.schema) as any : {}),
        _meta: {
          requiredPermissions: t.requiredPermissions,
          ...(t.destructive ? { destructive: t.destructive } : {}),
        },
      })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = allTools.find((t) => t.name === name);
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
