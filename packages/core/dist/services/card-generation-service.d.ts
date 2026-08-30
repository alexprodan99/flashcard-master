import type { CleanTextDocument, DifficultyLevel, PersonaType } from "../domain/models.js";
import type { LLMProviderPort, CardGenerationDraft } from "../ports/index.js";
import { TextChunker, type TextChunkerOptions } from "./text-chunker.js";
import { PromptBuilder } from "./prompt-builder.js";
import { GroundingGuard } from "./grounding-guard.js";
export interface CardGenerationOptions {
    difficulty?: DifficultyLevel;
    persona?: PersonaType | string;
    targetCountPerChunk?: number;
    chunkOptions?: TextChunkerOptions;
    enforceGrounding?: boolean;
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
    private readonly groundingGuard;
    constructor(llmProvider: LLMProviderPort, chunker?: TextChunker, promptBuilder?: PromptBuilder, groundingGuard?: GroundingGuard);
    generateFromDocument(doc: CleanTextDocument, options?: CardGenerationOptions): Promise<GeneratedCardDraft[]>;
}
//# sourceMappingURL=card-generation-service.d.ts.map