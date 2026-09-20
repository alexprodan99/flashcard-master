import {
  type LLMProviderPort,
  type CardGenerationDraft,
  type DifficultyLevel,
  CardGenerationDraftSchema,
  DialectCompiler,
} from "@flashcard-master/core";
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMResponseParsingError,
  LLMNetworkError,
  parseStructuredCardDrafts,
  type LLMConfig,
} from "./types.js";

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
    this.timeoutMs = config.timeoutMs ?? 120000;
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
    const diffInstruction = options.difficulty === "mixed"
      ? `Generate a balanced progression of ${count} atomic Front/Back flashcards across the text, spanning beginner fundamentals, intermediate mechanics, and expert trade-offs (assign each card its appropriate difficulty: "beginner", "intermediate", "expert", or "mixed").`
      : `Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.`;

    const systemPrompt = `${options.personaPrompt}
${diffInstruction}
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "citation". Do NOT paraphrase, edit, or summarize any words in "citation".`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const responseFormat = DialectCompiler.toOpenAIBatchSchema(CardGenerationDraftSchema, {
        name: "flashcards",
        strict: true,
      });

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
          response_format: responseFormat,
          max_tokens: 4096,
          temperature: 0.2,
        }),
      });

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

      return parseStructuredCardDrafts(content, this.providerName, { difficulty: options.difficulty });
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
      if (
        err instanceof TypeError ||
        err?.name === "FetchError" ||
        err?.code === "ECONNREFUSED" ||
        err?.code === "ENOTFOUND"
      ) {
        throw new LLMNetworkError(this.providerName, err.message);
      }
      throw new LLMResponseParsingError(this.providerName, err.message);
    } finally {
      clearTimeout(timer);
    }
  }
}
