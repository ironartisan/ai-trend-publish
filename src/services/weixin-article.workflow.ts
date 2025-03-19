import { getDataSources } from "../data-sources/getDataSources.ts";
import { ContentRanker } from "@src/modules/content-rank/ai.content-ranker.ts";
import { ContentPublisher } from "@src/modules/interfaces/publisher.interface.ts";
import {
  ContentScraper,
  ScrapedContent,
} from "@src/modules/interfaces/scraper.interface.ts";
import { ContentSummarizer } from "@src/modules/interfaces/summarizer.interface.ts";
import { BarkNotifier } from "@src/modules/notify/bark.notify.ts";
import { WeixinPublisher } from "@src/modules/publishers/weixin.publisher.ts";
import { WeixinTemplate } from "../modules/render/weixin/interfaces/article.type.ts";
import { FireCrawlScraper } from "@src/modules/scrapers/fireCrawl.scraper.ts";
import { TwitterScraper } from "@src/modules/scrapers/twitter.scraper.ts";
import { AISummarizer } from "@src/modules/summarizer/ai.summarizer.ts";
import { ImageGeneratorFactory } from "@src/providers/image-gen/image-generator-factory.ts";
import { WeixinArticleTemplateRenderer } from "../modules/render/weixin/article.renderer.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import {
  WorkflowEntrypoint,
  WorkflowEnv,
  WorkflowEvent,
  WorkflowStep,
} from "@src/works/workflow.ts";
import { WorkflowTerminateError } from "@src/works/workflow-error.ts";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";
import { ImageGeneratorType } from "@src/providers/interfaces/image-gen.interface.ts";
const logger = new Logger("weixin-article-workflow");

interface WeixinWorkflowEnv {
  name: string;
}

// 工作流参数类型定义
interface WeixinWorkflowParams {
  sourceType?: "all" | "firecrawl" | "twitter";
  maxArticles?: number;
  forcePublish?: boolean;
}

