import { OpenAIAdapter } from "./openai-adapter.js";
import { GeminiAdapter } from "./gemini-adapter.js";
import { AnthropicAdapter } from "./anthropic-adapter.js";
import { OllamaAdapter } from "./ollama-adapter.js";
export function createLLMAdapter(config) {
    switch (config.provider) {
        case "openai":
            return new OpenAIAdapter(config);
        case "gemini":
            return new GeminiAdapter(config);
        case "anthropic":
            return new AnthropicAdapter(config);
        case "ollama":
            return new OllamaAdapter(config);
        default:
            throw new Error(`Unsupported LLM provider: "${config.provider}"`);
    }
}
//# sourceMappingURL=llm-factory.js.map