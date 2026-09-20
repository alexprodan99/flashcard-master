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
    const diffInstruction = options.difficulty === "mixed"
      ? `Generate a balanced progression of ${count} atomic Front/Back flashcards across the text, spanning beginner fundamentals, intermediate mechanics, and expert trade-offs (assign each card its appropriate difficulty: "beginner", "intermediate", "expert", or "mixed").`
      : `Generate exactly ${count} atomic Front/Back flashcards from the provided text at "${options.difficulty}" difficulty.`;

    const systemPrompt = `${options.personaPrompt}
${diffInstruction}
CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "citation". Do NOT paraphrase, edit, or summarize any words in "citation".`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const tool = DialectCompiler.toAnthropicBatchTool(CardGenerationDraftSchema);
      const toolChoice = DialectCompiler.toAnthropicToolChoice();

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
          ],
          tools: [tool],
          tool_choice: toolChoice,
          temperature: 0.2,
        }),
      });

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
      const contentParts = json.content;
      if (!contentParts || !Array.isArray(contentParts) || contentParts.length === 0) {
        throw new LLMResponseParsingError(this.providerName, "Empty message response from Anthropic.");
      }

      // Check for tool_use block
      const toolUsePart =
        contentParts.find((c: any) => c?.type === "tool_use" && c?.name === "emit_flashcards") ||
        contentParts.find((c: any) => c?.type === "tool_use");

      if (toolUsePart && toolUsePart.input) {
        return parseStructuredCardDrafts(toolUsePart.input, this.providerName, { difficulty: options.difficulty });
      }

      // Fallback for text parts (e.g. mock tests)
      const textParts = contentParts.filter((c: any) => c?.type === "text" && typeof c?.text === "string");
      const targetParts = textParts.length > 0 ? textParts : contentParts.filter((c: any) => typeof c?.text === "string");
      const responseText = targetParts.map((c: any) => c.text).join("").trim();
      if (!responseText) {
        throw new LLMResponseParsingError(this.providerName, "Empty message response from Anthropic.");
      }

      return parseStructuredCardDrafts(responseText, this.providerName, { difficulty: options.difficulty });
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
