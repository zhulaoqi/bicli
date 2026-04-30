import type { Database } from "../db/connection.js";
import type { PermissionAdapter } from "../auth/adapter.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { RouteName } from "../chat/agent/agent-state.js";
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
import { dataeyeUserOnboard, dataeyeUserOnboardDef } from "./business/user-onboard.js";
import { dataeyeTableImportCreate, dataeyeTableImportCreateDef } from "./business/table-import-create.js";
import { datartDashboardList, datartDashboardListDef } from "./datart-dashboard-list.js";
import { datartDashboardDetail, datartDashboardDetailDef } from "./datart-dashboard-detail.js";
import { datartDashboardExecute, datartDashboardExecuteDef } from "./datart-dashboard-execute.js";
import { datartDataExecute, datartDataExecuteDef } from "./datart-data-execute.js";
import { datartDataTestExecute, datartDataTestExecuteDef } from "./datart-data-test-execute.js";
import { datartSourceList, datartSourceListDef } from "./datart-source-list.js";
import { datartViewList, datartViewListDef } from "./datart-view-list.js";
import { datartViewCreate, datartViewCreateDef } from "./datart-view-create.js";
import { datartScheduleList, datartScheduleListDef } from "./datart-schedule-list.js";
import { datartScheduleCreate, datartScheduleCreateDef } from "./datart-schedule-create.js";
import { datartScheduleExecute, datartScheduleExecuteDef } from "./datart-schedule-execute.js";
import { datartScheduleDetail, datartScheduleDetailDef } from "./datart-schedule-detail.js";
import { datartScheduleLogs, datartScheduleLogsDef } from "./datart-schedule-logs.js";
import { datartScheduleUpdate, datartScheduleUpdateDef } from "./datart-schedule-update.js";
import { datartScheduleDelete, datartScheduleDeleteDef } from "./datart-schedule-delete.js";
import { datartScheduleCopy, datartScheduleCopyDef } from "./datart-schedule-copy.js";
import { datartScheduleNameCheck, datartScheduleNameCheckDef } from "./datart-schedule-name-check.js";
import { datartScheduleArchivedList, datartScheduleArchivedListDef, datartScheduleUnarchive, datartScheduleUnarchiveDef } from "./datart-schedule-archive.js";
import { dataeyeScheduleManage, dataeyeScheduleManageDef } from "./business/schedule-manage.js";
import { datartShareCreate, datartShareCreateDef } from "./datart-share-create.js";
import { datartShareList, datartShareListDef } from "./datart-share-list.js";
import { datartDownloadSubmit, datartDownloadSubmitDef } from "./datart-download-submit.js";
import { datartDownloadTaskList, datartDownloadTaskListDef } from "./datart-download-task-list.js";
import { datartOrgList, datartOrgListDef } from "./datart-org-list.js";
import { dataeyeKnowledgeSearch, dataeyeKnowledgeSearchSchema } from "./knowledge/knowledge-search.js";
import { dataeyeConceptExplain, dataeyeConceptExplainSchema } from "./knowledge/concept-explain.js";

