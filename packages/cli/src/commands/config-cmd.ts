import { Command } from "commander";
import { ConfigManager, getAvailableProviders } from "@bicli/core";

export function configCommand() {
  const cmd = new Command("config")
    .description("Manage BiCLI configuration");

  cmd
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const manager = new ConfigManager();
      const config = manager.load();
      const providers = getAvailableProviders();

      console.log(JSON.stringify(config, null, 2));
      console.log("\nLLM Providers:");
      for (const p of providers) {
        const icon = p.available ? "●" : "○";
        const current = p.provider === config.model.provider ? " ← current" : "";
        console.log(`  ${icon} ${p.provider} (${p.envKey})${current}`);
      }
    });

  cmd
    .command("set <key> <value>")
    .description("Set a configuration value (e.g., model.provider alibaba)")
    .action((key: string, value: string) => {
      const manager = new ConfigManager();
      const config = manager.load();

      const keys = key.split(".");
      let obj: any = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
      }

      const finalKey = keys[keys.length - 1];
      const numVal = Number(value);
      obj[finalKey] = isNaN(numVal) ? value : numVal;

      manager.save(config);
      console.log(`Set ${key} = ${value}`);
    });

  cmd
    .command("reset")
    .description("Reset configuration to defaults")
    .action(() => {
      const manager = new ConfigManager();
      manager.save(manager.getDefault());
      console.log("Configuration reset to defaults.");
    });

  return cmd;
}
