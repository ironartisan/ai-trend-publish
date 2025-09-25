import FirecrawlApp from "npm:firecrawl";
import {
  ContentScraper,
  ScrapedContent,
  ScraperOptions,
} from "@src/modules/interfaces/scraper.interface.ts";
import { ConfigManager } from "@src/utils/config/config-manager.ts";
import { formatDate } from "@src/utils/common.ts";
import zod from "npm:zod";
import { Logger } from "@zilla/logger";

const logger = new Logger("fireCrawl-scraper");

// 使用 zod 定义数据结构
const StorySchema = zod.object({
  headline: zod.string(),
  content: zod.string(),
  link: zod.string(),
  date_posted: zod.string(),
});

const StoriesSchema = zod.object({
  stories: zod.array(StorySchema),
});

export class FireCrawlScraper implements ContentScraper {
  private app!: FirecrawlApp;

  async refresh(): Promise<void> {
    const startTime = Date.now();
    this.app = new FirecrawlApp({
      apiKey: await ConfigManager.getInstance().get("FIRE_CRAWL_API_KEY"),
    });
    logger.debug(`FireCrawlApp 初始化完成, 耗时: ${Date.now() - startTime}ms`);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }

  private constructJiqizhixinUrl(headline: string, content: string): string | null {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // 尝试从内容中查找可能的机器之心链接格式
    const jiqizhixinPattern = /jiqizhixin\.com\/(?:articles)\/[^\/]*?(\d+)/;
    const contentMatch = content.match(jiqizhixinPattern);
    if (contentMatch && contentMatch[1]) {
      const articleIndex = parseInt(contentMatch[1], 10);
      logger.info(`从内容中提取到机器之心文章序号: ${articleIndex}`);
      return `https://www.jiqizhixin.com/articles/${dateStr}-${articleIndex}`;
    }
    
    // 尝试从标题中提取数字作为可能的序号
    const titleNumbers = headline.match(/\d+/g);
    if (titleNumbers && titleNumbers.length > 0) {
      const lastNumber = parseInt(titleNumbers[titleNumbers.length - 1], 10);
      if (lastNumber > 0 && lastNumber < 100) { // 合理的文章序号范围
        logger.info(`从标题中提取到可能的文章序号: ${lastNumber}`);
        return `https://www.jiqizhixin.com/articles/${dateStr}-${lastNumber}`;
      }
    }
    
    // 尝试从内容中提取更多可能的数字模式
    const contentNumbers = content.match(/\b(\d{1,2})\b/g);
    if (contentNumbers && contentNumbers.length > 0) {
      // 过滤出合理范围的数字（1-50，通常文章序号不会太大）
      const validNumbers = contentNumbers
        .map(n => parseInt(n, 10))
        .filter(n => n >= 1 && n <= 50)
        .sort((a, b) => b - a); // 降序排列，优先使用较大的数字
      
      if (validNumbers.length > 0) {
        const articleIndex = validNumbers[0];
        logger.info(`从内容中提取到可能的文章序号: ${articleIndex}`);
        return `https://www.jiqizhixin.com/articles/${dateStr}-${articleIndex}`;
      }
    }
    
    // 如果都无法提取到有效序号，返回 null 或抛出错误
    logger.warn(`无法从内容中提取到有效的文章序号`);
    return null;
  }

