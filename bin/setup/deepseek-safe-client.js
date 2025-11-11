// deepseekSafeClient.js
import { AISdkClient } from "@browserbasehq/stagehand";

export class DeepseekSafeClient extends AISdkClient {
  type = "deepseek-safe";   // 随便起个名，方便调试

  async createChatCompletion({ options }) {
    // 1. 删掉 DeepSeek 不支持的字段
    delete options.response_format;

    // 2. 系统消息补 JSON 提示
    if (options.messages?.[0]?.role === "system") {
      options.messages[0].content += " You must respond in JSON format. respond WITH JSON. Do not include any other text, formatting or markdown in your output. Do not include \`\`\` or \`\`\`json in your response. Only the JSON object itself..";
    }

    // 3. 阿里云/DeepScope 需要禁用思考
    if (!options.providerOptions) options.providerOptions = {};
    options.providerOptions.enable_thinking = false;

    // 4. 交给官方 AISdkClient 继续走 ai-sdk
    return super.createChatCompletion({ options });
  }
}

export { DeepseekSafeClient }