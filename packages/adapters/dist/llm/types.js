import { z } from "zod";
import { DifficultyLevelSchema } from "@flashcard-master/core";
export class LLMAuthenticationError extends Error {
    constructor(provider, message = "Invalid or missing API key.") {
        super(`[${provider}] Authentication failed: ${message}`);
        this.name = "LLMAuthenticationError";
    }
}
export class LLMRateLimitError extends Error {
    constructor(provider, message = "Rate limit exceeded (HTTP 429).") {
        super(`[${provider}] Rate limit error: ${message}`);
        this.name = "LLMRateLimitError";
    }
}
export class LLMResponseParsingError extends Error {
    rawResponse;
    constructor(provider, message, rawResponse) {
        super(`[${provider}] Failed to parse generated flashcards JSON: ${message}`);
        this.rawResponse = rawResponse;
        this.name = "LLMResponseParsingError";
    }
}
export class LLMNetworkError extends Error {
    constructor(provider, message) {
        super(`[${provider}] Network communication error: ${message}`);
        this.name = "LLMNetworkError";
    }
}
export const CardDraftArraySchema = z.array(z.object({
    question: z.string().min(1, "Question cannot be empty"),
    answer: z.string().min(1, "Answer cannot be empty"),
    sourceQuote: z.string().min(1, "Source quote cannot be empty"),
    difficulty: DifficultyLevelSchema.optional().default("intermediate"),
}));
//# sourceMappingURL=types.js.map