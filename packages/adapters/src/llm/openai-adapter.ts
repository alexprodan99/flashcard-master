import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError, LLMNetworkError, parseCardDraftsFromJson, type LLMConfig } from "./types.js";

export class OpenAIAdapter implements LLMProviderPort {
  readonly providerName = "openai";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gpt-4o-mini";
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
    this.timeoutMs = config.timeoutMs ?? 30000;
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
    if (!this.apiKey && !this.baseUrl.includes("localhost")) {
      throw new LLMAuthenticationError(this.providerName, "API key is required for OpenAI.");
    }

    const count = options.targetCount ?? 5;
    const systemPrompt = `${options.personaPrompt}
Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "sourceQuote". Do NOT paraphrase, edit, or summarize any words in "sourceQuote".
CRITICAL JSON FORMATTING: Ensure all inner quotes inside strings (such as code snippets, filenames, or CLI flags) are strictly escaped with backslashes (\\").
You MUST respond ONLY with a JSON array matching this exact schema:
[
  {
    "question": "Concise active-recall question testing one concept",
    "answer": "Accurate, concise answer",
    "sourceQuote": "Exact verbatim substring from the source document",
    "difficulty": "${options.difficulty}"
  }
]`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey || ""}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
          response_format: { type: "json_object" },
          max_tokens: 4096,
          temperature: 0.2,
        }),
      });
      clearTimeout(timer);

      if (response.status === 401 || response.status === 403) {
        throw new LLMAuthenticationError(this.providerName, "Invalid OpenAI API key.");
      }
      if (response.status === 429) {
        throw new LLMRateLimitError(this.providerName, "OpenAI rate limit exceeded.");
      }
      if (!response.ok) {
        throw new LLMNetworkError(this.providerName, `HTTP error ${response.status}: ${await response.text()}`);
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new LLMResponseParsingError(this.providerName, "Empty message content received from OpenAI.");
      }

      return parseCardDraftsFromJson(content, this.providerName);
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
