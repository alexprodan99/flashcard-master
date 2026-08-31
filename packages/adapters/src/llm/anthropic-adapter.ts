import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError, LLMNetworkError, CardDraftArraySchema, cleanJsonString, type LLMConfig } from "./types.js";

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
CRITICAL GROUNDING RULE: For each card, extract an exact verbatim "sourceQuote" sentence from the source text that proves the answer.
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
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: text }],
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
      const rawText = json.content?.[0]?.text;
      if (!rawText) {
        throw new LLMResponseParsingError(this.providerName, "Empty message response from Anthropic.");
      }

      const cleanJson = cleanJsonString(rawText);
      const parsedJson = JSON.parse(cleanJson);
      const rawArray = Array.isArray(parsedJson) ? parsedJson : (parsedJson.cards || Object.values(parsedJson)[0]);

      const validated = CardDraftArraySchema.parse(rawArray);
      return validated.map((c) => ({
        question: c.question,
        answer: c.answer,
        sourceQuote: c.sourceQuote,
        difficulty: c.difficulty as DifficultyLevel,
      }));
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
