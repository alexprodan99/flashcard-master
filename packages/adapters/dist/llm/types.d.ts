import { z } from "zod";
export declare class LLMAuthenticationError extends Error {
    constructor(provider: string, message?: string);
}
export declare class LLMRateLimitError extends Error {
    constructor(provider: string, message?: string);
}
export declare class LLMResponseParsingError extends Error {
    readonly rawResponse?: string | undefined;
    constructor(provider: string, message: string, rawResponse?: string | undefined);
}
export declare class LLMNetworkError extends Error {
    constructor(provider: string, message: string);
}
export declare const CardDraftArraySchema: z.ZodArray<z.ZodObject<{
    question: z.ZodString;
    answer: z.ZodString;
    sourceQuote: z.ZodString;
    difficulty: z.ZodDefault<z.ZodOptional<z.ZodEnum<["beginner", "intermediate", "expert"]>>>;
}, "strip", z.ZodTypeAny, {
    question: string;
    answer: string;
    sourceQuote: string;
    difficulty: "beginner" | "intermediate" | "expert";
}, {
    question: string;
    answer: string;
    sourceQuote: string;
    difficulty?: "beginner" | "intermediate" | "expert" | undefined;
}>, "many">;
export interface LLMConfig {
    provider: "openai" | "gemini" | "anthropic" | "ollama";
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    timeoutMs?: number;
    customFetch?: typeof fetch;
}
//# sourceMappingURL=types.d.ts.map