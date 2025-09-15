import { WorkflowType } from "@src/controllers/cron.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import { Logger } from "@zilla/logger";

const logger = new Logger("WorkflowConfigService");

export interface DailyWorkflowConfig {
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1-7，表示周一到周日
  workflowType: WorkflowType;
  isEnabled: boolean;
}

export class WorkflowConfigService {
  private static instance: WorkflowConfigService;
  private constructor() {}

  public static getInstance(): WorkflowConfigService {
    if (!WorkflowConfigService.instance) {
      WorkflowConfigService.instance = new WorkflowConfigService();
    }
    return WorkflowConfigService.instance;
  }

  async getDailyWorkflow(
    dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  ): Promise<WorkflowType | null> {
    try {
      // workflowType 将会是以下三个字符串之一:
      // - "weixin-article-workflow"
      // - "weixin-aibench-workflow"
      // - "weixin-hellogithub-workflow"
      const workflowType = await ConfigManager.getInstance().get<string>(
        `${dayOfWeek}_of_week_workflow`,
      );
      
      if (!workflowType) {
        return null;
      }
      
      // Convert the string value directly to the corresponding enum based on value matching
      switch (workflowType) {
        case "weixin-article-workflow":
          return WorkflowType.WeixinArticle;
        case "weixin-aibench-workflow":
          return WorkflowType.WeixinAIBench;
        case "weixin-hellogithub-workflow":
          return WorkflowType.WeixinHelloGithub;
        default:
          logger.warn(`Unknown workflow type: ${workflowType}, falling back to WeixinArticle`);
          return WorkflowType.WeixinArticle;
      }
    } catch (error) {
      logger.error("获取工作流配置失败:", error);
      return WorkflowType.WeixinArticle;
    }
  }
}
