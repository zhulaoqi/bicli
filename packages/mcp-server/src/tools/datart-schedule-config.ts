export const SCHEDULE_JOB_TYPES = ["EMAIL", "WECHART", "FEISHU"] as const;
export const SCHEDULE_ATTACHMENT_TYPES = ["EXCEL", "IMAGE", "PDF", "URL"] as const;

export type ScheduleJobType = typeof SCHEDULE_JOB_TYPES[number];
export type ScheduleAttachmentType = typeof SCHEDULE_ATTACHMENT_TYPES[number];

export type ScheduleVizContent = {
  vizType: string;
  vizId: string;
};

export type ScheduleJobConfig = {
  to?: string;
  cc?: string;
  subject?: string;
  attachments?: ScheduleAttachmentType[];
  pushMode?: "webhook" | "selfApplication" | string;
  webHookUrl?: string;
  imageWidth?: number;
  textContent?: string;
  vizContents?: ScheduleVizContent[];
  requestUrl?: string;
  appId?: string;
  appSecrete?: string;
  imgGenerateTime?: boolean;
  sendDate?: boolean;
};

export type ScheduleConfigInput = {
  type?: string;
  recipients?: string[] | string;
  to?: string[] | string;
  cc?: string[] | string;
  subject?: string;
  attachments?: string[];
  pushMode?: "webhook" | "selfApplication" | string;
  webHookUrl?: string;
  imageWidth?: number;
  textContent?: string;
  vizContents?: ScheduleVizContent[];
  vizId?: string;
  vizType?: string;
  appId?: string;
  appSecrete?: string;
  imgGenerateTime?: boolean;
  sendDate?: boolean;
};

export function parseScheduleConfig(config: unknown): ScheduleJobConfig {
  if (!config) return {};
  if (typeof config === "object") return normalizeLegacyConfig(config as Record<string, unknown>);
  if (typeof config !== "string") return {};
  try {
    const parsed = JSON.parse(config);
    if (!parsed || typeof parsed !== "object") return {};
    return normalizeLegacyConfig(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function buildScheduleConfig(input: ScheduleConfigInput): ScheduleJobConfig {
  const type = normalizeJobType(input.type ?? "EMAIL");
  const config: ScheduleJobConfig = {};

  const recipients = input.recipients ?? input.to;
  const to = joinRecipients(recipients);
  if (to) config.to = to;

  const cc = joinRecipients(input.cc);
  if (cc) config.cc = cc;

  if (input.subject !== undefined) config.subject = input.subject;
  if (input.textContent !== undefined) config.textContent = input.textContent;
  if (input.imageWidth !== undefined) config.imageWidth = input.imageWidth;
  if (input.pushMode !== undefined) config.pushMode = input.pushMode;
  if (input.webHookUrl !== undefined) config.webHookUrl = input.webHookUrl;
  if (input.appId !== undefined) config.appId = input.appId;
  if (input.appSecrete !== undefined) config.appSecrete = input.appSecrete;
  if (input.imgGenerateTime !== undefined) config.imgGenerateTime = input.imgGenerateTime;
  if (input.sendDate !== undefined) config.sendDate = input.sendDate;

  const attachments = normalizeAttachments(input.attachments);
  if (attachments.length) config.attachments = attachments;

  const vizContents = normalizeVizContents(input.vizContents, input.vizId, input.vizType);
  if (vizContents.length) config.vizContents = vizContents;

  if (type === "WECHART" && !config.webHookUrl) {
    // 企微任务没有 webhook 无法发送，但保留给调用方通过校验提示补齐。
  }
  return config;
}

export function mergeScheduleConfig(current: ScheduleJobConfig, patch: ScheduleConfigInput): ScheduleJobConfig {
  const next: ScheduleJobConfig = { ...current };
  const built = buildScheduleConfig({ ...patch, type: patch.type ?? "EMAIL" });

  for (const [key, value] of Object.entries(built) as Array<[keyof ScheduleJobConfig, unknown]>) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export function stringifyScheduleConfig(config: ScheduleJobConfig): string {
  return JSON.stringify(config);
}

export function redactScheduleConfig(config: ScheduleJobConfig): ScheduleJobConfig {
  const redacted = { ...config };
  if (redacted.webHookUrl) redacted.webHookUrl = redactUrl(redacted.webHookUrl);
  if (redacted.appSecrete) redacted.appSecrete = "***REDACTED***";
  if (redacted.requestUrl) redacted.requestUrl = redactUrl(redacted.requestUrl);
  return redacted;
}

export function normalizeJobType(type: string): ScheduleJobType {
  const normalized = String(type).toUpperCase();
  if (!SCHEDULE_JOB_TYPES.includes(normalized as ScheduleJobType)) {
    throw new Error(`Unsupported schedule type: ${type}. Supported values: ${SCHEDULE_JOB_TYPES.join(", ")}`);
  }
  return normalized as ScheduleJobType;
}

export function splitRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function joinRecipients(value: unknown): string | undefined {
  const recipients = splitRecipients(value);
  return recipients.length ? recipients.join(";") : undefined;
}

function normalizeAttachments(value: unknown): ScheduleAttachmentType[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.toUpperCase()).map((item) => {
    if (!SCHEDULE_ATTACHMENT_TYPES.includes(item as ScheduleAttachmentType)) {
      throw new Error(`Unsupported attachment type: ${item}. Supported values: ${SCHEDULE_ATTACHMENT_TYPES.join(", ")}`);
    }
    return item as ScheduleAttachmentType;
  });
}

function normalizeVizContents(value: unknown, vizId?: string, vizType = "DASHBOARD"): ScheduleVizContent[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => item && typeof item === "object" ? item as Record<string, unknown> : undefined)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({ vizType: String(item.vizType ?? vizType), vizId: String(item.vizId ?? "") }))
      .filter((item) => item.vizId);
  }
  if (vizId) return [{ vizType, vizId }];
  return [];
}

function normalizeLegacyConfig(config: Record<string, unknown>): ScheduleJobConfig {
  const normalized: ScheduleJobConfig = { ...config } as ScheduleJobConfig;

  if (!normalized.vizContents) {
    const vizId = typeof config.vizId === "string" ? config.vizId : undefined;
    const vizType = typeof config.vizType === "string" ? config.vizType : "DASHBOARD";
    const vizContents = normalizeVizContents(undefined, vizId, vizType);
    if (vizContents.length) normalized.vizContents = vizContents;
  }
  if (Array.isArray(config.to)) normalized.to = joinRecipients(config.to);
  if (Array.isArray(config.cc)) normalized.cc = joinRecipients(config.cc);
  if (!normalized.attachments && typeof config.contentType === "string") {
    normalized.attachments = normalizeAttachments([config.contentType]);
  }

  delete (normalized as Record<string, unknown>).vizId;
  delete (normalized as Record<string, unknown>).vizType;
  delete (normalized as Record<string, unknown>).contentType;
  return normalized;
}

function redactUrl(value: string): string {
  return value ? "***REDACTED***" : value;
}
