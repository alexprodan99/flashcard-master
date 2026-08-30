import type { LLMProviderPort } from "@flashcard-master/core";
import { OpenAIAdapter } from "./openai-adapter.js";
import { GeminiAdapter } from "./gemini-adapter.js";
import { AnthropicAdapter } from "./anthropic-adapter.js";
import { OllamaAdapter } from "./ollama-adapter.js";
import type { LLMConfig } from "./types.js";

export function createLLMAdapter(config: LLMConfig): LLMProviderPort {
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
      throw new Error(`Unsupported LLM provider: "${(config as any).provider}"`);
  }
}
