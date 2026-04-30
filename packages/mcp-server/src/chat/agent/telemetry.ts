/**
 * Agent runtime telemetry：记录每次 chat 流的关键运行参数，便于离线观察。
 *
 * 默认把事件用 console.log 打印（stdout sink），便于在容器里直接读日志；
 * 设置 AGENT_TELEMETRY=off 可整体关闭；
 * 设置 AGENT_TELEMETRY=http + AGENT_TELEMETRY_URL 走 HTTP POST sink；
 * 测试可调用 setTelemetrySink 注入 mock sink，调用 resetTelemetrySink 还原默认行为。
 */

export interface TelemetryDurations {
  routerMs: number;
  actMs: number;
  finalizeMs: number;
  reflectMs: number;
  repairMs: number;
}

export interface TelemetryEvent {
  sessionId: number | string;
  success: boolean;
  route: string;
  routerSource: string;
  domains: string[];
  toolCallCount: number;
  reflectVerdict: string;
  repairCount: number;
  critiqueCount: number;
  durations: TelemetryDurations;
}

export type TelemetrySink = (event: TelemetryEvent) => void | Promise<void>;

let activeSink: TelemetrySink | null = null;

export function setTelemetrySink(sink: TelemetrySink): void {
  activeSink = sink;
}

export function resetTelemetrySink(): void {
  activeSink = null;
}

export async function reportTelemetry(event: TelemetryEvent): Promise<void> {
  if (process.env.AGENT_TELEMETRY === "off") return;

  const sink = activeSink ?? defaultSink();
  try {
    await sink(event);
  } catch (err) {
    // sink 永远不能阻断主流程
    console.warn(
      "[telemetry] sink threw, swallowing:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function defaultSink(): TelemetrySink {
  const mode = (process.env.AGENT_TELEMETRY || "stdout").toLowerCase();
  if (mode === "http") {
    return httpSink(process.env.AGENT_TELEMETRY_URL);
  }
  return stdoutSink;
}

const stdoutSink: TelemetrySink = (event) => {
  console.log(`[telemetry] ${JSON.stringify(event)}`);
};

function httpSink(url: string | undefined): TelemetrySink {
  if (!url) {
    console.warn("[telemetry] AGENT_TELEMETRY=http but AGENT_TELEMETRY_URL is empty, falling back to stdout");
    return stdoutSink;
  }
  return async (event) => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (err) {
      console.warn(
        "[telemetry] http POST failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  };
}
