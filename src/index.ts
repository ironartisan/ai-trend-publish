import { startCronJobs } from "@src/controllers/cron.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import { Logger, LogLevel } from "@zilla/logger";
async function bootstrap() {
  const configManager = ConfigManager.getInstance();
  await configManager.initDefaultConfigSources();

  Logger.level = LogLevel.INFO;

  startCronJobs();
}

bootstrap().catch(console.error);
