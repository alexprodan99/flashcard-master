import type { CleanTextDocument, DifficultyLevel, PersonaType, CardDepthMode } from "../domain/models.js";
import type { LLMProviderPort, CardGenerationDraft } from "../ports/index.js";
import { TextChunker, type TextChunkerOptions } from "./text-chunker.js";
import { PromptBuilder } from "./prompt-builder.js";
import { GroundingGuard } from "./grounding-guard.js";
import {
  formatTimestamp,
  formatTimestampRange,
  parseTimestampToSeconds,
} from "./subtitle-parser.js";

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
  sourceOriginUrl?: string;
  documentTitle?: string;
}

const YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:watch|shorts\/|live\/)|youtu\.be\/)/i;

export function appendTimestampToMediaUrl(
  originUrl?: string | null,
  sourceLocator?: string | null,
  fallbackStartSeconds?: number | null
): string | undefined {
  if (!originUrl) {
    return undefined;
  }

  if (!YOUTUBE_URL_REGEX.test(originUrl)) {
    return originUrl;
  }

  let targetSeconds: number | null = null;
  const locator = (sourceLocator || "").trim();

  if (locator) {
    const bracketMatch = locator.match(
      /\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?\]/
    );
    const bareMatch = bracketMatch ? null : locator.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    const rawTs = bracketMatch?.[1] ?? bareMatch?.[1];
    if (rawTs) {
      try {
        const parsed = parseTimestampToSeconds(rawTs);
        if (Number.isFinite(parsed) && parsed >= 0) {
          targetSeconds = Math.floor(parsed);
        }
      } catch {
        // Ignore unparseable timestamp tokens
      }
    }
  }

  if (
    targetSeconds === null &&
    typeof fallbackStartSeconds === "number" &&
    Number.isFinite(fallbackStartSeconds) &&
    fallbackStartSeconds >= 0
  ) {
    targetSeconds = Math.floor(fallbackStartSeconds);
  }

  if (targetSeconds === null || targetSeconds < 0) {
    return originUrl;
  }

  const hashIdx = originUrl.indexOf("#");
  const baseAndQuery = hashIdx >= 0 ? originUrl.slice(0, hashIdx) : originUrl;
  const hashSuffix = hashIdx >= 0 ? originUrl.slice(hashIdx) : "";

  const cleanedBase = baseAndQuery.replace(
    /([?&])t=\d+s?(&?)/gi,
    (_m, p1: string, p2: string) => (p1 === "?" ? (p2 ? "?" : "") : p2 ? "&" : "")
  );

  const sep = cleanedBase.includes("?") ? "&" : "?";
  return `${cleanedBase}${sep}t=${targetSeconds}s${hashSuffix}`;
}

export function formatCardSourceLocator(
  docTitle: string,
  startPage?: number | null,
  endPage?: number | null,
  draftLocator?: string,
  startSeconds?: number | null,
  endSeconds?: number | null
): string {
  let cleanTitle = (docTitle || "Document").trim();
  let cleanDraft = (draftLocator || "").trim();

  // If cleanDraft starts with cleanTitle, strip cleanTitle prefix before formatting
  if (cleanDraft.startsWith(cleanTitle)) {
    cleanDraft = cleanDraft.slice(cleanTitle.length).replace(/^[\s\-:,]+/, "").trim();
  }

  const hasPageInDraft = /\bpages?\s*\d+/i.test(cleanDraft);
  const hasTimestampInDraft =
    /\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?\]|\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(
      cleanDraft
    );

  // If cleanDraft specifies a page, strip any chunk page range suffix from cleanTitle
  // to avoid redundant locators like "Book - Pages 26-30 - Page 27"
  if (hasPageInDraft) {
    cleanTitle = cleanTitle.replace(/\s*[-–—]\s*Pages?\s*\d+(?:\s*[-–—]\s*\d+)?\s*$/i, "").trim();
    if (cleanDraft.startsWith(cleanTitle)) {
      cleanDraft = cleanDraft.slice(cleanTitle.length).replace(/^[\s\-:,]+/, "").trim();
    }
  }

  // If cleanDraft specifies a timestamp, strip any trailing chunk timestamp range from cleanTitle
  // to avoid redundant locators like "Lecture [00:00 - 10:00] - [04:12 - 04:45]"
  if (hasTimestampInDraft) {
    cleanTitle = cleanTitle
      .replace(
        /\s*(?:[-–—]\s*)?\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?\]\s*$/,
        ""
      )
      .trim();
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

  let timePart = "";
  if (
    !hasTimestampInDraft &&
    typeof startSeconds === "number" &&
    startSeconds >= 0 &&
    !/\[\d{1,2}:\d{2}/.test(cleanTitle)
  ) {
    timePart =
      typeof endSeconds === "number" && endSeconds > startSeconds
        ? formatTimestampRange(startSeconds, endSeconds)
        : `[${formatTimestamp(startSeconds)}]`;
  }

  const coordParts = [
    pagePart && !hasPageInDraft ? pagePart : "",
    timePart && !hasTimestampInDraft ? timePart : "",
  ].filter(Boolean);

  if (!cleanDraft) {
    return coordParts.length > 0 ? `${cleanTitle} - ${coordParts.join(", ")}` : cleanTitle;
  }

  if (coordParts.length > 0) {
    return `${cleanTitle} - ${coordParts.join(", ")}, ${cleanDraft}`;
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
    const isMediaTranscript =
      typeof doc.startSeconds === "number" ||
      typeof doc.endSeconds === "number" ||
      /\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-–—]\s*\d{1,2}:\d{2}(?::\d{2})?)?\]/.test(doc.textContent);

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
          includeMediaTimestamps: isMediaTranscript,
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
              includeMediaTimestamps: isMediaTranscript,
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
          const sourceLocator = formatCardSourceLocator(
            doc.title,
            doc.startPage,
            doc.endPage,
            draft.sourceLocator,
            doc.startSeconds,
            doc.endSeconds
          );
          const resolvedOriginUrl = appendTimestampToMediaUrl(
            doc.originUrl,
            draft.sourceLocator || sourceLocator,
            doc.startSeconds
          );
          const mapped: GeneratedCardDraft = {
            question: draft.question,
            answer: draft.answer,
            sourceQuote: draft.sourceQuote,
            citation: draft.citation || draft.sourceQuote,
            difficulty: draft.difficulty || difficulty,
            keywords: draft.keywords || [],
            sourceLocator,
            sourceId: doc.sourceId,
            originUrl: resolvedOriginUrl,
            sourceOriginUrl: resolvedOriginUrl,
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
