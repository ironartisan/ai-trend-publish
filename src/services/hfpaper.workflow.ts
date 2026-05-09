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
import { getPaperSummarizerSystemPrompt, getPaperSummarizerUserPrompt } from "../prompts/paper-summarizer.prompt";
import { RetryUtil } from '../utils/retry.util';

interface HFPaper {
  title: string;
  url: string;
  authors: string[];
  abstract?: string;
  publishDate?: string;
  arxivUrl?: string;
  aiAnalysis?: {
    title: string;
    authors: string[];
    content: string;
    keywords: string[];
    score: number;
    contribution: string;
    summary: string;
  };
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
      //2025-03-14
      const date = new Date().toISOString().split('T')[0];
      const baseUrl = 'https://hf-mirror.com'; // https://huggingface.co https://hf-cdn.sufy.com https://hf-mirror.com
      
      // 使用重试机制处理HTTP 429错误
      const response = await RetryUtil.retryOperation(
        async () => {
          return await axios.get(`${baseUrl}/papers`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 30000 // 30秒超时
          });
        },
        {
          maxRetries: 5,
          baseDelay: 5000, // 2秒基础延迟
          useExponentialBackoff: true
        }
      );

      const $ = cheerio.load(response.data);
      const papers: HFPaper[] = [];

      // 限制只处理前20篇论文$('article').slice(0, 20)
      $('article').each((_, element) => {
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
        // 使用重试机制处理HTTP 429错误
        const response = await RetryUtil.retryOperation(
          async () => {
            return await axios.get(paper.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
              },
              timeout: 30000 // 30秒超时
            });
          },
          {
            maxRetries: 10,
            baseDelay: 8000, // 5秒基础延迟
            useExponentialBackoff: true
          }
        );

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
        await new Promise(resolve => setTimeout(resolve, 5000)); // 增加到3秒延迟

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
          const paperContent = `
标题：${paper.title}

作者：${paper.authors.join(', ')}

摘要：
${paper.abstract}

${paper.arxivUrl ? `arXiv链接：${paper.arxivUrl}` : `论文链接：${paper.url}`}`;

          const summary = await this.summarizer.summarize(paperContent, {
            minLength: 200,
            maxLength: 800,
            language: "中文",
            systemPrompt: getPaperSummarizerSystemPrompt,
            userPrompt: getPaperSummarizerUserPrompt
          });
          
          papersWithSummary.push({
            ...paper,
            abstract: summary.content,
            aiAnalysis: {
              title: summary.title,
              authors: summary.authors || [],
              content: summary.content,
              keywords: summary.keywords || [],
              score: summary.score || 0,
              contribution: summary.contribution || '',
              summary: summary.summary || ''
            }
          });
        } catch (error) {
          console.error(`Error generating summary for ${paper.title}:`, error);
          // papersWithSummary.push(paper);
        }
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
      content: `${paper.aiAnalysis?.summary ? `💡<strong>「一句话总结」</strong>：${paper.aiAnalysis.summary}` : ''}
<br>
🔑<strong>「关键词」：</strong>${paper.aiAnalysis?.keywords?.join('、') || '无'}

<br>
📒<strong>「全文概述」</strong>：${paper.abstract || '无摘要'}

<br>
🔗<strong>「原文链接地址」</strong>：${paper.arxivUrl || paper.url}`.trim(),
      url: paper.url,
      publishDate: paper.publishDate || new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      keywords: paper.aiAnalysis?.keywords || [],
      metadata: {
        keywords: paper.aiAnalysis?.keywords || [],
        authors: paper.authors,
        summary: paper.aiAnalysis?.summary,
        contribution: paper.aiAnalysis?.contribution,
        score: paper.aiAnalysis?.score
      }
    }));

    // 生成标题
    const title = `Hugging Face 最新论文精选 ${new Date().toLocaleDateString()}`;
    
    // 渲染模板
    const renderedTemplate = await this.renderer.render(templateData);
    
    // 生成封面图并上传
    const imageGenerator = await ImageGeneratorFactory.getInstance().getGenerator("ALIWANX21");
    const imageUrl = await imageGenerator.generate({
      prompt: "AI论文研究精选，机器学习最新进展，具有学术气息，不要出现文字", 
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
