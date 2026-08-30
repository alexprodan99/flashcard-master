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

export class CardGenerationService {
  private readonly chunker: TextChunker;
  private readonly promptBuilder: PromptBuilder;
  private readonly groundingGuard: GroundingGuard;

  constructor(
    private readonly llmProvider: LLMProviderPort,
    chunker?: TextChunker,
    promptBuilder?: PromptBuilder,
    groundingGuard?: GroundingGuard
  ) {
    this.chunker = chunker ?? new TextChunker();
    this.promptBuilder = promptBuilder ?? new PromptBuilder();
    this.groundingGuard = groundingGuard ?? new GroundingGuard();
  }

  async generateFromDocument(
    doc: CleanTextDocument,
    options: CardGenerationOptions = {}
  ): Promise<GeneratedCardDraft[]> {
    if (!doc.textContent || doc.textContent.trim().length === 0) {
      return [];
    }

    const difficulty = options.difficulty ?? "intermediate";
    const persona = options.persona ?? "socratic-mentor";
    const targetCount = options.targetCountPerChunk ?? 4;
    const enforceGrounding = options.enforceGrounding ?? true;

    const chunks = this.chunker.chunkText(doc.textContent, options.chunkOptions);
    const allDrafts: GeneratedCardDraft[] = [];

    const personaPrompt = this.promptBuilder.buildGenerationInstructions({
      difficulty,
      persona,
      targetCount,
    });

    for (const chunk of chunks) {
      try {
        const rawDrafts = await this.llmProvider.generateQAPairs(chunk, {
          difficulty,
          personaPrompt,
          targetCount,
        });

        // Filter through GroundingGuard to guarantee factual verification
        const validDrafts = enforceGrounding
          ? this.groundingGuard.filterValidDrafts(rawDrafts, chunk)
          : rawDrafts;

        for (const draft of validDrafts) {
          allDrafts.push({
            question: draft.question,
            answer: draft.answer,
            sourceQuote: draft.sourceQuote,
            difficulty: draft.difficulty || difficulty,
            sourceId: doc.sourceId,
            originUrl: doc.originUrl,
            documentTitle: doc.title,
          });
        }
      } catch (err: any) {
        console.warn(`[CardGenerationService] Error generating cards for chunk in doc "${doc.title}":`, err.message);
        // Error isolation: Continue with other chunks
      }
    }

    return allDrafts;
  }
}
