import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError, LLMNetworkError, CardDraftArraySchema, cleanJsonString, type LLMConfig } from "./types.js";

export class GeminiAdapter implements LLMProviderPort {
  readonly providerName = "gemini";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gemini-2.0-flash";
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
    const prompt = `${options.personaPrompt}
Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.
CRITICAL GROUNDING RULE: For each card, extract an exact verbatim "sourceQuote" sentence from the source text that proves the answer.
Respond with a JSON array:
[
  {
    "question": "...",
    "answer": "...",
    "sourceQuote": "...",
    "difficulty": "${options.difficulty}"
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
      if (err instanceof LLMAuthenticationError || err instanceof LLMRateLimitError || err instanceof LLMResponseParsingError) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new LLMNetworkError(this.providerName, `Request timed out after ${this.timeoutMs}ms.`);
      }
      throw new LLMResponseParsingError(this.providerName, err.message);
    }
  }
}
