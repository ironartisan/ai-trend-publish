import { ContentSummarizer, Summary } from "@src/modules/interfaces/summarizer.interface";
import { getSummarizerSystemPrompt, getSummarizerUserPrompt, getTitleSystemPrompt, getTitleUserPrompt } from "@src/prompts/summarizer.prompt";
import { LLMFactory } from "@src/providers/llm/llm-factory";
import { ConfigManager } from "@src/utils/config/config-manager";
import { RetryUtil } from "@src/utils/retry.util";

export class AISummarizer implements ContentSummarizer {
  private llmFactory: LLMFactory;
  private configInstance: ConfigManager;

  constructor() {
    this.llmFactory = LLMFactory.getInstance();
    this.configInstance = ConfigManager.getInstance();
    this.configInstance.get("AI_SUMMARIZER_LLM_PROVIDER").then((provider) => {
      console.log(`Summarizer当前使用的LLM模型: ${provider}`);
    });
  }

  async summarize(
    content: string,
    options?: Record<string, any>
  ): Promise<Summary> {
    if (!content) {
      throw new Error("Content is required for summarization");
    }

    return RetryUtil.retryOperation(async () => {
      const llm = await this.llmFactory.getLLMProvider(await this.configInstance.get("AI_SUMMARIZER_LLM_PROVIDER"));
      
      // 使用自定义提示词或默认提示词
      const systemPromptFn = options?.systemPrompt || getSummarizerSystemPrompt;
      const userPromptFn = options?.userPrompt || getSummarizerUserPrompt;
      
      const response = await llm.createChatCompletion([
        {
          role: "system",
          content: systemPromptFn()
        },
        {
          role: "user",
          content: userPromptFn({
            content,
            language: options?.language,
            minLength: options?.minLength,
            maxLength: options?.maxLength,
          })
        },
      ], {
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const completion = response.choices[0]?.message?.content;
      if (!completion) {
        throw new Error("未获取到有效的摘要结果");
      }

      try {
        // 添加日志记录以便调试
        console.log("LLM Response:", completion);

        // 尝试清理可能的格式问题
        const cleanedCompletion = completion
          .replace(/^```json\s*/, '') // 移除可能的 JSON 代码块标记
          .replace(/\s*```$/, '')     // 移除结尾的代码块标记
          .trim();                    // 移除首尾空白

        const summary = JSON.parse(cleanedCompletion) as Summary;
        
        // 验证必要字段
        if (!summary.title || !summary.content) {
          console.error("Invalid summary format:", summary);
          throw new Error("摘要结果格式不正确");
        }

        return summary;
      } catch (error) {
        console.error("Raw completion:", completion);
        throw new Error(
          `解析摘要结果失败: ${error instanceof Error ? error.message : "未知错误"}`
        );
      }
    });
  }

  async generateTitle(
    content: string,
    options?: Record<string, any>
  ): Promise<string> {
    return RetryUtil.retryOperation(async () => {
      const llm = await this.llmFactory.getLLMProvider(await this.configInstance.get("AI_SUMMARIZER_LLM_PROVIDER"));
      const response = await llm.createChatCompletion([
        {
          role: "system",
          content: getTitleSystemPrompt()
        },
        {
          role: "user",
          content: getTitleUserPrompt({
            content,
            language: options?.language,
          })
        },
      ], {
        temperature: 0.7,
        max_tokens: 100
      });

      const title = response.choices[0]?.message?.content;
      if (!title) {
        throw new Error("未获取到有效的标题");
      }
      return title;
    });
  }
}