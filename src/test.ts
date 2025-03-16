// deno-lint-ignore-file no-unused-vars
import { WeixinArticleWorkflow } from "@src/services/weixin-article.workflow.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import { EnvConfigSource } from "@src/utils/config/sources/env-config.source.ts";
import { DbConfigSource } from "@src/utils/config/sources/db-config.source.ts";
import { WeixinAIBenchWorkflow } from "@src/services/weixin-aibench.workflow.ts";
import { WeixinHelloGithubWorkflow } from "@src/services/weixin-hellogithub.workflow.ts";
import { Logger, LogLevel } from "@zilla/logger";

const logger = new Logger("test");
Logger.level = LogLevel.DEBUG;

async function bootstrap() {
  const configManager = ConfigManager.getInstance();
  await configManager.initDefaultConfigSources();

  const weixinWorkflow = new WeixinArticleWorkflow({
    id: "test-workflow",
    env: {
      name: "test-workflow",
    },
  });

  await weixinWorkflow.execute({
    payload: {
      sourceType: "all",
      maxArticles: 10,
      forcePublish: true,
    },
    id: "manual-action",
    timestamp: Date.now(),
  });

  const stats = weixinWorkflow.getWorkflowStats("manual-action");
  logger.debug("Workflow stats:", stats);

  // const weixinAIBenchWorkflow = new WeixinAIBenchWorkflow();
  // await weixinAIBenchWorkflow.process();

  // const weixinHelloGithubWorkflow = new WeixinHelloGithubWorkflow();
  // await weixinHelloGithubWorkflow.process();
}

bootstrap().catch(console.error);
