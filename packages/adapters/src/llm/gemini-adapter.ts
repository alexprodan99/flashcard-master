import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError, LLMNetworkError, parseCardDraftsFromJson, type LLMConfig } from "./types.js";

export class GeminiAdapter implements LLMProviderPort {
  readonly providerName = "gemini";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gemini-3.6-flash";
    this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
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
    if (!this.apiKey) {
      throw new LLMAuthenticationError(this.providerName, "Google Gemini API key is required.");
    }

    const count = options.targetCount ?? 5;
    const diffInstruction = options.difficulty === "mixed"
      ? `Generate a balanced progression of ${count} atomic Front/Back flashcards across the text, spanning beginner fundamentals, intermediate mechanics, and expert trade-offs (assign each card its appropriate difficulty: "beginner", "intermediate", "expert", or "mixed").`
      : `Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.`;

    const prompt = `${options.personaPrompt}
${diffInstruction}
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "sourceQuote". Do NOT paraphrase, edit, or summarize any words in "sourceQuote".
CRITICAL JSON FORMATTING: Ensure all inner quotes inside strings (such as code snippets, filenames, or CLI flags) are strictly escaped with backslashes (\\").
Respond with a JSON array:
[
  {
    "question": "...",
    "answer": "...",
    "sourceQuote": "...",
    "difficulty": "${options.difficulty === "mixed" ? "beginner" : options.difficulty}"
  }
]

Document Content:
${text}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await this.fetchFn(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 4096,
            temperature: 0.2,
          },
        }),
      });
      clearTimeout(timer);

      if (response.status === 400 || response.status === 403) {
        throw new LLMAuthenticationError(this.providerName, "Invalid Google Gemini API key or request.");
      }
      if (response.status === 429) {
        throw new LLMRateLimitError(this.providerName, "Google Gemini rate limit exceeded.");
      }
      if (!response.ok) {
        throw new LLMNetworkError(this.providerName, `HTTP error ${response.status}: ${await response.text()}`);
      }

      const json = await response.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new LLMResponseParsingError(this.providerName, "Empty content response from Gemini.");
      }

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
