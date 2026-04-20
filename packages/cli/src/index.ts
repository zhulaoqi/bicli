import { Command } from "commander";
import { chatCommand } from "./commands/chat.js";
import { configCommand } from "./commands/config-cmd.js";
import { mcpCommand } from "./commands/mcp-cmd.js";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/auth-cmd.js";
import { webCommand } from "./commands/web-cmd.js";

export function main(argv: string[]) {
  const program = new Command();

  program
    .name("bicli")
    .description("AI-powered terminal tool platform")
    .version("2.0.0");

  program.addCommand(chatCommand());
  program.addCommand(configCommand());
  program.addCommand(mcpCommand());
  program.addCommand(loginCommand());
  program.addCommand(logoutCommand());
  program.addCommand(whoamiCommand());
  program.addCommand(webCommand());

  program
    .action(() => {
      chatCommand().parseAsync(["node", "chat"], { from: "node" }).catch(console.error);
    });

  program.parse(argv);
}
