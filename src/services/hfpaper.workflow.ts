// 1.仿照weixin-article-workflow爬取 https://huggingface.co/papers 的paper
// 2.使用axios爬取paper的详情
// 3.使用ai生成摘要
// 4.渲染内容并生成并发布

import axios from "npm:axios";
import { Logger } from "@zilla/logger";
import ProgressBar from "jsr:@deno-library/progress";

import { ScrapedContent } from "@src/modules/interfaces/scraper.interface.ts";
import { AISummarizer } from "@src/modules/summarizer/ai.summarizer.ts";
import { WeixinPublisher } from "@src/modules/publishers/weixin.publisher.ts";
import { WeixinArticleTemplateRenderer } from "@src/modules/render/article.renderer.ts";
import { BarkNotifier } from "@src/modules/notify/bark.notify.ts";
import { ImageGeneratorFactory } from "@src/providers/image-gen/image-generator-factory.ts";
import { WeixinTemplate } from "@src/modules/render/interfaces/article.type.ts";
import { 
  WorkflowEntrypoint, 
  WorkflowEvent, 
  WorkflowStep 
} from "@src/works/workflow.ts";
import { WorkflowTerminateError } from "@src/works/workflow-error.ts";

const logger = new Logger("hfpaper-workflow");

interface HFPaper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  url: string;
  publishDate: string;
  pdfUrl: string;
}

interface HFPaperWorkflowEnv {
  id?: string;
}

interface HFPaperWorkflowParams {
  maxPapers?: number;
  forcePublish?: boolean;
}

interface Media {
  type: string;
  url: string;
  size: "small" | "medium" | "large";
}

export class HFPaperWorkflow extends WorkflowEntrypoint<HFPaperWorkflowEnv, HFPaperWorkflowParams> {
  private summarizer: AISummarizer;
  private publisher: WeixinPublisher;
  private renderer: WeixinArticleTemplateRenderer;
  private notifier: BarkNotifier;
  private stats = {
    scraped: 0,
    processed: 0,
    published: 0,
    failed: 0
  };

  constructor(env: HFPaperWorkflowEnv = {}) {
    super(env);
    this.summarizer = new AISummarizer();
    this.publisher = new WeixinPublisher();
    this.renderer = new WeixinArticleTemplateRenderer();
    this.notifier = new BarkNotifier();
  }

  async run(
    event: WorkflowEvent<HFPaperWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    try {
      logger.info("=== 开始执行 HuggingFace Papers 工作流 ===");
      await this.notifier.info("HF论文工作流开始", "开始爬取和处理论文数据");

      // 1. 获取论文列表
      const papers = await step.do("scrape-papers", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        const papers = await this.scrapePapers();
        this.stats.scraped = papers.length;
        
        if (papers.length === 0) {
          throw new WorkflowTerminateError("未获取到任何论文数据");
        }
        
        logger.info(`获取到 ${papers.length} 篇论文`);
        return papers;
      });

      // 2. 获取论文详情
      const paperDetails = await step.do("get-paper-details", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "10 minutes",
      }, async () => {
        const details = await this.getPaperDetails(papers);
        if (details.length === 0) {
          throw new WorkflowTerminateError("未能获取到任何论文详情");
        }
        logger.info(`成功获取 ${details.length} 篇论文详情`);
        return details;
      });

      // 3. 生成摘要
      const processedPapers = await step.do("process-papers", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "15 minutes",
      }, async () => {
        const maxPapers = event.payload.maxPapers || 5;
        const papers = paperDetails.slice(0, maxPapers);
        
        // 创建内容处理进度条
        const processProgress = new ProgressBar({
          title: "论文处理进度",
          total: papers.length,
          clear: true,
          display: ":title | :percent | :completed/:total | :time \n",
        });
        
        let processCompleted = 0;
        const processed: ScrapedContent[] = [];
        
        for (const paper of papers) {
          try {
            await this.processPaper(paper);
            processed.push(paper);
            await processProgress.render(++processCompleted, {
              title: `已处理: ${paper.title?.slice(0, 10) || "无标题"}...`,
            });
          } catch (error) {
            this.stats.failed++;
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`处理论文失败 [${paper.id}]: ${message}`);
            
            // 使用原始内容
            paper.metadata.keywords = paper.metadata.keywords || [];
            processed.push(paper);
            await processProgress.render(++processCompleted, {
              title: `处理失败: ${paper.title?.slice(0, 10) || "无标题"}...`,
            });
          }
        }
        
