import { initCronJobs } from "./controllers/cron";
import { ConfigManager } from "./utils/config/config-manager";

async function bootstrap() {
  const configManager = ConfigManager.getInstance();
  await configManager.initDefaultConfigSources();

  initCronJobs();
}

bootstrap().catch(console.error);
