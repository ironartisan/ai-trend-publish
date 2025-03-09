import { Workflow } from "./interfaces/workflow.interface";
import { FireCrawlAPI } from "../api/firecrawl.api";
import { ArticleTemplateRenderer } from "../modules/render";
import { WeixinPublisher } from "../modules/publishers/weixin.publisher";
import { BarkNotifier } from "../modules/notify/bark.notify";
import { ImageGeneratorFactory } from "../providers/image-gen/image-generator-factory";
import { AISummarizer } from "../modules/summarizer/ai.summarizer";
import * as cliProgress from "cli-progress";
import { Summary } from "../modules/interfaces/summarizer.interface";

interface PaperContent {
  id: string;
  title: string;
  url: string;
  content: string;
  publishDate: string;
  metadata: {
    keywords: string[];
    authors?: string[];
    abstract?: string;
    twitterUrl?: string;
  };
}

export class PaperWorkflow implements Workflow {
  private crawler: FireCrawlAPI;
  private renderer: ArticleTemplateRenderer;
  private publisher: WeixinPublisher;
  private notifier: BarkNotifier;
  private summarizer: AISummarizer;
  private stats = {
    success: 0,
    failed: 0,
    contents: 0,
  };

  constructor() {
    this.crawler = new FireCrawlAPI();
    this.renderer = new ArticleTemplateRenderer();
    this.publisher = new WeixinPublisher();
    this.notifier = new BarkNotifier();
    this.summarizer = new AISummarizer();
  }

  async refresh(): Promise<void> {
    await this.publisher.refresh();
  }

  private async extractPapersFromGithub(): Promise<{title: string, url: string, twitterUrl?: string}[]> {
    const githubUrl = "https://raw.githubusercontent.com/dair-ai/ML-Papers-of-the-Week/main/README.md";
    const markdownContent = await this.crawler.fetchContent(githubUrl);
    
    console.log("[DEBUG] Raw Markdown Content:", markdownContent.substring(0, 500));
    
    // 解析Markdown表格中的论文信息
    const papers: {title: string, url: string, twitterUrl?: string}[] = [];
    
    // 首先找到第一个表格的范围
    const tableStartRegex = /^\|\s*\*\*Paper\*\*\s*\|\s*\*\*Links\*\*\s*\|/m;
    const tableStartMatch = markdownContent.match(tableStartRegex);
    
    if (!tableStartMatch) {
      console.log("[DEBUG] 未找到表格开始标记");
      return papers;
    }
    
    // 从表格开始位置截取内容
    const contentFromTableStart = markdownContent.slice(tableStartMatch.index);
    
    // 找到下一个标题（## 开头）作为表格的结束位置
    const nextHeaderRegex = /^\s*##\s/m;
    const nextHeaderMatch = contentFromTableStart.match(nextHeaderRegex);
    
    // 如果找到下一个标题，就截取到那里，否则使用全部剩余内容
    const tableContent = nextHeaderMatch 
      ? contentFromTableStart.slice(0, nextHeaderMatch.index)
      : contentFromTableStart;
    
    console.log("[DEBUG] 提取的表格内容:", tableContent);
    
    // 按行分割表格内容
    const tableLines = tableContent.split('\n').filter(line => line.trim());
    
    // 跳过表头和分隔行
    const contentRows = tableLines.slice(2);
    
    for (const row of contentRows) {
      if (!row.includes('|')) continue;
      
      // 分割单元格内容
      const cells = row.split('|').map(cell => cell.trim()).filter(cell => cell);
      if (cells.length < 2) continue;
      
      const contentCell = cells[0];
      const linksCell = cells[1];
      
      // 从内容单元格提取标题
      let title = '';
      
      // 提取标题 - 从数字编号后到第一个双空格或换行
      const titleMatch = contentCell.match(/^\d+\)\s*([^<]+?)(?=\s{2}|\s*<br>|\s*$)/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        // 回退策略：取第一行内容
        title = contentCell.split(/\s{2}|\s*<br>/)[0].replace(/^\d+\)\s*/, '').trim();
      }
      
      console.log("[DEBUG] Extracted Title:", title);
      
      // 从链接单元格提取论文链接和Twitter链接
      const paperLinkMatch = linksCell.match(/\[(Paper|Technical Report)\]\((.*?)\)/i);
      const twitterLinkMatch = linksCell.match(/\[Tweet\]\((.*?)\)/i);
      
      const paperUrl = paperLinkMatch ? paperLinkMatch[2] : '';
      const twitterUrl = twitterLinkMatch ? twitterLinkMatch[1] : undefined;
      
      console.log("[DEBUG] Paper URL:", paperUrl);
      console.log("[DEBUG] Twitter URL:", twitterUrl);
      
