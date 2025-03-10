// 1.仿照paper.workflow.ts爬取 https://huggingface.co/papers 的paper
// 2.使用firecrawl爬取paper的详情
// 3.使用ai生成摘要
// 4.渲染内容并生成并发布

import axios from 'axios';
import { FireCrawlAPI } from '../api/firecrawl.api';
import { AISummarizer } from '../modules/summarizer/ai.summarizer';
import { ArticleTemplateRenderer } from '../modules/render';
import { WeixinPublisher } from '../modules/publishers/weixin.publisher';
import { Workflow } from './interfaces/workflow.interface';
import { ImageGeneratorFactory } from "../providers/image-gen/image-generator-factory";
import { WeixinTemplate } from '../modules/render/interfaces/template.type';
import * as cheerio from 'cheerio';

interface HFPaper {
  title: string;
  url: string;
  authors: string[];
  abstract?: string;
  publishDate?: string;
  arxivUrl?: string;
}

export class HFPaperWorkflow implements Workflow {
  private crawler: FireCrawlAPI;
  private summarizer: AISummarizer;
  private renderer: ArticleTemplateRenderer;
  private publisher: WeixinPublisher;

  constructor() {
    this.crawler = new FireCrawlAPI();
    this.summarizer = new AISummarizer();
    this.renderer = new ArticleTemplateRenderer();
    this.publisher = new WeixinPublisher();
  }

  async execute() {
    try {
      console.log('Starting HF paper workflow');
      
      // 1. 爬取论文列表
      const papers = await this.crawlPaperList();
      
      // 2. 获取每篇论文的详细信息
      const papersWithDetails = await this.getPapersDetails(papers);
      
      // 3. 使用AI生成摘要
      const papersWithSummary = await this.generatePapersSummary(papersWithDetails);
      
      // 4. 渲染并发布内容
      await this.renderAndPublish(papersWithSummary);
      
      console.log('HF paper workflow completed successfully');
    } catch (error) {
      console.error('Error in HF paper workflow:', error);
      throw error;
    }
  }

  async process(): Promise<void> {
    await this.execute();
  }

  private async crawlPaperList(): Promise<HFPaper[]> {
    try {
      const baseUrl = 'https://huggingface.co';
      const response = await axios.get(`${baseUrl}/papers`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const papers: HFPaper[] = [];

      // 限制只处理前20篇论文
      $('article').slice(0, 20).each((_, element) => {
        const titleElement = $(element).find('h3');
        const authorElements = $(element).find('.author');
        const dateElement = $(element).find('.date');
        const linkElement = $(element).find('a').first();

        // 确保 URL 是完整的
        const relativeUrl = linkElement.attr('href') || '';
        const absoluteUrl = relativeUrl.startsWith('http') 
          ? relativeUrl 
          : `${baseUrl}${relativeUrl}`;

        papers.push({
          title: titleElement.text().trim(),
          url: absoluteUrl,
          authors: authorElements.map((_, el) => $(el).text().trim()).get(),
          publishDate: dateElement.text().trim()
        });
      });

      console.log(`获取到 ${papers.length} 篇论文`);
      return papers;
    } catch (error) {
      console.error('Error fetching paper list:', error);
      throw error;
    }
  }

  private async getPapersDetails(papers: HFPaper[]): Promise<HFPaper[]> {
    const detailedPapers: HFPaper[] = [];
    
    for (const paper of papers) {
      try {
        const response = await axios.get(paper.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        const $ = cheerio.load(response.data);
        
        // 提取摘要
        let abstract = '';
        const abstractSelectors = [
          '.paper-abstract',
          'section.abstract',
          '.abstract',
          '#abstract',
          '[data-target="abstract"]'
        ];

        for (const selector of abstractSelectors) {
          const abstractElement = $(selector);
          if (abstractElement.length > 0) {
            abstract = abstractElement.text().trim();
            break;
          }
        }

        // 如果找不到摘要，尝试查找包含 "Abstract" 标题的段落
        if (!abstract) {
          $('h2, h3, h4').each((_, element) => {
            if ($(element).text().toLowerCase().includes('abstract')) {
              abstract = $(element).next().text().trim();
            }
          });
        }

        // 提取 arXiv 链接
        let arxivUrl = '';
        $('a').each((_, element) => {
          const $element = $(element);
          if ($element.text().trim().toLowerCase().includes('view arxiv page')) {
            arxivUrl = $element.attr('href') || '';
          }
        });

        console.log(`获取论文摘要: ${paper.title}`);
        console.log(`摘要长度: ${abstract.length} 字符`);
        console.log(`arXiv链接: ${arxivUrl}`);

        detailedPapers.push({
          ...paper,
          abstract: abstract || undefined,
          arxivUrl: arxivUrl || undefined
        });

        // 添加延迟，避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error fetching details for ${paper.title}:`, error);
        detailedPapers.push(paper);
      }
    }

    return detailedPapers;
  }

  private async generatePapersSummary(papers: HFPaper[]): Promise<HFPaper[]> {
    const papersWithSummary = [];
    
    for (const paper of papers) {
      if (paper.abstract) {
        try {
          const summary = await this.summarizer.summarize(paper.abstract, {
            minLength: 100,
            maxLength: 500,
            language: "中文"
          });
          
          papersWithSummary.push({
            ...paper,
            abstract: summary.content
          });
        } catch (error) {
          console.error(`Error generating summary for ${paper.title}:`, error);
          papersWithSummary.push(paper);
        }
      } else {
        papersWithSummary.push(paper);
      }
    }

    return papersWithSummary;
  }

  private async renderAndPublish(papers: HFPaper[]) {
    if (papers.length === 0) {
      console.log('No papers to publish');
      return;
    }

    // 准备模板数据，确保符合 WeixinTemplate 接口
    const templateData: WeixinTemplate[] = papers.map(paper => ({
      id: `hf-paper-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: paper.title,
      content: `${paper.abstract || '无摘要'}


${'='.repeat(30)}


${paper.arxivUrl ? `论文链接：${paper.arxivUrl}` : `论文链接：${paper.url}`}`.trim(),
      url: paper.url,
      publishDate: paper.publishDate || new Date().toISOString(),
      keywords: [],
      metadata: {
        keywords: [],
        authors: paper.authors
      }
    }));

    // 生成标题
    const title = `Hugging Face 最新论文精选 ${new Date().toLocaleDateString()}`;
    
    // 渲染模板
    const renderedTemplate = await this.renderer.render(templateData);
    
    // 生成封面图并上传
    const imageGenerator = await ImageGeneratorFactory.getInstance().getGenerator("ALIWANX21");
    const imageUrl = await imageGenerator.generate({
      prompt: "AI论文研究精选，机器学习最新进展，科技感封面", 
      size: "1440*768"
    });
    const mediaId = await this.publisher.uploadImage(imageUrl);
    
    // 发布到微信公众号
    await this.publisher.publish(
      renderedTemplate,
      title,
      title,
      mediaId
    );
  }
}
