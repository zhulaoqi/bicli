import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { BiCLIEngine } from "@bicli/core";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function startTui() {
  const skillsDir = resolve(__dirname, "../../../skills/definitions");
  const mcpServerPath = resolve(__dirname, "../../../mcp-server/src/index.ts");

  const engine = new BiCLIEngine({
    platform: "tui",
    skillsDir,
    mcpServerPath,
  });

  let mcpStatus: "connected" | "disconnected" | "connecting" = "connecting";

  try {
    await engine.initialize();
    mcpStatus = "connected";
  } catch (err) {
    mcpStatus = "disconnected";
    console.error(
      "[TUI] Engine initialization failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const status = engine.getStatus();

  render(
    <App
      engine={engine}
      model={status.model}
      role={status.role}
      mcpStatus={mcpStatus}
    />,
  );
}