export type ToolHandler = (
  db: Database,
  adapter: PermissionAdapter,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface ToolDef {
  name: string;
  description: string;
  schema?: any;
  inputSchema?: Record<string, unknown>;
  requiredPermissions: string[];
  destructive?: boolean | string[];
  internal?: boolean;
  tier?: "business" | "atomic" | "internal";
  domain: string;
  handler: ToolHandler;
  /**
   * 适用的路由集合。Selector 会按 route 过滤工具。
   * 缺省时按 `applyRouteHintDefaults` 规则补全：
   *   - destructive 工具: ["write_action"]
   *   - 其他: ["realtime_query", "diagnosis"]
   */
  routeHints?: RouteName[];
  /** 仅在 knowledge / visual_explain 路由可见的纯知识工具 */
  knowledgeOnly?: boolean;
}

export interface ToolDomain {
  domain: string;
  enabled: (env: NodeJS.ProcessEnv) => boolean;
  tools: ToolDef[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 透传的 route 元数据，便于下游 selector 直接使用而无需再次查 ToolDef */
  routeHints?: RouteName[];
  knowledgeOnly?: boolean;
  destructive?: boolean | string[];
  tier?: "business" | "atomic" | "internal";
  domain?: string;
}

const alwaysEnabled = () => true;
const dataeyeEnabled = (env: NodeJS.ProcessEnv) => env.PERMISSION_MODE === "dataeye" || Boolean(env.DATAEYE_API_URL);
const visualizationEnabled = (env: NodeJS.ProcessEnv) => Boolean(env.DATART_API_URL);

export const coreDomain: ToolDomain = {
  domain: "core",
  enabled: alwaysEnabled,
  tools: [
    { domain: "core", tier: "atomic", name: "user_list", description: "分页查询用户列表，支持按状态/角色/关键词筛选", schema: userListSchema, requiredPermissions: ["user:read"], handler: userList },
    { domain: "core", tier: "atomic", name: "user_manage", description: "创建/更新/删除用户", schema: userManageSchema, requiredPermissions: ["user:write"], destructive: ["delete"], handler: userManage },
    { domain: "core", tier: "atomic", name: "form_create", description: "根据描述创建表单及字段定义", schema: formCreateSchema, requiredPermissions: ["form:write"], handler: formCreate },
    { domain: "core", tier: "atomic", name: "form_manage", description: "更新或删除表单（修改名称/描述/状态）", schema: formManageSchema, requiredPermissions: ["form:write"], destructive: ["delete"], handler: formManage },
    { domain: "core", tier: "atomic", name: "form_query", description: "查询表单列表或详情（含字段定义）", schema: formQuerySchema, requiredPermissions: ["form:read"], handler: formQuery },
    { domain: "core", tier: "atomic", name: "data_query", description: "通用数据查询，支持条件筛选/排序/分页", schema: dataQuerySchema, requiredPermissions: ["data:read"], handler: dataQuery },
    { domain: "core", tier: "atomic", name: "data_aggregate", description: "聚合统计（COUNT/SUM/AVG），支持 GROUP BY", schema: dataAggregateSchema, requiredPermissions: ["data:read"], handler: dataAggregate },
    { domain: "core", tier: "atomic", name: "config_get", description: "读取系统配置项", schema: configGetSchema, requiredPermissions: ["config:read"], handler: configGet },
    { domain: "core", tier: "atomic", name: "config_set", description: "创建或更新系统配置项（JSON值）", schema: configSetSchema, requiredPermissions: ["config:write"], handler: configSet },
    { domain: "core", tier: "atomic", name: "role_list", description: "查询角色及其权限列表", schema: roleListSchema, requiredPermissions: ["role:read"], handler: roleList },
    { domain: "core", tier: "atomic", name: "role_manage", description: "创建/更新/删除角色，分配权限", schema: roleManageSchema, requiredPermissions: ["role:write"], destructive: ["delete"], handler: roleManage },
    { domain: "core", tier: "atomic", name: "self_permissions", description: "获取当前用户自身的角色和权限列表", schema: selfPermissionsSchema, requiredPermissions: [], handler: selfPermissions },
    { domain: "core", tier: "atomic", name: "audit_query", description: "查询操作审计日志，支持按用户/工具/时间/资源筛选", schema: auditQuerySchema, requiredPermissions: ["audit:read"], handler: auditQuery },
    { domain: "core", tier: "internal", name: "audit_write", description: "内部审计写入", schema: auditWriteSchema, requiredPermissions: [], internal: true, handler: auditWrite },
    { domain: "core", tier: "atomic", name: "approval_submit", description: "提交审批申请（请假/报销/发布等），需指定审批人", schema: approvalSubmitSchema, requiredPermissions: ["approval:write"], handler: approvalSubmit },
    { domain: "core", tier: "atomic", name: "approval_review", description: "审批操作：通过、驳回或转审", schema: approvalReviewSchema, requiredPermissions: ["approval:review"], destructive: ["reject"], handler: approvalReview },
    { domain: "core", tier: "atomic", name: "approval_query", description: "查询审批单列表或详情，含操作历史", schema: approvalQuerySchema, requiredPermissions: ["approval:read"], handler: approvalQuery },
    { domain: "core", tier: "atomic", name: "session_save", description: "保存会话消息（创建新会话或追加消息到现有会话）", schema: sessionSaveSchema, requiredPermissions: [], handler: sessionSave },
    { domain: "core", tier: "atomic", name: "session_load", description: "加载指定会话的消息列表", schema: sessionLoadSchema, requiredPermissions: [], handler: sessionLoad },
    { domain: "core", tier: "atomic", name: "session_list", description: "列出当前用户的历史会话", schema: sessionListSchema, requiredPermissions: [], handler: sessionList },
    { domain: "core", tier: "atomic", name: "session_delete", description: "删除指定会话及其消息", schema: sessionDeleteSchema, requiredPermissions: [], destructive: true, handler: sessionDelete },
  ],
};

export const dataeyeDomain: ToolDomain = {
  domain: "dataeye",
  enabled: dataeyeEnabled,
  tools: [
    { domain: "dataeye", tier: "business", name: dataeyeUserOnboardDef.name, description: dataeyeUserOnboardDef.description, inputSchema: dataeyeUserOnboardDef.inputSchema, requiredPermissions: [], handler: dataeyeUserOnboard },
    { domain: "dataeye", tier: "business", name: dataeyeTableImportCreateDef.name, description: dataeyeTableImportCreateDef.description, inputSchema: dataeyeTableImportCreateDef.inputSchema, requiredPermissions: [], handler: dataeyeTableImportCreate },
    { domain: "dataeye", tier: "atomic", name: dateyeProjectListDef.name, description: dateyeProjectListDef.description, inputSchema: dateyeProjectListDef.inputSchema, requiredPermissions: [], handler: dateyeProjectList },
    { domain: "dataeye", tier: "atomic", name: dateyeEventListDef.name, description: dateyeEventListDef.description, inputSchema: dateyeEventListDef.inputSchema, requiredPermissions: [], handler: dateyeEventList },
    { domain: "dataeye", tier: "atomic", name: dateyeEventPropertyDef.name, description: dateyeEventPropertyDef.description, inputSchema: dateyeEventPropertyDef.inputSchema, requiredPermissions: [], handler: dateyeEventProperty },
    { domain: "dataeye", tier: "atomic", name: dateyeTableListDef.name, description: dateyeTableListDef.description, inputSchema: dateyeTableListDef.inputSchema, requiredPermissions: [], handler: dateyeTableList },
    { domain: "dataeye", tier: "atomic", name: dateyeTableDetailDef.name, description: dateyeTableDetailDef.description, inputSchema: dateyeTableDetailDef.inputSchema, requiredPermissions: [], handler: dateyeTableDetail },
    { domain: "dataeye", tier: "atomic", name: dateyeDwsTableDef.name, description: dateyeDwsTableDef.description, inputSchema: dateyeDwsTableDef.inputSchema, requiredPermissions: [], handler: dateyeDwsTable },
    { domain: "dataeye", tier: "atomic", name: dateyeDatasourceListDef.name, description: dateyeDatasourceListDef.description, inputSchema: dateyeDatasourceListDef.inputSchema, requiredPermissions: [], handler: dateyeDatasourceList },
    { domain: "dataeye", tier: "atomic", name: dateyeSqlQueryDef.name, description: dateyeSqlQueryDef.description, inputSchema: dateyeSqlQueryDef.inputSchema, requiredPermissions: [], handler: dateyeSqlQuery },
    { domain: "dataeye", tier: "atomic", name: dateyeEventGroupListDef.name, description: dateyeEventGroupListDef.description, inputSchema: dateyeEventGroupListDef.inputSchema, requiredPermissions: [], handler: dateyeEventGroupList },
    { domain: "dataeye", tier: "atomic", name: dateyeEventGroupAddDef.name, description: dateyeEventGroupAddDef.description, inputSchema: dateyeEventGroupAddDef.inputSchema, requiredPermissions: [], handler: dateyeEventGroupAdd },
    { domain: "dataeye", tier: "atomic", name: dateyeEventCreateDef.name, description: dateyeEventCreateDef.description, inputSchema: dateyeEventCreateDef.inputSchema, requiredPermissions: [], handler: dateyeEventCreate },
    { domain: "dataeye", tier: "atomic", name: dateyeEventUpdateDef.name, description: dateyeEventUpdateDef.description, inputSchema: dateyeEventUpdateDef.inputSchema, requiredPermissions: [], handler: dateyeEventUpdate },
    { domain: "dataeye", tier: "atomic", name: dateyeEventStatusDef.name, description: dateyeEventStatusDef.description, inputSchema: dateyeEventStatusDef.inputSchema, requiredPermissions: [], handler: dateyeEventStatus },
    { domain: "dataeye", tier: "atomic", name: dateyeEventPropertySaveDef.name, description: dateyeEventPropertySaveDef.description, inputSchema: dateyeEventPropertySaveDef.inputSchema, requiredPermissions: [], handler: dateyeEventPropertySave },
    { domain: "dataeye", tier: "atomic", name: dateyeEventAnalysisDef.name, description: dateyeEventAnalysisDef.description, inputSchema: dateyeEventAnalysisDef.inputSchema, requiredPermissions: [], handler: dateyeEventAnalysis },
    { domain: "dataeye", tier: "atomic", name: dateyeTableValidateNameDef.name, description: dateyeTableValidateNameDef.description, inputSchema: dateyeTableValidateNameDef.inputSchema, requiredPermissions: [], handler: dateyeTableValidateName },
    { domain: "dataeye", tier: "atomic", name: dateyeTableCreateDef.name, description: dateyeTableCreateDef.description, inputSchema: dateyeTableCreateDef.inputSchema, requiredPermissions: [], handler: dateyeTableCreate },
    { domain: "dataeye", tier: "atomic", name: dateyeTableUpdateStatusDef.name, description: dateyeTableUpdateStatusDef.description, inputSchema: dateyeTableUpdateStatusDef.inputSchema, requiredPermissions: [], handler: dateyeTableUpdateStatus },
    { domain: "dataeye", tier: "atomic", name: dateyeUserListDef.name, description: dateyeUserListDef.description, inputSchema: dateyeUserListDef.inputSchema, requiredPermissions: [], handler: dateyeUserList },
    { domain: "dataeye", tier: "atomic", name: dateyeRoleListDef.name, description: dateyeRoleListDef.description, inputSchema: dateyeRoleListDef.inputSchema, requiredPermissions: [], handler: dateyeRoleList },
    { domain: "dataeye", tier: "atomic", name: dateyeUserCreateDef.name, description: dateyeUserCreateDef.description, inputSchema: dateyeUserCreateDef.inputSchema, requiredPermissions: [], handler: dateyeUserCreate },
    { domain: "dataeye", tier: "atomic", name: dateyeRoleCreateDef.name, description: dateyeRoleCreateDef.description, inputSchema: dateyeRoleCreateDef.inputSchema, requiredPermissions: [], handler: dateyeRoleCreate },
    { domain: "dataeye", tier: "atomic", name: dateyeUserAssignRoleDef.name, description: dateyeUserAssignRoleDef.description, inputSchema: dateyeUserAssignRoleDef.inputSchema, requiredPermissions: [], handler: dateyeUserAssignRole },
    { domain: "dataeye", tier: "atomic", name: dateyeProductCreateDef.name, description: dateyeProductCreateDef.description, inputSchema: dateyeProductCreateDef.inputSchema, requiredPermissions: [], handler: dateyeProductCreate },
    { domain: "dataeye", tier: "atomic", name: dateyeAnalysisListDef.name, description: dateyeAnalysisListDef.description, inputSchema: dateyeAnalysisListDef.inputSchema, requiredPermissions: [], handler: dateyeAnalysisList },
    { domain: "dataeye", tier: "atomic", name: dateyeAnalysisExecuteDef.name, description: dateyeAnalysisExecuteDef.description, inputSchema: dateyeAnalysisExecuteDef.inputSchema, requiredPermissions: [], handler: dateyeAnalysisExecute },
  ],
};

export const visualizationDomain: ToolDomain = {
  domain: "visualization",
  enabled: visualizationEnabled,
  tools: [
    { domain: "visualization", tier: "atomic", name: datartDashboardListDef.name, description: datartDashboardListDef.description, inputSchema: datartDashboardListDef.inputSchema, requiredPermissions: [], handler: datartDashboardList },
    { domain: "visualization", tier: "atomic", name: datartDashboardDetailDef.name, description: datartDashboardDetailDef.description, inputSchema: datartDashboardDetailDef.inputSchema, requiredPermissions: [], handler: datartDashboardDetail },
    { domain: "visualization", tier: "business", name: datartDashboardExecuteDef.name, description: datartDashboardExecuteDef.description, inputSchema: datartDashboardExecuteDef.inputSchema, requiredPermissions: [], handler: datartDashboardExecute },
    { domain: "visualization", tier: "atomic", name: datartDataExecuteDef.name, description: datartDataExecuteDef.description, inputSchema: datartDataExecuteDef.inputSchema, requiredPermissions: [], handler: datartDataExecute },
    { domain: "visualization", tier: "atomic", name: datartDataTestExecuteDef.name, description: datartDataTestExecuteDef.description, inputSchema: datartDataTestExecuteDef.inputSchema, requiredPermissions: [], handler: datartDataTestExecute },
    { domain: "visualization", tier: "atomic", name: datartSourceListDef.name, description: datartSourceListDef.description, inputSchema: datartSourceListDef.inputSchema, requiredPermissions: [], handler: datartSourceList },
    { domain: "visualization", tier: "atomic", name: datartViewListDef.name, description: datartViewListDef.description, inputSchema: datartViewListDef.inputSchema, requiredPermissions: [], handler: datartViewList },
    { domain: "visualization", tier: "atomic", name: datartViewCreateDef.name, description: datartViewCreateDef.description, inputSchema: datartViewCreateDef.inputSchema, requiredPermissions: [], handler: datartViewCreate },
    { domain: "visualization", tier: "business", name: dataeyeScheduleManageDef.name, description: dataeyeScheduleManageDef.description, inputSchema: dataeyeScheduleManageDef.inputSchema, requiredPermissions: [], handler: dataeyeScheduleManage },
    { domain: "visualization", tier: "atomic", name: datartScheduleListDef.name, description: datartScheduleListDef.description, inputSchema: datartScheduleListDef.inputSchema, requiredPermissions: [], handler: datartScheduleList },
    { domain: "visualization", tier: "atomic", name: datartScheduleCreateDef.name, description: datartScheduleCreateDef.description, inputSchema: datartScheduleCreateDef.inputSchema, requiredPermissions: [], handler: datartScheduleCreate },
    { domain: "visualization", tier: "atomic", name: datartScheduleExecuteDef.name, description: datartScheduleExecuteDef.description, inputSchema: datartScheduleExecuteDef.inputSchema, requiredPermissions: [], handler: datartScheduleExecute },
    { domain: "visualization", tier: "atomic", name: datartScheduleDetailDef.name, description: datartScheduleDetailDef.description, inputSchema: datartScheduleDetailDef.inputSchema, requiredPermissions: [], handler: datartScheduleDetail },
    { domain: "visualization", tier: "atomic", name: datartScheduleLogsDef.name, description: datartScheduleLogsDef.description, inputSchema: datartScheduleLogsDef.inputSchema, requiredPermissions: [], handler: datartScheduleLogs },
    { domain: "visualization", tier: "atomic", name: datartScheduleUpdateDef.name, description: datartScheduleUpdateDef.description, inputSchema: datartScheduleUpdateDef.inputSchema, requiredPermissions: [], handler: datartScheduleUpdate },
    { domain: "visualization", tier: "atomic", name: datartScheduleDeleteDef.name, description: datartScheduleDeleteDef.description, inputSchema: datartScheduleDeleteDef.inputSchema, requiredPermissions: [], destructive: ["archive", "delete"], handler: datartScheduleDelete },
    { domain: "visualization", tier: "atomic", name: datartScheduleCopyDef.name, description: datartScheduleCopyDef.description, inputSchema: datartScheduleCopyDef.inputSchema, requiredPermissions: [], handler: datartScheduleCopy },
    { domain: "visualization", tier: "atomic", name: datartScheduleNameCheckDef.name, description: datartScheduleNameCheckDef.description, inputSchema: datartScheduleNameCheckDef.inputSchema, requiredPermissions: [], handler: datartScheduleNameCheck },
    { domain: "visualization", tier: "atomic", name: datartScheduleArchivedListDef.name, description: datartScheduleArchivedListDef.description, inputSchema: datartScheduleArchivedListDef.inputSchema, requiredPermissions: [], handler: datartScheduleArchivedList },
    { domain: "visualization", tier: "atomic", name: datartScheduleUnarchiveDef.name, description: datartScheduleUnarchiveDef.description, inputSchema: datartScheduleUnarchiveDef.inputSchema, requiredPermissions: [], handler: datartScheduleUnarchive },
    { domain: "visualization", tier: "atomic", name: datartShareCreateDef.name, description: datartShareCreateDef.description, inputSchema: datartShareCreateDef.inputSchema, requiredPermissions: [], handler: datartShareCreate },
    { domain: "visualization", tier: "atomic", name: datartShareListDef.name, description: datartShareListDef.description, inputSchema: datartShareListDef.inputSchema, requiredPermissions: [], handler: datartShareList },
    { domain: "visualization", tier: "atomic", name: datartDownloadSubmitDef.name, description: datartDownloadSubmitDef.description, inputSchema: datartDownloadSubmitDef.inputSchema, requiredPermissions: [], handler: datartDownloadSubmit },
    { domain: "visualization", tier: "atomic", name: datartDownloadTaskListDef.name, description: datartDownloadTaskListDef.description, inputSchema: datartDownloadTaskListDef.inputSchema, requiredPermissions: [], handler: datartDownloadTaskList },
    { domain: "visualization", tier: "atomic", name: datartOrgListDef.name, description: datartOrgListDef.description, inputSchema: datartOrgListDef.inputSchema, requiredPermissions: [], handler: datartOrgList },
  ],
};

export const knowledgeDomain: ToolDomain = {
  domain: "knowledge",
  enabled: alwaysEnabled,
  tools: [
    {
      domain: "knowledge",
      tier: "atomic",
      name: "dataeye_knowledge_search",
      description: "在 BiCLI 知识库（skills 与 docs）中按关键词检索相关章节，返回带摘要的命中列表。仅在 knowledge / visual_explain 路由可见，不会查询实时业务数据。",
      inputSchema: dataeyeKnowledgeSearchSchema as Record<string, unknown>,
      requiredPermissions: [],
      handler: dataeyeKnowledgeSearch,
      knowledgeOnly: true,
      routeHints: ["knowledge", "visual_explain"],
    },
    {
      domain: "knowledge",
      tier: "atomic",
      name: "dataeye_concept_explain",
      description: "解释 BiCLI/DataEye 领域内的高频术语（事件分析、漏斗、看板、定时任务等）。命中静态词典优先；未命中时回落到知识库检索。仅在 knowledge / visual_explain 路由可见。",
      inputSchema: dataeyeConceptExplainSchema as Record<string, unknown>,
      requiredPermissions: [],
      handler: dataeyeConceptExplain,
      knowledgeOnly: true,
      routeHints: ["knowledge", "visual_explain"],
    },
  ],
};

export function getToolDomains(): ToolDomain[] {
  return [coreDomain, dataeyeDomain, visualizationDomain, knowledgeDomain];
}

export function getEnabledTools(env: NodeJS.ProcessEnv = process.env): ToolDef[] {
  const tools = getToolDomains()
    .filter((domain) => domain.enabled(env))
    .flatMap((domain) => domain.tools)
    .filter((tool) => !tool.internal)
    .map((tool) => applyRouteHintDefaults(tool));
  assertUniqueToolNames(tools);
  return tools;
}

const ROUTE_HINT_OVERRIDES: Record<string, RouteName[]> = {
  // 业务级 manage / onboard / import：实时查 + 写动作
  dataeye_schedule_manage: ["realtime_query", "write_action"],
  dataeye_user_onboard: ["realtime_query", "write_action"],
  dataeye_table_import_create: ["realtime_query", "write_action"],
  dataeye_dashboard_execute: ["realtime_query", "diagnosis"],

  // 纯诊断/审计
  audit_query: ["diagnosis"],

  // 通用底层查询：只用于实时查询，避免被 router 当作"诊断主线工具"
  data_query: ["realtime_query"],
  data_aggregate: ["realtime_query"],
  config_get: ["realtime_query"],
  self_permissions: ["realtime_query"],

  // session 工具属于会话管理，路由层面不参与
  session_save: ["realtime_query"],
  session_load: ["realtime_query"],
  session_list: ["realtime_query"],
  session_delete: ["write_action"],
};

const HARD_WRITE_NAME_RE = /_(delete|archive|destroy|remove)$/i;
const SOFT_WRITE_NAME_RE = /_(create|update|save|assign|set|copy|unarchive|onboard|import|status|manage)$/i;

function applyRouteHintDefaults(tool: ToolDef): ToolDef {
  if (tool.routeHints && tool.routeHints.length > 0) {
    return tool;
  }
  const override = ROUTE_HINT_OVERRIDES[tool.name];
  if (override) {
    return { ...tool, routeHints: override };
  }

  // 1. 名字硬写 (_delete/_archive/_destroy/_remove) → 仅 write_action
  if (HARD_WRITE_NAME_RE.test(tool.name)) {
    return { ...tool, routeHints: ["write_action"] };
  }

  // 2. destructive boolean=true 视为强写
  if (tool.destructive === true) {
    return { ...tool, routeHints: ["write_action"] };
  }

  // 3. destructive 数组非空 → 实时 + 写
  if (Array.isArray(tool.destructive) && tool.destructive.length > 0) {
    return { ...tool, routeHints: ["realtime_query", "write_action"] };
  }

  // 4. 名字软写 (_create/_update/...) → 实时 + 写
  if (SOFT_WRITE_NAME_RE.test(tool.name)) {
    return { ...tool, routeHints: ["realtime_query", "write_action"] };
  }

  // 5. 默认：可用于实时查询和诊断（不在 knowledge / visual_explain / write_action 出现）
  return { ...tool, routeHints: ["realtime_query", "diagnosis"] };
}

export async function loadChatToolRegistry(env: NodeJS.ProcessEnv = process.env): Promise<{
  handlers: Record<string, ToolHandler>;
  definitions: ToolDefinition[];
}> {
  const tools = getEnabledTools(env);
  return {
    handlers: Object.fromEntries(tools.map((tool) => [tool.name, tool.handler])),
    definitions: tools.map((tool) => ({
      name: tool.name,
      description: tool.description || tool.name,
      inputSchema: getToolInputSchema(tool),
      routeHints: tool.routeHints,
      knowledgeOnly: tool.knowledgeOnly,
      destructive: tool.destructive,
      tier: tool.tier,
      domain: tool.domain,
    })),
  };
}

function getToolInputSchema(tool: ToolDef): Record<string, unknown> {
  if (tool.inputSchema) return tool.inputSchema;
  if (tool.schema) return zodToJsonSchema(tool.schema) as Record<string, unknown>;
  return { type: "object" };
}

function assertUniqueToolNames(tools: ToolDef[]) {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool registered: ${tool.name}`);
    }
    seen.add(tool.name);
  }
}
