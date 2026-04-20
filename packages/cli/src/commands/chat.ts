import { Command } from "commander";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BiCLIEngine, isSlashCommand, type ChatEvent } from "@bicli/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function chatCommand() {
  const cmd = new Command("chat")
    .description("Start AI chat session")
    .option("-m, --message <message>", "Send a single message (non-interactive)")
    .action(async (options) => {
      if (options.message) {
        await handleSingleMessage(options.message);
      } else {
        const { startTui } = await import("../tui/index.js");
        await startTui();
      }
    });

  return cmd;
}

async function handleSingleMessage(message: string) {
  const skillsDir = resolve(__dirname, "../../../skills/definitions");
  const mcpServerPath = resolve(__dirname, "../../../mcp-server/src/index.ts");

  const engine = new BiCLIEngine({
    platform: "tui",
    skillsDir,
    mcpServerPath,
  });

  try {
    await engine.initialize();
    const status = engine.getStatus();
    console.log(`Using ${status.model}`);

    if (isSlashCommand(message)) {
      const result = await engine.executeSlashCommand(message);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    let fullText = "";
    for await (const event of engine.chat(message)) {
      switch (event.type) {
        case "text_delta":
          process.stdout.write(event.content || "");
          break;
        case "tool_call_start":
          console.log(`  → calling ${event.toolName}...`);
          break;
        case "tool_call_end":
          console.log(`  ← ${event.toolName} done`);
          break;
        case "error":
          console.error(`Error: ${event.message}`);
          break;
        case "done":
          fullText = event.fullText || "";
          break;
      }
    }
    if (fullText) console.log();
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
  } finally {
    await engine.dispose();
  }
}
