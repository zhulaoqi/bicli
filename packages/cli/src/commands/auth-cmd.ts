import { Command } from "commander";
import { ConfigManager } from "@bicli/core";

export function loginCommand() {
  return new Command("login")
    .description("Login to a production system (save auth token)")
    .requiredOption("--token <token>", "Authentication token from your system")
    .option("--endpoint <url>", "MCP Server endpoint URL")
    .option("--expires <datetime>", "Token expiration (ISO 8601)")
    .action((options) => {
      const configManager = new ConfigManager();
      configManager.setAuth({
        token: options.token,
        endpoint: options.endpoint,
        expiresAt: options.expires,
      });
      console.log("✅ 已保存认证信息");
      if (options.endpoint) console.log(`   Endpoint: ${options.endpoint}`);
      console.log("   后续所有 MCP 调用将使用 token 认证模式");
      console.log("   使用 bicli logout 清除认证");
    });
}

export function logoutCommand() {
  return new Command("logout")
    .description("Clear saved auth token")
    .action(() => {
      const configManager = new ConfigManager();
      configManager.clearAuth();
      console.log("✅ 已清除认证信息，回到本地模式 (userId + role)");
    });
}

export function whoamiCommand() {
  return new Command("whoami")
    .description("Show current authentication status")
    .action(() => {
      const configManager = new ConfigManager();
      const config = configManager.load();

      if (configManager.isAuthenticated()) {
        const auth = config.auth!;
        console.log("🔑 认证模式: Token");
        console.log(`   Token: ${auth.token!.slice(0, 8)}...${auth.token!.slice(-4)}`);
        if (auth.endpoint) console.log(`   Endpoint: ${auth.endpoint}`);
        if (auth.expiresAt) {
          const exp = new Date(auth.expiresAt);
          const now = new Date();
          const diff = Math.floor((exp.getTime() - now.getTime()) / 1000 / 60);
          console.log(`   过期时间: ${auth.expiresAt} (${diff > 0 ? `剩余 ${diff} 分钟` : "已过期"})`);
        }
      } else {
        console.log("👤 认证模式: 本地配置");
        console.log(`   userId: ${config.user.userId}`);
        console.log(`   role: ${config.user.role}`);
        console.log("   使用 bicli login --token <token> 切换到 Token 认证");
      }
    });
}
