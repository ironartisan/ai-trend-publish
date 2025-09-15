import { WorkflowConfigService } from "./src/services/workflow-config.service.ts";
import { ConfigManager } from "./src/utils/config/config-manager.ts";
import { Logger } from "@zilla/logger";

const logger = new Logger("ConfigTest");

async function main() {
  logger.info("Initializing config sources...");
  await ConfigManager.getInstance().initDefaultConfigSources();
  
  logger.info("Checking workflow configurations by day:");
  const service = WorkflowConfigService.getInstance();
  
  for (let i = 1; i <= 7; i++) {
    try {
      const workflow = await service.getDailyWorkflow(i as 1|2|3|4|5|6|7);
      logger.info(`Day ${i} (${getDayName(i)}): ${workflow ?? "NULL"}`);
    } catch (error) {
      logger.error(`Error getting workflow for day ${i}: ${error.message}`);
    }
  }
  
  // Also check direct config values
  logger.info("Direct config values:");
  for (let i = 1; i <= 7; i++) {
    try {
      const configValue = await ConfigManager.getInstance().get<string>(`${i}_of_week_workflow`);
      logger.info(`${i}_of_week_workflow: ${configValue}`);
    } catch (error) {
      logger.error(`Error getting config for key ${i}_of_week_workflow: ${error.message}`);
    }
  }
}

function getDayName(day: number): string {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days[day - 1];
}

main(); 