        this.stats.processed = processed.length;
        logger.info(`成功处理 ${processed.length} 篇论文`);
        return processed;
      });

      // 4. 渲染内容
      const { title, mediaId, renderedTemplate } = await step.do("render-content", {
        retries: { limit: 2, delay: "5 second", backoff: "exponential" },
        timeout: "10 minutes", 
      }, async () => {
        const date = new Date().toLocaleDateString();
        const title = `最新AI论文精选 | ${date}`;
        
        // 生成封面图片，失败时使用默认图片
        let imageUrl: string;
        try {
          logger.info("[封面生成] 开始生成AI封面图片");
          const imageGenerator = await ImageGeneratorFactory.getInstance()
            .getGenerator("ALIWANX_POSTER");
          imageUrl = await imageGenerator.generate({
            title: "AI前沿研究",
            sub_title: `论文精选 ${date}`,
            prompt_text_zh: "人工智能论文 | 前沿研究 | 科技进展 | 学术前沿",
            generate_mode: "generate",
            generate_num: 1,
          });
          logger.info("[封面生成] AI封面图片生成成功");
        } catch (error) {
          logger.warn("[封面生成] AI图片生成失败，使用默认封面:", error);
          // 使用项目中的默认图片
          imageUrl = "file:///home/chenyuli/github/push/ai-trend-publish/examples/news.png";
        }

        // 上传封面图片
        const mediaId = await this.publisher.uploadImage(imageUrl);

        // 准备模板数据
        const templateData: WeixinTemplate[] = processedPapers.map(paper => {
          const paperMedia = paper.media ? paper.media.map(m => ({
            type: m.type,
            url: m.url,
            size: m.size || "medium"
          })) : [];
          
          return {
            id: paper.id,
            title: paper.title,
            content: paper.content,
            url: paper.url,
            publishDate: paper.publishDate,
            metadata: paper.metadata,
            keywords: paper.metadata.keywords,
            media: paperMedia,
          };
        });

        // 渲染模板
        const renderedTemplate = await this.renderer.render(templateData);
        
        return { title, mediaId, renderedTemplate };
      });

      // 5. 发布内容
      const publishResult = await step.do("publish-content", {
        retries: { limit: 3, delay: "10 second", backoff: "exponential" },
        timeout: "5 minutes",
      }, async () => {
        logger.info("发布内容到微信公众号");
        const result = await this.publisher.publish(
          renderedTemplate,
          title,
          title,
          mediaId
        );
        
        this.stats.published = 1;
        return result;
      });

      // 6. 完成报告
      const summary = `
        HuggingFace论文工作流执行完成
        - 爬取论文: ${this.stats.scraped} 篇
        - 处理论文: ${this.stats.processed} 篇
        - 失败处理: ${this.stats.failed} 篇
        - 发布状态: ${publishResult.status}
      `.trim();

      logger.info(`=== ${summary} ===`);
      
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

  /**
   * 爬取HuggingFace论文列表
   */
  private async scrapePapers(): Promise<HFPaper[]> {
    try {
      logger.info("开始爬取HuggingFace论文列表");
      const response = await axios.get("https://huggingface.co/papers");
      
      // 使用cheerio解析HTML
      const html = response.data;
      const cheerio = await import("npm:cheerio");
      const $ = cheerio.load(html);
      
      const papers: HFPaper[] = [];
      
      // 论文列表项选择器可能需要根据实际HTML结构调整
      $(".paper-card").each((index, element) => {
        try {
          const $el = $(element);
          const id = $el.attr("data-paper-id") || `paper-${index}`;
          const title = $el.find(".paper-title").text().trim();
          const abstract = $el.find(".paper-abstract").text().trim();
          const url = new URL($el.find(".paper-link").attr("href") || "", "https://huggingface.co").toString();
          
          // 提取作者信息
          const authors: string[] = [];
          $el.find(".paper-authors .author").each((_, authorEl) => {
            authors.push($(authorEl).text().trim());
          });
          
          // 提取发布日期和PDF链接
          const publishDate = $el.find(".paper-date").text().trim() || new Date().toISOString().split('T')[0];
          const pdfUrl = $el.find(".paper-pdf-link").attr("href") || "";
          
          papers.push({
            id,
            title,
            abstract,
            authors,
            url,
            publishDate,
            pdfUrl
          });
        } catch (error) {
          logger.warn(`解析论文项时出错: ${error}`);
        }
      });
      
      logger.info(`成功解析 ${papers.length} 篇论文`);
      
      // 只返回最新的10篇论文
      return papers.slice(0, 10);
    } catch (error) {
      logger.error("爬取论文列表失败:", error);
      throw error;
    }
  }

  /**
   * 获取论文详细信息
   */
  private async getPaperDetails(papers: HFPaper[]): Promise<ScrapedContent[]> {
    logger.info("开始获取论文详情");
    const scraped: ScrapedContent[] = [];
    
    // 创建进度条
    const scrapeProgress = new ProgressBar({
      title: "论文详情获取进度",
      total: papers.length,
      clear: true,
      display: ":title | :percent | :completed/:total | :time \n",
    });
    
    let scrapeCompleted = 0;
    
    for (const paper of papers) {
      try {
        logger.info(`获取论文详情: ${paper.title}`);
        
        // 获取论文详情页
        const response = await axios.get(paper.url);
        const html = response.data;
        const cheerio = await import("npm:cheerio");
        const $ = cheerio.load(html);
        
        // 提取更详细的内容
        let fullAbstract = paper.abstract;
        const detailAbstract = $(".paper-abstract-full").text().trim();
        if (detailAbstract && detailAbstract.length > fullAbstract.length) {
          fullAbstract = detailAbstract;
        }
        
        // 提取论文图片
        const media: Media[] = [];
        $(".paper-image img").each((_, imgEl) => {
          const imgUrl = $(imgEl).attr("src");
          if (imgUrl) {
            media.push({
              type: "image",
              url: new URL(imgUrl, paper.url).toString(),
              size: "medium"
            });
          }
        });
        
        // 提取分类/标签信息
        const categories: string[] = [];
        $(".paper-categories .category").each((_, catEl) => {
          categories.push($(catEl).text().trim());
        });
        
        // 构建ScrapedContent对象
        scraped.push({
          id: paper.id,
          title: paper.title,
          content: fullAbstract,
          url: paper.url,
          publishDate: paper.publishDate,
          media,
          metadata: {
            authors: paper.authors,
            pdfUrl: paper.pdfUrl,
            source: "huggingface",
            keywords: categories,
            categories
          },
          score: 0,
        });
        
        await scrapeProgress.render(++scrapeCompleted, {
          title: `获取详情: ${paper.title.slice(0, 10)}...`,
        });
        
        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(`获取论文详情失败 [${paper.id}]: ${error}`);
        
        // 继续处理下一篇论文，使用基本信息构建
        scraped.push({
          id: paper.id,
          title: paper.title,
          content: paper.abstract,
          url: paper.url,
          publishDate: paper.publishDate,
          media: [],
          metadata: {
            authors: paper.authors,
            pdfUrl: paper.pdfUrl,
            source: "huggingface",
            keywords: [],
          },
          score: 0,
        });
        
        await scrapeProgress.render(++scrapeCompleted, {
          title: `获取失败: ${paper.title.slice(0, 10)}...`,
        });
      }
    }
    
    return scraped;
  }

  /**
   * 处理单篇论文
   */
  private async processPaper(paper: ScrapedContent): Promise<void> {
    // 使用AI生成摘要
    const summary = await this.summarizer.summarize(JSON.stringify(paper));
    
    // 更新论文内容
    paper.title = summary.title;
    paper.content = summary.content;
    paper.metadata.keywords = summary.keywords;
  }
}
