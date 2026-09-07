import type { DataSource, RawDocument, CleanTextDocument, SyncState, Flashcard, DifficultyLevel, ImageQuality } from "../domain/models.js";

export interface IngestionStrategy {
  readonly type: DataSource["type"];
  fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]>;
  extractCleanText(raw: RawDocument): CleanTextDocument;
}

export interface CardGenerationDraft {
  question: string;
  answer: string;
  sourceQuote: string;
  difficulty: DifficultyLevel;
}

export interface LLMProviderPort {
  readonly providerName: string;
  generateQAPairs(
    text: string,
    options: {
      difficulty: DifficultyLevel;
      personaPrompt: string;
      targetCount?: number;
    }
  ): Promise<CardGenerationDraft[]>;
}

export interface ExportOptions {
  outputPath?: string;
  targetDeck?: string;
  includeCitationFootnotes?: boolean;
  includeCitations?: boolean;
  includeToc?: boolean;
  includeFoldGuide?: boolean;
  includeBadges?: boolean;
  tags?: string[];
}

export interface ExportResult {
  format: string;
  successCount: number;
  outputPath?: string;
  data?: Buffer | string;
  message?: string;
}

export interface ExporterPort {
  readonly format: string;
  export(cards: Flashcard[], options?: ExportOptions): Promise<ExportResult>;
}

export type DocumentExportFormat = "markdown" | "md" | "html" | "txt" | "text" | "json";
export type DocumentExportMode = "merged" | "split";

export interface DocumentExportOptions {
  format: DocumentExportFormat;
  mode: DocumentExportMode;
  sourceName?: string;
  includeTableOfContents?: boolean;
  includeCitations?: boolean;
  outputPath?: string;
  imageQuality?: ImageQuality;
  grayscale?: boolean;
}

export interface DocumentExportResult {
  filename: string;
  mimeType: string;
  content: string | Buffer | Uint8Array;
  documentCount: number;
}

