import type { CleanTextDocument, DifficultyLevel, PersonaType } from "../domain/models.js";
import type { LLMProviderPort, CardGenerationDraft } from "../ports/index.js";
import { TextChunker, type TextChunkerOptions } from "./text-chunker.js";
import { PromptBuilder } from "./prompt-builder.js";
export interface CardGenerationOptions {
    difficulty?: DifficultyLevel;
    persona?: PersonaType | string;
    targetCountPerChunk?: number;
    chunkOptions?: TextChunkerOptions;
}
export interface GeneratedCardDraft extends CardGenerationDraft {
    sourceId: string;
    originUrl?: string;
    documentTitle?: string;
}
export declare class CardGenerationService {
    private readonly llmProvider;
    private readonly chunker;
    private readonly promptBuilder;
    constructor(llmProvider: LLMProviderPort, chunker?: TextChunker, promptBuilder?: PromptBuilder);
    generateFromDocument(doc: CleanTextDocument, options?: CardGenerationOptions): Promise<GeneratedCardDraft[]>;
}
//# sourceMappingURL=card-generation-service.d.ts.map