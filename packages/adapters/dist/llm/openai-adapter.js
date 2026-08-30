import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError, LLMNetworkError, CardDraftArraySchema, cleanJsonString } from "./types.js";
export class OpenAIAdapter {
    providerName = "openai";
    apiKey;
    model;
    baseUrl;
    timeoutMs;
    fetchFn;
    constructor(config = {}) {
        this.apiKey = config.apiKey;
        this.model = config.model || "gpt-4o-mini";
        this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
        this.timeoutMs = config.timeoutMs ?? 30000;
        this.fetchFn = config.customFetch ?? globalThis.fetch;
    }
    async generateQAPairs(text, options) {
        if (!this.apiKey && !this.baseUrl.includes("localhost")) {
            throw new LLMAuthenticationError(this.providerName, "API key is required for OpenAI.");
        }
        const count = options.targetCount ?? 5;
        const systemPrompt = `${options.personaPrompt}
Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.
CRITICAL GROUNDING RULE: For each card, extract an exact verbatim "sourceQuote" sentence from the source text that proves the answer.
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
            const cleanJson = cleanJsonString(content);
            const parsedJson = JSON.parse(cleanJson);
            const rawArray = Array.isArray(parsedJson) ? parsedJson : (parsedJson.cards || parsedJson.flashcards || Object.values(parsedJson)[0]);
            const validated = CardDraftArraySchema.parse(rawArray);
            return validated.map((c) => ({
                question: c.question,
                answer: c.answer,
                sourceQuote: c.sourceQuote,
                difficulty: c.difficulty,
            }));
        }
        catch (err) {
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
//# sourceMappingURL=openai-adapter.js.map