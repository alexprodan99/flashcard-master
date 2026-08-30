import type { DataSource, RawDocument, CleanTextDocument, SyncState, Flashcard, DifficultyLevel } from "../domain/models.js";

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

export interface ExportResult {
  format: string;
  successCount: number;
  outputPath?: string;
  message?: string;
}

export interface ExporterPort {
  readonly format: string;
  export(cards: Flashcard[], options?: Record<string, unknown>): Promise<ExportResult>;
}
