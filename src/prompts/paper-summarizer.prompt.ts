export interface PaperSummarizerPromptParams {
  content: string;
  language?: string;
  minLength?: number;
  maxLength?: number;
}

export const getPaperSummarizerSystemPrompt = (): string => {
  return `你是一个专业的学术论文分析专家。你的任务是：
    1. 理解论文的核心创新点和技术贡献
    2. 提炼论文的关键方法和实验结果
    3. 用一句话总结论文的核心内容
    4. 用通俗易懂的语言解释复杂的技术概念
    5. 生成专业且吸引人的标题
    6. 提供3-5个关键词，体现论文的核心技术和应用领域

    请严格按照以下JSON格式返回，不要添加任何其他格式标记（如markdown或代码块）：
    {
        "title": "论文标题",
        "authors": ["作者1", "作者2"]
        "content": "论文总结内容", 
        "keywords": ["关键词1", "关键词2", "关键词3"],
        "score": 0-100,
        "contribution": "核心技术贡献",
        "summary": "一句话总结",

    }`;
};

export const getPaperSummarizerUserPrompt = ({
  content,
  language = "中文",
  minLength = 200,
  maxLength = 500,
}: PaperSummarizerPromptParams): string => {
  return `请分析以下论文内容，使用${language}生成一个专业的总结，字数在${minLength}-${maxLength}之间：\n\n${content}\n\n
    要求：
    1. 重点突出论文的创新点和技术贡献
    2. 清晰说明研究方法和关键结果
    3. 用一句话总结论文的核心内容
    4. 使用专业但易懂的语言
    5. 适当使用技术术语，但需要配合解释
    6. 关键词应反映论文的核心技术和应用领域
    7. 使用以下格式标记：
       - 重点内容：<strong>内容</strong>
       - 技术术语：<term>术语</term>
       - 研究结果：<result>结果</result>
       - 应用场景：<application>场景</application>
       - 段落分隔：<next_paragraph />
    8. 保持专业性的同时确保可读性
    9. 避免过于学术化的表达方式
    10. 必要时可以添加简短的背景知识说明`;
}; 