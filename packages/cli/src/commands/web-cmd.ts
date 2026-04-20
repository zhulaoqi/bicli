import { Command } from "commander";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function webCommand() {
  return new Command("web")
    .description("Start Web GUI interface")
    .option("-p, --port <port>", "Port number", "3210")
    .option("--host <host>", "Host to bind", "127.0.0.1")
    .action(async (options) => {
      try {
        const { startWebServer } = await import("@bicli/web");
        await startWebServer({
          port: parseInt(options.port, 10),
          host: options.host,
          skillsDir: resolve(__dirname, "../../../skills/definitions"),
          mcpServerPath: resolve(__dirname, "../../../mcp-server/src/index.ts"),
        });
      } catch (err) {
        if (String(err).includes("Cannot find package")) {
          console.error("Error: @bicli/web 未安装。请运行: pnpm install");
        } else {
          console.error("Error:", err instanceof Error ? err.message : err);
        }
        process.exit(1);
      }
    });
}
