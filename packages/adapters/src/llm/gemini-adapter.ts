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

export class GeminiAdapter implements LLMProviderPort {
  readonly providerName = "gemini";
  private readonly apiKey?: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gemini-3.6-flash";
    this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
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
    if (!this.apiKey) {
      throw new LLMAuthenticationError(this.providerName, "Google Gemini API key is required.");
    }

    const count = options.targetCount ?? 5;
    const diffInstruction = options.difficulty === "mixed"
      ? `Generate a balanced progression of ${count} atomic Front/Back flashcards across the text, spanning beginner fundamentals, intermediate mechanics, and expert trade-offs (assign each card its appropriate difficulty: "beginner", "intermediate", "expert", or "mixed").`
      : `Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.`;

    const prompt = `${options.personaPrompt}
${diffInstruction}
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "citation". Do NOT paraphrase, edit, or summarize any words in "citation".

Document Content:
${text}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      const responseSchema = DialectCompiler.toGeminiBatchSchema(CardGenerationDraftSchema);

      const response = await this.fetchFn(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            maxOutputTokens: 8192,
            temperature: 0.2,
          },
        }),
      });

      if (response.status === 401 || response.status === 403) {
        throw new LLMAuthenticationError(this.providerName, "Invalid Google Gemini API key or forbidden request.");
      }
      if (response.status === 429) {
        throw new LLMRateLimitError(this.providerName, "Google Gemini rate limit exceeded.");
      }
      if (!response.ok) {
        throw new LLMNetworkError(this.providerName, `HTTP error ${response.status}: ${await response.text()}`);
      }

      const json = await response.json();
      if (json.promptFeedback?.blockReason) {
        throw new LLMResponseParsingError(this.providerName, `Prompt blocked by Gemini policy: ${json.promptFeedback.blockReason}`);
      }

      const candidate = json.candidates?.[0];
      if (!candidate) {
        throw new LLMResponseParsingError(this.providerName, "No candidate response returned from Gemini.");
      }

      if (candidate.finishReason === "SAFETY") {
        throw new LLMResponseParsingError(this.providerName, "Generation blocked by Gemini safety filters.");
      }
      if (candidate.finishReason === "RECITATION") {
        throw new LLMResponseParsingError(this.providerName, "Generation blocked by Gemini recitation check.");
      }
      if (candidate.finishReason === "BLOCKLIST" || candidate.finishReason === "PROHIBITED_CONTENT" || candidate.finishReason === "SPII") {
        throw new LLMResponseParsingError(this.providerName, `Generation blocked by Gemini policy: ${candidate.finishReason}`);
      }

      const parts = candidate.content?.parts;
      if (!parts || !Array.isArray(parts) || parts.length === 0) {
        throw new LLMResponseParsingError(this.providerName, "Empty content response from Gemini.");
      }

      // Filter out internal reasoning/thought parts (which have thought: true in newer models)
      const textParts = parts.filter((p: any) => !p?.thought && typeof p?.text === "string");
      if (textParts.length === 0) {
        throw new LLMResponseParsingError(this.providerName, "No text content returned in Gemini response (only internal thoughts).");
      }

      const rawText = textParts.map((p: any) => p.text).join("").trim();
      if (!rawText) {
        throw new LLMResponseParsingError(this.providerName, "Empty text content in Gemini response.");
      }

      return parseStructuredCardDrafts(rawText, this.providerName, { difficulty: options.difficulty });
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