  private generateId(url: string): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    const urlHash = url.split("").reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0);
    return `fc_${timestamp}_${random}_${Math.abs(urlHash)}`;
  }

  async scrape(
    sourceId: string,
    options?: ScraperOptions,
  ): Promise<ScrapedContent[]> {
    try {
      await this.refresh();
      const startTime = Date.now();
      const currentDate = new Date().toLocaleDateString();

      // 构建提取提示词
      const promptForFirecrawl = `
      Return only today's AI or LLM related story or post headlines and links in JSON format from the page content. 
      They must be posted today, ${currentDate}. The format should be:
        {
          "stories": [
            {
              "headline": "headline1",
              "content":"content1"
              "link": "link1",
              "date_posted": "YYYY-MM-DD HH:mm:ss",
            },
            ...
          ]
        }
      If there are no AI or LLM stories from today, return {"stories": []}.
      
      The source link is ${sourceId}. 
      If a story link is not absolute, prepend ${sourceId} to make it absolute. 
      Return only pure JSON in the specified format (no extra text, no markdown, no \\\\).  
      The content should be about 500 words, which can summarize the full text and the main point.
      Translate all into Chinese.
      !!
      `;

      // 使用 FirecrawlApp 进行抓取
      const scrapeResult = await this.app.scrapeUrl(sourceId, {
        formats: ["extract"],
        extract: {
          prompt: promptForFirecrawl,
          schema: StoriesSchema,
        },
      });

      if (!scrapeResult.success) {
        const errorMsg = scrapeResult.error || "未知错误";
        logger.error(`FireCrawl API调用失败: ${errorMsg}`);
        
        // 检查是否是500错误或特定的浏览器加载失败错误
        if (errorMsg.includes("Status code: 500") || errorMsg.includes("failing to load in the browser")) {
          throw new Error(`网站加载失败: ${sourceId} - ${errorMsg}. 这可能是由于目标网站的反爬虫机制、服务器问题或网络连接问题导致的。`);
        }
        
        throw new Error(`FireCrawl抓取失败: ${errorMsg}`);
      }
      
      if (!scrapeResult.extract?.stories) {
        logger.warn(`FireCrawl返回成功但未提取到stories数据: ${sourceId}`);
        throw new Error("未获取到有效内容 - 可能是网站结构变化或内容格式不匹配");
      }

      // 使用 zod 验证返回数据
      const validatedData = StoriesSchema.parse(scrapeResult.extract);

      // 转换为 ScrapedContent 格式
      logger.debug(
        `[FireCrawl] 从 ${sourceId} 获取到 ${validatedData.stories.length} 条内容 耗时: ${
          Date.now() - startTime
        }ms`,
      );
      return validatedData.stories.map((story) => {
        let url = story.link;
        const originalUrl = story.link;
        
        // 增强日志记录，显示所有链接的详细信息
        logger.debug(`抓取到的原始链接: ${originalUrl}`);
        
        // 检查链接格式
        if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
          logger.warn(`链接格式异常，缺少协议前缀: ${originalUrl}`);
        }
        
        // 检查是否为UUID格式或无效链接并处理
         const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
         const isValidUrl = originalUrl.startsWith('http://') || originalUrl.startsWith('https://');
         
         if (uuidPattern.test(originalUrl) || !isValidUrl) {
           logger.warn(`检测到无效链接格式: ${originalUrl}`);
           
           // 从内容中尝试提取真实链接
           const linkMatches = story.content.match(/https?:\/\/[^\s"'<>)]+/g);
           if (linkMatches && linkMatches.length > 0) {
             // 过滤掉常见的无关链接
             const filteredLinks = linkMatches.filter(link => 
               !link.includes('twitter.com') && 
               !link.includes('github.com') && 
               !link.includes('linkedin.com') &&
               !link.includes('facebook.com') &&
               !link.endsWith('.png') &&
               !link.endsWith('.jpg') &&
               !link.endsWith('.gif')
             );
             
             // 优先选择机器之心的文章链接
             const jiqizhixinLinks = filteredLinks.filter(link => 
               link.includes('jiqizhixin.com') && 
               (link.includes('/articles/'))
             );
             
             if (jiqizhixinLinks.length > 0) {
               url = jiqizhixinLinks[0];
               logger.info(`从内容中提取到机器之心链接: ${url}`);
             } else if (filteredLinks.length > 0) {
               // 如果没有机器之心链接，使用第一个有效链接
               url = filteredLinks[0];
               logger.info(`从内容中提取到链接: ${url}`);
             } else {
               // 如果没有找到有效链接，根据来源网站构建默认链接
               if (sourceId.includes('jiqizhixin.com')) {
                 // 构建机器之心的默认链接
                 const constructedUrl = this.constructJiqizhixinUrl(story.headline, story.content);
                 if (constructedUrl) {
                   url = constructedUrl;
                   logger.info(`构建机器之心默认链接: ${url}`);
                 } else {
                   url = sourceId;
                   logger.warn(`无法构建机器之心链接，使用来源页面: ${url}`);
                 }
               } else {
                 // 其他网站使用来源页面作为链接
                 url = sourceId;
                 logger.warn(`无法提取有效链接，使用来源页面: ${url}`);
               }
             }
           } else {
             // 完全没有找到链接的情况
             if (sourceId.includes('jiqizhixin.com')) {
               const constructedUrl = this.constructJiqizhixinUrl(story.headline, story.content);
               if (constructedUrl) {
                 url = constructedUrl;
                 logger.info(`构建机器之心默认链接: ${url}`);
               } else {
                 url = sourceId;
                 logger.warn(`无法构建机器之心链接，使用来源页面: ${url}`);
               }
             } else {
               url = sourceId;
               logger.warn(`无法提取任何链接，使用来源页面: ${url}`);
             }
           }
         }
         
         // 特殊处理机器之心网站的链接
         if (url.includes('jiqizhixin.com') && !url.includes('/articles/') ) {
           // 如果是机器之心网站但不是articles格式，尝试修复
           const constructedUrl = this.constructJiqizhixinUrl(story.headline, story.content);
           if (constructedUrl) {
             url = constructedUrl;
             logger.info(`修复机器之心链接格式: ${url}`);
           } else {
             logger.warn(`无法修复机器之心链接格式，保持原链接: ${url}`);
           }
         }
         
         // 最终验证链接有效性
         if (!this.isValidUrl(url)) {
           logger.warn(`生成的链接可能无效: ${url}`);
           // 如果链接仍然无效，使用来源页面
           url = sourceId;
           logger.info(`使用来源页面作为备用链接: ${url}`);
         }
        
        return {
          id: this.generateId(url),
          title: story.headline,
          content: story.content,
          url: url, // 使用处理后的URL
          publishDate: formatDate(story.date_posted),
          score: 0,
          metadata: {
            source: "fireCrawl",
            originalUrl: originalUrl,  // 保存原始URL
            processedUrl: url, // 添加处理后的URL
            datePosted: story.date_posted,
            sourceId: sourceId,  // 添加来源网站，帮助调试
          },
        };
      });
    } catch (error) {
      logger.error("FireCrawl抓取失败:", error);
      throw error;
    }
  }
}
