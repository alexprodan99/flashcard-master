import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { LLMResponseParsingError, LLMNetworkError, CardDraftArraySchema, cleanJsonString, type LLMConfig } from "./types.js";

export class OllamaAdapter implements LLMProviderPort {
  readonly providerName = "ollama";
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.model = config.model || "llama3";
    this.baseUrl = config.baseUrl || "http://localhost:11434";
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
    const count = options.targetCount ?? 5;
    const systemPrompt = `${options.personaPrompt}
Generate exactly ${count} atomic Front/Back flashcards from the provided document at "${options.difficulty}" difficulty.
CRITICAL GROUNDING RULE: For each card, extract an exact verbatim "sourceQuote" sentence from the source text that proves the answer.
Respond with a JSON object containing a "cards" array:
{
  "cards": [
    {
      "question": "...",
      "answer": "...",
      "sourceQuote": "...",
      "difficulty": "${options.difficulty}"
    }
  ]
}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
          format: "json",
          stream: false,
        }),
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new LLMNetworkError(this.providerName, `Ollama server error ${response.status}: ${await response.text()}`);
      }

      const json = await response.json();
      const content = json.message?.content;
      if (!content) {
        throw new LLMResponseParsingError(this.providerName, "Empty message response from Ollama.");
      }

      const cleanJson = cleanJsonString(content);
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
      if (err instanceof LLMNetworkError || err instanceof LLMResponseParsingError) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new LLMNetworkError(this.providerName, `Ollama request timed out after ${this.timeoutMs}ms.`);
      }
      throw new LLMResponseParsingError(this.providerName, err.message);
    }
  }
}
