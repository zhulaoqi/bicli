import { describe, expect, it } from "vitest";
import {
  buildScheduleConfig,
  mergeScheduleConfig,
  parseScheduleConfig,
  redactScheduleConfig,
} from "../datart-schedule-config.js";

describe("Datart schedule config helpers", () => {
  it("builds backend-compatible email config from business inputs", () => {
    const config = buildScheduleConfig({
      type: "EMAIL",
      recipients: ["a@example.com", "b@example.com"],
      cc: ["leader@example.com"],
      subject: "日报",
      textContent: "请查收",
      attachments: ["IMAGE", "EXCEL"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
      imageWidth: 1200,
    });

    expect(config).toEqual({
      to: "a@example.com;b@example.com",
      cc: "leader@example.com",
      subject: "日报",
      textContent: "请查收",
      attachments: ["IMAGE", "EXCEL"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
      imageWidth: 1200,
    });
  });

  it("builds feishu self-application config and redacts secrets", () => {
    const config = buildScheduleConfig({
      type: "FEISHU",
      recipients: ["oc_group", "user@example.com"],
      subject: "飞书推送",
      pushMode: "selfApplication",
      appId: "cli_xxx",
      appSecrete: "secret_xxx",
      attachments: ["IMAGE"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_1" }],
    });

    expect(config).toMatchObject({
      to: "oc_group;user@example.com",
      pushMode: "selfApplication",
      appId: "cli_xxx",
      appSecrete: "secret_xxx",
    });
    expect(redactScheduleConfig(config)).toMatchObject({
      appId: "cli_xxx",
      appSecrete: "***REDACTED***",
    });
  });

  it("parses legacy JSON and merges partial updates without losing existing fields", () => {
    const current = parseScheduleConfig(JSON.stringify({
      to: "old@example.com",
      subject: "旧主题",
      attachments: ["IMAGE"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_old" }],
      webHookUrl: "https://qyapi.weixin.qq.com/webhook",
    }));

    const merged = mergeScheduleConfig(current, {
      subject: "新主题",
      recipients: ["new@example.com"],
    });

    expect(merged).toEqual({
      to: "new@example.com",
      subject: "新主题",
      attachments: ["IMAGE"],
      vizContents: [{ vizType: "DASHBOARD", vizId: "folder_old" }],
      webHookUrl: "https://qyapi.weixin.qq.com/webhook",
    });
  });

  it("rejects unsupported job and attachment types", () => {
    expect(() => buildScheduleConfig({
      type: "DINGDING",
      recipients: ["a@example.com"],
    })).toThrow("Unsupported schedule type");

    expect(() => buildScheduleConfig({
      type: "EMAIL",
      recipients: ["a@example.com"],
      attachments: ["CSV"],
    })).toThrow("Unsupported attachment type");
  });
});
