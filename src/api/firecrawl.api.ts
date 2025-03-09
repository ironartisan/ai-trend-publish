import axios from 'axios';

/**
 * FireCrawlAPI - 用于抓取网页内容的API
 */
export class FireCrawlAPI {
  /**
   * 抓取指定URL的HTML内容
   * @param url 要抓取的URL
   * @returns 返回HTML内容
   */
  async fetchContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch content from ${url}:`, error);
      throw new Error(`Failed to fetch content from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 