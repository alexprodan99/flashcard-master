import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { type LLMConfig } from "./types.js";
export declare class GeminiAdapter implements LLMProviderPort {
    readonly providerName = "gemini";
    private readonly apiKey?;
    private readonly model;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly fetchFn;
    constructor(config?: Partial<LLMConfig>);
    generateQAPairs(text: string, options: {
        difficulty: DifficultyLevel;
        personaPrompt: string;
        targetCount?: number;
    }): Promise<CardGenerationDraft[]>;
}
//# sourceMappingURL=gemini-adapter.d.ts.map