      if (title && paperUrl) {
        papers.push({ 
          title, 
          url: paperUrl,
          twitterUrl
        });
        console.log("[DEBUG] Added paper:", { title, url: paperUrl, twitterUrl });
      }
    }
    
    return papers;
  }

  private async processPaper(paper: {title: string, url: string, twitterUrl?: string}, index: number): Promise<PaperContent> {
    try {
      // 获取论文内容
      const paperContent = await this.crawler.fetchContent(paper.url);
      
      // 限制内容长度，取前 4000 个字符
      const truncatedContent = paperContent.substring(0, 8000);
      console.log(`[内容处理] ${paper.title} 原始内容长度: ${paperContent.length}, 截断后长度: ${truncatedContent.length}`);
      
      // 使用AI总结论文内容
      const summary = await this.summarizer.summarize(truncatedContent, {
        minLength: 200,
        maxLength: 500,
        language: "中文"
      });
      
      this.stats.success++;
      this.stats.contents++;
      
      return {
        id: `paper-${index}`,
        title: paper.title || summary.title || "无标题",
        url: paper.url,
        content: summary.content,
        publishDate: new Date().toISOString(),
        metadata: {
          keywords: summary.keywords || [],
          twitterUrl: paper.twitterUrl
        }
      };
    } catch (error) {
      this.stats.failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[内容处理] ${paper.title} 处理失败:`, message);
      
      // 如果是 API 错误，尝试不同的参数重试
      if (message.includes('HTTP error! status: 400')) {
        try {
          console.log(`[内容处理] ${paper.title} 尝试使用备用参数重试...`);
          const summary = await this.summarizer.summarize(paper.title, {
            minLength: 100,
            maxLength: 500,
            language: "中文"
          });
          
          return {
            id: `paper-${index}`,
            title: paper.title,
            url: paper.url,
            content: summary.content,
            publishDate: new Date().toISOString(),
            metadata: {
              keywords: summary.keywords || [],
              twitterUrl: paper.twitterUrl
            }
          };
        } catch (retryError) {
          console.error(`[内容处理] ${paper.title} 重试失败:`, retryError);
        }
      }
      
      await this.notifier.warning(
        "论文处理失败",
        `标题: ${paper.title}\n保留原始内容`
      );
      
      return {
        id: `paper-${index}`,
        title: paper.title || "无标题",
        url: paper.url,
        content: "内容处理失败",
        publishDate: new Date().toISOString(),
        metadata: {
          keywords: [],
          twitterUrl: paper.twitterUrl
        }
      };
    }
  }

  async process(): Promise<void> {
    try {
      console.log("[工作流] 开始执行论文工作流");
      await this.notifier.info("论文工作流", "开始执行论文工作流");
      
      // 1. 提取GitHub上的论文列表
      console.log("[数据抓取] 从GitHub提取论文列表");
      const papers = await this.extractPapersFromGithub();
      console.log(`[数据抓取] 成功提取 ${papers.length} 篇论文`);
      
      console.log(`[数据内容]  ${JSON.stringify(papers)}`);
      
      // 2. 处理论文内容
      console.log("[内容处理] 开始处理论文内容");
      const paperContents: PaperContent[] = [];
      
      const summaryProgress = new cliProgress.SingleBar(
        {},
        cliProgress.Presets.shades_classic
      );
      summaryProgress.start(papers.length, 0);
      
      // 批量处理内容
      const batchSize = 1;
      for (let i = 0; i < papers.length; i += batchSize) {
        const batch = papers.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (paper, idx) => {
            const result = await this.processPaper(paper, i + idx);
            summaryProgress.increment();
            return result;
          })
        );
        paperContents.push(...results);
      }
      summaryProgress.stop();
      
      // 3. 生成封面图片
      console.log("[封面图片] 生成封面图片");
      const imageGenerator = await ImageGeneratorFactory.getInstance().getGenerator("ALIWANX21");
      const imageUrl = await imageGenerator.generate({ 
        prompt: "AI和机器学习最新论文精选，科技感强的封面设计", 
        size: "1440*768" 
      });
      console.log(`[封面图片] 封面图片生成完成: ${imageUrl}`);
      
      // 上传封面图片
      const mediaId = await this.publisher.uploadImage(imageUrl);
      
      // 4. 渲染内容
      console.log("[模板生成] 生成论文精选内容");
      const templateData = paperContents.map(paper => ({
        id: paper.id,
        title: paper.title,
        content: `${paper.content}\n\n原文链接：${paper.url}`,
        url: paper.url,
        publishDate: paper.publishDate,
        metadata: paper.metadata,
        keywords: paper.metadata.keywords,
      }));
      
      // 生成标题
      const summaryTitle = await this.summarizer.generateTitle(
        papers.map(paper => paper.title).join(" | ")
      ).then((title: string) => {
        title = `${new Date().toLocaleDateString()} 论文精选 | ${title}`;
        // 限制标题长度为64个字符
        return title.slice(0, 64);
      });
      
      console.log(`[标题生成] 生成标题: ${summaryTitle}`);
      
      // 渲染模板
      const renderedTemplate = await this.renderer.render(templateData);
      
      // 5. 发布到微信公众号
      console.log("[发布] 发布到微信公众号");
      const publishResult = await this.publisher.publish(
        renderedTemplate,
        summaryTitle,
        summaryTitle,
        mediaId
      );
      
      // 完成报告
      const summary = `
工作流执行完成
- 论文总数: ${papers.length} 篇
- 成功: ${this.stats.success} 篇
- 失败: ${this.stats.failed} 篇
- 内容: ${this.stats.contents} 条
- 发布: ${publishResult.status}

论文链接:
${papers.map((paper, index) => `${index + 1}. ${paper.title}\n   ${paper.url}`).join('\n')}`.trim();

console.log(`=== ${summary} ===`);
      
      if (this.stats.failed > 0) {
        await this.notifier.warning("工作流完成(部分失败)", summary);
      } else {
        await this.notifier.success("工作流完成", summary);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[工作流] 执行失败:", message);
      await this.notifier.error("工作流失败", message);
      throw error;
    }
  }
}