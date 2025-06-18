import axios from 'axios';
import * as cheerio from 'cheerio';

async function testCrawlPaperList() {
  const baseUrl = 'https://hf-mirror.com';
  try {
    console.log(`尝试从 ${baseUrl} 获取论文列表`);
    
    const response = await axios.get(`${baseUrl}/papers`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000, // 15秒超时
      validateStatus: (status) => status === 200 // 只接受200状态码
    });

    const $ = cheerio.load(response.data);
    const papers: { title: string; url: string; authors: string[]; publishDate: string }[] = [];

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
    papers.forEach((paper, index) => {
      console.log(`论文 ${index + 1}:`);
      console.log(`标题: ${paper.title}`);
      console.log(`链接: ${paper.url}`);
      console.log(`作者: ${paper.authors.join(', ')}`);
      console.log(`发布日期: ${paper.publishDate}`);
      console.log('---------------------------');
    });

  } catch (error) {
    console.error('Error fetching paper list:', error);
  }
}

testCrawlPaperList(); 