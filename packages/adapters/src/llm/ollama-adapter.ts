import {
  type LLMProviderPort,
  type CardGenerationDraft,
  type DifficultyLevel,
  CardGenerationDraftSchema,
  DialectCompiler,
} from "@flashcard-master/core";
import {
  LLMResponseParsingError,
  LLMNetworkError,
  parseStructuredCardDrafts,
  type LLMConfig,
} from "./types.js";

export class OllamaAdapter implements LLMProviderPort {
  readonly providerName = "ollama";
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: Partial<LLMConfig> = {}) {
    this.model = config.model || "phi4-mini";
    this.baseUrl = config.baseUrl || "http://localhost:11434";
    this.timeoutMs = config.timeoutMs ?? 300000;
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
    const diffInstruction = options.difficulty === "mixed"
      ? `Generate a balanced progression of ${count} atomic Front/Back flashcards across the text, spanning beginner fundamentals, intermediate mechanics, and expert trade-offs (assign each card its appropriate difficulty: "beginner", "intermediate", "expert", or "mixed").`
      : `Generate exactly ${count} atomic Front/Back flashcards from the provided document at "${options.difficulty}" difficulty.`;

    const systemPrompt = `${options.personaPrompt}
${diffInstruction}
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "citation". Do NOT paraphrase, edit, or summarize any words in "citation".`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const formatSchema = DialectCompiler.toOllamaBatchSchema(CardGenerationDraftSchema);

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
          format: formatSchema,
          options: {
            num_predict: 4096,
            temperature: 0.2,
          },
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new LLMNetworkError(this.providerName, `Ollama server error ${response.status}: ${await response.text()}`);
      }

      const json = await response.json();
      const content = json.message?.content;
      if (!content) {
        throw new LLMResponseParsingError(this.providerName, "Empty message response from Ollama.");
      }

      return parseStructuredCardDrafts(content, this.providerName, { difficulty: options.difficulty });
    } catch (err: any) {
      if (err instanceof LLMNetworkError || err instanceof LLMResponseParsingError) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new LLMNetworkError(this.providerName, `Ollama request timed out after ${this.timeoutMs}ms.`);
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
