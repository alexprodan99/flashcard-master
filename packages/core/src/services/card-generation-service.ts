import type { CleanTextDocument, DifficultyLevel, PersonaType, CardDepthMode } from "../domain/models.js";
import type { LLMProviderPort, CardGenerationDraft } from "../ports/index.js";
import { TextChunker, type TextChunkerOptions } from "./text-chunker.js";
import { PromptBuilder } from "./prompt-builder.js";
import { GroundingGuard } from "./grounding-guard.js";

export interface CardGenerationOptions {
  difficulty?: DifficultyLevel;
  persona?: PersonaType | string;
  depthMode?: CardDepthMode;
  targetCountPerChunk?: number;
  chunkOptions?: TextChunkerOptions;
  enforceGrounding?: boolean;
  onCardGenerated?: (card: GeneratedCardDraft) => void | Promise<void>;
}

export interface GeneratedCardDraft extends CardGenerationDraft {
  sourceId: string;
  originUrl?: string;
  documentTitle?: string;
}

export function formatCardSourceLocator(
  docTitle: string,
  startPage?: number | null,
  endPage?: number | null,
  draftLocator?: string
): string {
  let cleanTitle = (docTitle || "Document").trim();
  let cleanDraft = (draftLocator || "").trim();

  // If cleanDraft starts with cleanTitle, strip cleanTitle prefix before formatting
  if (cleanDraft.startsWith(cleanTitle)) {
    cleanDraft = cleanDraft.slice(cleanTitle.length).replace(/^[\s\-:,]+/, "").trim();
  }

  const hasPageInDraft = /\bpages?\s*\d+/i.test(cleanDraft);

  // If cleanDraft specifies a page, strip any chunk page range suffix from cleanTitle
  // to avoid redundant locators like "Book - Pages 26-30 - Page 27"
  if (hasPageInDraft) {
    cleanTitle = cleanTitle.replace(/\s*[-–—]\s*Pages?\s*\d+(?:\s*[-–—]\s*\d+)?\s*$/i, "").trim();
    if (cleanDraft.startsWith(cleanTitle)) {
      cleanDraft = cleanDraft.slice(cleanTitle.length).replace(/^[\s\-:,]+/, "").trim();
    }
  }

  let pagePart = "";
  if (typeof startPage === "number" && startPage > 0) {
    pagePart =
      typeof endPage === "number" && endPage > startPage
        ? `Pages ${startPage}-${endPage}`
        : `Page ${startPage}`;
  }

  // If cleanTitle already contains pagePart, do NOT duplicate pagePart
  if (pagePart && cleanTitle.toLowerCase().includes(pagePart.toLowerCase())) {
    pagePart = "";
  }

  if (!cleanDraft) {
    return pagePart ? `${cleanTitle} - ${pagePart}` : cleanTitle;
  }

  if (pagePart && !hasPageInDraft) {
    return `${cleanTitle} - ${pagePart}, ${cleanDraft}`;
  }

  return `${cleanTitle} - ${cleanDraft}`;
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
    const depthMode = options.depthMode ?? "atomic";
    const targetCount = options.targetCountPerChunk ?? 4;
    const enforceGrounding = options.enforceGrounding ?? true;

    const chunks = this.chunker.chunkText(doc.textContent, options.chunkOptions);
    const allDrafts: GeneratedCardDraft[] = [];

    const chunkErrors: string[] = [];

    for (const chunk of chunks) {
      try {
        // Phase 1: Request oversampled count (+2) to absorb grounding rejects in 1 shot
        const oversampledTarget = targetCount + 2;
        const initialPrompt = this.promptBuilder.buildGenerationInstructions({
          difficulty,
          persona,
          depthMode,
          targetCount: oversampledTarget,
        });

        const rawDrafts = await this.llmProvider.generateQAPairs(chunk, {
          difficulty,
          personaPrompt: initialPrompt,
          targetCount: oversampledTarget,
        });

        // Filter through GroundingGuard to guarantee factual verification
        let validDrafts = enforceGrounding
          ? this.groundingGuard.filterValidDrafts(rawDrafts, chunk)
          : rawDrafts;

        // Phase 2: Adaptive Backfill Retry Loop (up to MAX_BACKFILL_ATTEMPTS = 5) if we have a deficit
        const MAX_BACKFILL_ATTEMPTS = 5;
        let attempt = 0;
        while (validDrafts.length < targetCount && chunk.length > 200 && attempt < MAX_BACKFILL_ATTEMPTS) {
          attempt++;
          const deficit = targetCount - validDrafts.length;
          try {
            const retryPrompt = this.promptBuilder.buildGenerationInstructions({
              difficulty,
              persona,
              depthMode,
              targetCount: deficit + 1,
            });

            const retryDrafts = await this.llmProvider.generateQAPairs(chunk, {
              difficulty,
              personaPrompt: retryPrompt,
              targetCount: deficit + 1,
            });

            const validRetry = enforceGrounding
              ? this.groundingGuard.filterValidDrafts(retryDrafts, chunk)
              : retryDrafts;

            validDrafts = [...validDrafts, ...validRetry];
          } catch (retryErr: any) {
            console.warn(`[CardGenerationService] Adaptive backfill retry attempt ${attempt} skipped: ${retryErr.message}`);
            break;
          }
        }

        // Phase 3: Take up to targetCount cards
        const finalChunkDrafts = validDrafts.slice(0, targetCount);

        for (const draft of finalChunkDrafts) {
          const mapped: GeneratedCardDraft = {
            question: draft.question,
            answer: draft.answer,
            sourceQuote: draft.sourceQuote,
            citation: draft.citation || draft.sourceQuote,
            difficulty: draft.difficulty || difficulty,
            keywords: draft.keywords || [],
            sourceLocator: formatCardSourceLocator(
              doc.title,
              doc.startPage,
              doc.endPage,
              draft.sourceLocator
            ),
            sourceId: doc.sourceId,
            originUrl: doc.originUrl,
            documentTitle: doc.title,
          };
          allDrafts.push(mapped);
          if (options.onCardGenerated) {
            await options.onCardGenerated(mapped);
          }
        }
      } catch (err: any) {
        console.warn(`[CardGenerationService] Error generating cards for chunk in doc "${doc.title}":`, err.message);
        chunkErrors.push(err.message);
      }
    }

    if (allDrafts.length === 0 && chunkErrors.length > 0) {
      throw new Error(chunkErrors[0]);
    }

    return allDrafts;
  }
}
