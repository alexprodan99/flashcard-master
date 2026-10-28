import type { DataSource, RawDocument, CleanTextDocument, SyncState, Flashcard, DifficultyLevel, ImageQuality, Setting, ProviderVerificationResult, SecretProvider, JobLogLevel } from "../domain/models.js";
import type { DocumentSlicingOptions } from "../services/document-slicing-engine.js";

export interface IngestionOptions {
  onLog?: (level: JobLogLevel, message: string, details?: Record<string, any>) => void;
  signal?: AbortSignal;
  verbose?: boolean;
  slicing?: DocumentSlicingOptions;
}

export interface IngestionStrategy {
  readonly type: DataSource["type"];
  fetch(source: DataSource, lastSync?: SyncState, options?: IngestionOptions): Promise<RawDocument[]>;
  extractCleanText(raw: RawDocument): CleanTextDocument;
}

export interface CardGenerationDraft {
  question: string;
  answer: string;
  sourceQuote: string;
  citation?: string;
  difficulty: DifficultyLevel;
  keywords?: string[];
  sourceLocator?: string;
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
  title?: string;
  author?: string;
  publisher?: string;
  includeCitationFootnotes?: boolean;
  includeCitations?: boolean;
  includeToc?: boolean;
  includeFoldGuide?: boolean;
  includeBadges?: boolean;
  tags?: string[];
}

export type FlashcardExportFormat =
  | "apkg"
  | "csv"
  | "tsv"
  | "markdown"
  | "md"
  | "html"
  | "pdf"
  | "epub"
  | "ankiconnect";

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

export type DocumentExportFormat = "markdown" | "md" | "html" | "txt" | "text" | "json" | "epub";
export type DocumentExportMode = "merged" | "split";

export interface DocumentExportOptions {
  format: DocumentExportFormat;
  mode?: DocumentExportMode;
  sourceName?: string;
  includeTableOfContents?: boolean;
  includeCitations?: boolean;
  outputPath?: string;
  imageQuality?: ImageQuality;
  grayscale?: boolean;
  coverImage?: Buffer | string;
}

export interface DocumentExportResult {
  filename: string;
  mimeType: string;
  content: string | Buffer | Uint8Array;
  documentCount: number;
}

export interface SettingsRepository {
  get(key: string): string | null;
  getWithMetadata(key: string): Setting | null;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  list(): Record<string, string>;
  getAll(): Setting[];
}

export interface ProviderVerifierPort {
  verify(options: {
    provider: SecretProvider | string;
    key?: string | null;
    endpoint?: string | null;
    timeoutMs?: number;
  }): Promise<ProviderVerificationResult>;
}