export class WeixinArticleWorkflow
  extends WorkflowEntrypoint<WeixinWorkflowEnv, WeixinWorkflowParams> {
  private scraper: Map<string, ContentScraper>;
  private summarizer: ContentSummarizer;
  private publisher: WeixinPublisher;
  private notifier: BarkNotifier;
  private renderer: WeixinArticleTemplateRenderer;
  private contentRanker: ContentRanker;
  private stats = {
    success: 0,
    failed: 0,
    contents: 0,
  };

  constructor(env: WorkflowEnv<WeixinWorkflowEnv>) {
    super(env);
    this.scraper = new Map<string, ContentScraper>();
    this.scraper.set("fireCrawl", new FireCrawlScraper());
    this.scraper.set("twitter", new TwitterScraper());
    this.summarizer = new AISummarizer();
    this.publisher = new WeixinPublisher();
    this.notifier = new BarkNotifier();
    this.renderer = new WeixinArticleTemplateRenderer();
    this.contentRanker = new ContentRanker();
  }

  public getWorkflowStats(eventId: string) {
    return this.metricsCollector.getWorkflowEventMetrics(this.env.id, eventId);
  }

  async run(
    event: WorkflowEvent<WeixinWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    try {
      logger.info(
        `[工作流开始] 开始执行微信工作流, 当前工作流实例ID: ${this.env.id} 触发事件ID: ${event.id}`,
      );

      // 验证IP白名单
      await step.do("validate-ip-whitelist", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        const isWhitelisted = await this.publisher.validateIpWhitelist();
        if (typeof isWhitelisted === "string") {
          this.notifier.warning(
            "IP白名单验证失败",
            `当前服务器IP(${isWhitelisted})不在微信公众号IP白名单中，请在微信公众平台添加此IP地址`,
          );
          throw new WorkflowTerminateError(
            `当前服务器IP(${isWhitelisted})不在微信公众号IP白名单中，请在微信公众平台添加此IP地址`,
          );
        }
        return isWhitelisted;
      });
      await this.notifier.info("工作流开始", "开始执行内容抓取和处理");

      // 获取数据源
      const sourceConfigs = await step.do("fetch-sources", async () => {
        const configs = await getDataSources();
        if (!configs.firecrawl) {
          throw new WorkflowTerminateError("未找到firecrawl数据源配置");
        }
        if (!configs.twitter) {
          throw new WorkflowTerminateError("未找到twitter数据源配置");
        }
        return configs;
      });

      const totalSources = sourceConfigs.firecrawl.length +
        sourceConfigs.twitter.length;

      if (totalSources === 0) {
        throw new WorkflowTerminateError("未配置任何数据源");
      }

      logger.info(`[数据源] 发现 ${totalSources} 个数据源`);

      // 3. 抓取内容
      const allContents = await step.do("scrape-contents", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        const contents: ScrapedContent[] = [];

        // 创建抓取进度条
        const scrapeProgress = new ProgressBar({
          title: "内容抓取进度",
          total: totalSources,
          clear: true, // 完成后清除进度条
          display: ":title | :percent | :completed/:total | :time \n",
        });
        let scrapeCompleted = 0;
        let totalArticles = 0;

        // FireCrawl sources
        const fireCrawlScraper = this.scraper.get("fireCrawl");
        if (!fireCrawlScraper) {
          throw new WorkflowTerminateError("FireCrawlScraper not found");
        }

        for (const source of sourceConfigs.firecrawl) {
          const sourceContents = await this.scrapeSource(
            "FireCrawl",
            source,
            fireCrawlScraper,
          );
          contents.push(...sourceContents);
          totalArticles += sourceContents.length;
          await scrapeProgress.render(++scrapeCompleted, {
            title:
              `抓取 FireCrawl: ${source.identifier}  | 已获取文章: ${totalArticles}篇`,
          });
        }

        // Twitter sources
        const twitterScraper = this.scraper.get("twitter");
        if (!twitterScraper) {
          throw new WorkflowTerminateError("TwitterScraper not found");
        }

        for (const source of sourceConfigs.twitter) {
          const sourceContents = await this.scrapeSource(
            "Twitter",
            source,
            twitterScraper,
          );
          contents.push(...sourceContents);
          totalArticles += sourceContents.length;
          await scrapeProgress.render(++scrapeCompleted, {
            title:
              `抓取 Twitter: ${source.identifier} | 已获取文章: ${totalArticles}篇`,
          });
        }

        this.stats.contents = contents.length;
        if (this.stats.contents === 0) {
          throw new WorkflowTerminateError("未获取到任何内容，流程终止");
        }

        return contents;
      });

      // 4. 内容排序
      const rankedContents = await step.do("rank-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        logger.info(`[内容排序] 开始排序 ${allContents.length} 条内容`);
        const ranked = await this.contentRanker.rankContents(allContents);
        if (ranked.length === 0) {
          throw new WorkflowTerminateError("内容排序失败，没有任何内容被评分");
        }
        // 先按分数排序
        ranked.sort((a, b) => b.score - a.score);
        logger.info("[内容排序] 内容排序完成");
        return ranked;
      });

      // 5. 处理排序后的内容
      const processedContents = await step.do("process-contents", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "15 minutes",
      }, async () => {
        // 根据排名顺序获取对应的文章内容
        const topContents: ScrapedContent[] = [];
        const maxArticles = event.payload.maxArticles ||
          await ConfigManager.getInstance().get("ARTICLE_NUM");

        for (const ranked of rankedContents.slice(0, maxArticles)) {
          const content = allContents.find((c) => c.id === ranked.id);
          if (content) {
            content.metadata.score = ranked.score;
            content.metadata.wordCount = content.content.length;
            content.metadata.readTime = Math.ceil(
              content.metadata.wordCount / 275,
            );
            topContents.push(content);
          }
        }

        logger.debug(
          "[内容处理] 取出的文章（润色前）：",
          JSON.stringify(topContents, null, 2),
        );

        // 创建内容处理进度条
        const processProgress = new ProgressBar({
          title: "内容处理进度",
          total: topContents.length,
          clear: true,
          display: ":title | :percent | :completed/:total | :time \n",
        });
        let processCompleted = 0;

        // 并发处理所有内容
        await Promise.all(topContents.map(async (content, _) => {
          await this.processContent(content);
          await processProgress.render(++processCompleted, {
            title: `已处理: ${content.title?.slice(0, 5) || "无标题"}...`,
          });
        }));

        logger.debug(
          "[内容处理] 处理后的内容",
          JSON.stringify(topContents, null, 2),
        );
        return topContents;
      });

      // 6. 生成文章
      const { summaryTitle, mediaId, renderedTemplate } = await step.do(
        "generate-article",
        {
          retries: { limit: 2, delay: "5 second", backoff: "exponential" },
          timeout: "10 minutes",
        },
        async () => {
          // 准备模板数据
          const templateData: WeixinTemplate[] = processedContents.map(
            (content) => ({
              id: content.id,
              title: content.title,
              content: content.content,
              url: content.url,
              publishDate: content.publishDate,
              metadata: content.metadata,
              keywords: content.metadata.keywords,
              media: content.media,
            }),
          );

          // 生成总标题
          const title = await this.summarizer.generateTitle(
            processedContents.map((c) => c.title).join(" | "),
          ).then((t) => {
            t = `${new Date().toLocaleDateString()} AI速递 | ${t}`;
            return t.slice(0, 64);
          });

          // 生成封面图片
          const imageGenerator = await ImageGeneratorFactory.getInstance()
            .getGenerator(ImageGeneratorType.ALIWANX_POSTER);
          const imageUrl = await imageGenerator.generate({
            title: title.split(" | ")[1].trim().slice(0, 30),
            sub_title: new Date().toLocaleDateString() + " AI速递",
            prompt_text_zh: `科技前沿资讯 | 人工智能新闻 | 每日AI快报 - ${
              title.split(" | ")[1].trim().slice(0, 30)
            }`,
            generate_mode: "generate",
            generate_num: 1,
          });

          // 上传封面图片
          const media = await this.publisher.uploadImage(imageUrl);

          // 渲染模板
          const template = await this.renderer.render(templateData);

          return {
            summaryTitle: title,
            mediaId: media,
            renderedTemplate: template,
          };
        },
      );

      // 7. 发布文章
      await step.do("publish-article", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        logger.info("[发布] 发布到微信公众号");
        return await this.publisher.publish(
          renderedTemplate,
          summaryTitle,
          summaryTitle,
          mediaId,
        );
      });

      // 8. 完成报告
      const summary = `
        工作流执行完成
        - 数据源: ${totalSources} 个
        - 成功: ${this.stats.success} 个
        - 失败: ${this.stats.failed} 个
        - 内容: ${this.stats.contents} 条
        - 发布: 成功`.trim();

      logger.info(`[工作流完成] ${summary}`);

      if (this.stats.failed > 0) {
        await this.notifier.warning("工作流完成(部分失败)", summary);
      } else {
        await this.notifier.success("工作流完成", summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // 如果是终止错误，发送通知后直接抛出
      if (error instanceof WorkflowTerminateError) {
        await this.notifier.warning("工作流终止", message);
        throw error;
      }

      logger.error("[工作流] 执行失败:", message);
      await this.notifier.error("工作流失败", message);
      throw error;
    }
  }

  private async scrapeSource(
    type: string,
    source: { identifier: string },
    scraper: ContentScraper,
  ): Promise<ScrapedContent[]> {
    try {
      logger.debug(`[${type}] 抓取: ${source.identifier}`);
      const contents = await scraper.scrape(source.identifier);
      this.stats.success++;
      return contents;
    } catch (error) {
      this.stats.failed++;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[${type}] ${source.identifier} 抓取失败:`, message);
      await this.notifier.warning(
        `${type}抓取失败`,
        `源: ${source.identifier}\n错误: ${message}`,
      );
      return [];
    }
  }

  private async processContent(content: ScrapedContent): Promise<void> {
    try {
      const summary = await this.summarizer.summarize(JSON.stringify(content));
      content.title = summary.title;
      content.content = summary.content;
      content.metadata.keywords = summary.keywords;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[内容处理] ${content.id} 处理失败:`, message);
      await this.notifier.warning(
        "内容处理失败",
        `ID: ${content.id}\n保留原始内容`,
      );
      content.title = content.title || "无标题";
      content.content = content.content || "内容处理失败";
      content.metadata.keywords = content.metadata.keywords || [];
    }
  }
}
