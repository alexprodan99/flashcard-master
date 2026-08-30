import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { type LLMConfig } from "./types.js";
export declare class OpenAIAdapter implements LLMProviderPort {
    readonly providerName = "openai";
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
//# sourceMappingURL=openai-adapter.d.ts.map