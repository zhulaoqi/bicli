/**
 * 静态概念词典：高频术语的标准解释。
 * 命中后直接返回结构化解释；未命中时由调用方降级到 knowledge_search。
 */

export interface ConceptEntry {
  /** 主名 */
  name: string;
  /** 同义词（用于匹配） */
  aliases: string[];
  /** 简短定义 */
  definition: string;
  /** 在产品中的典型用途 */
  usage: string;
  /** 关联的 skill / 文档参考 */
  references?: string[];
}

export const CONCEPTS: ConceptEntry[] = [
  {
    name: "事件分析",
    aliases: ["event analysis", "事件分析模型"],
    definition: "对单个或多个埋点事件按维度、指标、时间进行聚合统计的分析模型。",
    usage: "查看某个动作（点击、曝光、下单等）在不同时间段、用户群、地区下的发生量与对比趋势。",
    references: ["dataeye-event-analysis"],
  },
  {
    name: "漏斗分析",
    aliases: ["funnel", "funnel analysis"],
    definition: "按既定步骤序列对用户行为路径进行转化率计算的分析模型。",
    usage: "评估关键转化路径（访问 → 注册 → 付费）每一步的留存与流失。",
    references: ["dataeye-event-analysis"],
  },
  {
    name: "留存分析",
    aliases: ["retention", "retention analysis"],
    definition: "按某起始事件后的 N 天/周回访行为统计用户回访比例的分析模型。",
    usage: "评估新用户留存、老用户活跃维持、特定行为后的次日/七日回访等场景。",
    references: ["dataeye-event-analysis"],
  },
  {
    name: "看板",
    aliases: ["dashboard", "仪表盘"],
    definition: "用于把多个图表与说明组合在一个页面里展示的容器，支持定时推送、分享和下载。",
    usage: "把日报/周报常用图表组合，定时推送给指定收件人。",
    references: ["datart-dashboard"],
  },
  {
    name: "图表",
    aliases: ["chart", "可视化图"],
    definition: "看板中的最小可视化单元，包含数据查询、字段映射和样式配置。",
    usage: "单独执行查看数据，或被多个看板复用。",
    references: ["datart-view"],
  },
  {
    name: "定时任务",
    aliases: ["schedule", "调度任务"],
    definition: "Datart 中以 Cron 表达式按时触发的看板/图表推送任务，支持邮件、企业微信、飞书等通道。",
    usage: "每天/每周自动把日报推送给团队，或在指定时间触发数据导出。",
    references: ["datart-schedule"],
  },
  {
    name: "数据视图",
    aliases: ["view", "dataset"],
    definition: "面向分析的数据集合，定义了从底层数据源筛选/聚合后的字段集合。",
    usage: "为图表提供「已建模」的数据源，支持权限隔离与字段类型管理。",
    references: ["datart-view"],
  },
  {
    name: "权限",
    aliases: ["permission", "授权"],
    definition: "对资源（项目、看板、数据视图、图表）进行读/写/删/管理操作的控制规则。",
    usage: "通过角色绑定权限，限制不同人员能看到/修改的资源范围。",
    references: ["dataeye-permissions", "rbac-admin"],
  },
  {
    name: "角色",
    aliases: ["role"],
    definition: "权限的集合，绑定到用户后决定其可执行的操作。",
    usage: "把「数据分析师」「项目管理员」等岗位权限统一封装为角色。",
    references: ["dataeye-user-role-management"],
  },
];

export function findConcept(query: string): ConceptEntry | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const c of CONCEPTS) {
    if (c.name.toLowerCase() === q) return c;
    if (c.aliases.some((a) => a.toLowerCase() === q)) return c;
  }
  // 模糊：包含
  for (const c of CONCEPTS) {
    if (c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())) return c;
    if (c.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))) return c;
  }
  return null;
}
