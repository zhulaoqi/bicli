import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  reportTelemetry,
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetryEvent,
} from "../telemetry.js";

const baseEvent: TelemetryEvent = {
  sessionId: 1,
  success: true,
  route: "realtime_query",
  routerSource: "rule",
  domains: ["schedule"],
  toolCallCount: 1,
  reflectVerdict: "ok",
  repairCount: 0,
  critiqueCount: 0,
  durations: {
    routerMs: 4,
    actMs: 320,
    finalizeMs: 410,
    reflectMs: 1,
    repairMs: 0,
  },
};

describe("reportTelemetry", () => {
  beforeEach(() => {
    resetTelemetrySink();
  });

  it("invokes the registered sink with the event", async () => {
    const sink = vi.fn().mockResolvedValue(undefined);
    setTelemetrySink(sink);
    await reportTelemetry(baseEvent);
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 1,
      route: "realtime_query",
      routerSource: "rule",
      reflectVerdict: "ok",
    }));
  });

  it("never throws even if sink rejects", async () => {
    const sink = vi.fn().mockRejectedValue(new Error("network down"));
    setTelemetrySink(sink);
    await expect(reportTelemetry(baseEvent)).resolves.toBeUndefined();
  });

  it("noop sink when AGENT_TELEMETRY=off", async () => {
    const prev = process.env.AGENT_TELEMETRY;
    process.env.AGENT_TELEMETRY = "off";
    try {
      const sink = vi.fn();
      setTelemetrySink(sink);
      await reportTelemetry(baseEvent);
      expect(sink).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.AGENT_TELEMETRY;
      else process.env.AGENT_TELEMETRY = prev;
    }
  });

  it("uses default stdout sink when no sink is set (no throw, prints JSON)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await reportTelemetry(baseEvent);
      expect(spy).toHaveBeenCalledTimes(1);
      const printed = spy.mock.calls[0][0];
      expect(typeof printed).toBe("string");
      expect(printed).toContain("[telemetry]");
      expect(printed).toContain("realtime_query");
    } finally {
      spy.mockRestore();
    }
  });
});
