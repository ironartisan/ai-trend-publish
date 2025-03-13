import { LLMFactory } from "../providers/llm/llm-factory";
import { ConfigManager } from "../utils/config/config-manager";
import { OpenAICompatibleLLM } from "../providers/llm/openai-compatible-llm";
import { ChatMessage } from "../providers/interfaces/llm.interface";

async function testCustomLLM() {
    try {
        // 1. 初始化配置
        const configManager = ConfigManager.getInstance();
        await configManager.initDefaultConfigSources();
        
        console.log("\n=== 开始测试 Custom LLM ===");

        // 2. 测试配置读取
        const baseUrl = await configManager.get("CUSTOM_LLM_BASE_URL");
        const apiKey = await configManager.get("CUSTOM_LLM_API_KEY");
        const model = await configManager.get("CUSTOM_LLM_MODEL");

        console.log("\n=== 配置信息 ===");
        console.log("Base URL:", baseUrl);
        console.log("API Key:", apiKey ? `${apiKey}...` : "未设置");
        console.log("配置的模型:", model);

        // 3. 直接测试 OpenAICompatibleLLM
        console.log("\n=== 测试 OpenAICompatibleLLM ===");
        const llm = new OpenAICompatibleLLM("CUSTOM_LLM_");
        await llm.initialize();

        // 4. 打印当前配置信息
        console.log("\n=== LLM 配置 ===");
        console.log("当前使用的模型:", llm.getModel());
        console.log("可用的模型列表:", llm.getAvailableModels());

        // 5. 测试简单对话
        const messages: ChatMessage[] = [
            {
                role: "user" as const,
                content: "你好，请做个自我介绍。"
            }
        ];

        console.log("\n=== 发送测试请求 ===");
        try {
            const response = await llm.createChatCompletion(messages, {
                temperature: 0.7,
                max_tokens: 500
            });

            console.log("\n=== 响应结果 ===");
            console.log(JSON.stringify(response, null, 2));
        } catch (error) {
            console.error("\n=== 请求失败 ===");
            console.error("错误详情:", error);
            
            // 尝试发送 curl 命令供手动测试
            const curlCommand = `curl -X POST "${baseUrl}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "${llm.getModel()}",
    "messages": [{"role": "user", "content": "你好，请做个自我介绍。"}],
    "temperature": 0.7,
    "max_tokens": 500
  }'`;
            
            console.log("\n=== 手动测试命令 ===");
            console.log("你可以使用以下 curl 命令手动测试 API:");
            console.log(curlCommand);
        }

        console.log("\n=== 测试完成 ===");
    } catch (error) {
        console.error("\n=== 测试过程中出现错误 ===");
        console.error(error);
    }
}

// 运行测试
if (require.main === module) {
    testCustomLLM().catch(console.error);
}