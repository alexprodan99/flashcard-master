import type { LLMProviderPort, CardGenerationDraft, DifficultyLevel } from "@flashcard-master/core";
import { type LLMConfig } from "./types.js";
export declare class OllamaAdapter implements LLMProviderPort {
    readonly providerName = "ollama";
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
//# sourceMappingURL=ollama-adapter.d.ts.map