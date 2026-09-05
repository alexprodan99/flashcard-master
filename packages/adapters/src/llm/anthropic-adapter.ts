import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError, LLMNetworkError, parseCardDraftsFromJson, type LLMConfig } from "./types.js";

export class AnthropicAdapter implements LLMProviderPort {
  readonly providerName = "anthropic";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || "claude-haiku-4-5-20251001";
    this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.fetchFn = config.customFetch ?? globalThis.fetch;
  }

  async generateQAPairs(
    text: string,
    options: {
      difficulty: DifficultyLevel;
      personaPrompt: string;
      targetCount?: number;
    }
  ): Promise<CardGenerationDraft[]> {
    if (!this.apiKey) {
      throw new LLMAuthenticationError(this.providerName, "Anthropic API key is required.");
    }

    const count = options.targetCount ?? 5;
    const systemPrompt = `${options.personaPrompt}
Generate exactly ${count} atomic Front/Back flashcards from the provided text at "${options.difficulty}" difficulty.
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "sourceQuote". Do NOT paraphrase, edit, or summarize any words in "sourceQuote".
CRITICAL JSON FORMATTING: Ensure all inner quotes inside strings (such as code snippets, filenames, or CLI flags) are strictly escaped with backslashes (\\").
You MUST output ONLY a valid raw JSON array with no markdown code fences:
[
  {
    "question": "...",
    "answer": "...",
    "sourceQuote": "...",
    "difficulty": "${options.difficulty}"
  }
]`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(`${this.baseUrl}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            { role: "user", content: text },
            { role: "assistant", content: "[" },
          ],
          temperature: 0.2,
        }),
      });
      clearTimeout(timer);

      if (response.status === 401 || response.status === 403) {
        throw new LLMAuthenticationError(this.providerName, "Invalid Anthropic API key.");
      }
      if (response.status === 429) {
        throw new LLMRateLimitError(this.providerName, "Anthropic rate limit exceeded.");
      }
      if (!response.ok) {
        throw new LLMNetworkError(this.providerName, `HTTP error ${response.status}: ${await response.text()}`);
      }

      const json = await response.json();
      const responseText = json.content?.[0]?.text;
      if (!responseText) {
        throw new LLMResponseParsingError(this.providerName, "Empty message response from Anthropic.");
      }

      const rawText = responseText.trim().startsWith("[") ? responseText : `[${responseText}`;
      return parseCardDraftsFromJson(rawText, this.providerName);
    } catch (err: any) {
      if (
        err instanceof LLMAuthenticationError ||
        err instanceof LLMRateLimitError ||
        err instanceof LLMNetworkError ||
        err instanceof LLMResponseParsingError
      ) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new LLMNetworkError(this.providerName, `Request timed out after ${this.timeoutMs}ms.`);
      }
      throw new LLMResponseParsingError(this.providerName, err.message);
    }
  }
}
