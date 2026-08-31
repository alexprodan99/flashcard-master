import path from "node:path";
import type { Flashcard } from "../domain/models.js";
import type { ExportOptions, ExportResult } from "../ports/index.js";
import type { FlashcardRepository, CardFilter } from "../storage/card-repository.js";
import type { ExporterRegistry } from "./exporter-registry.js";

export class UnsupportedExportFormatError extends Error {
  constructor(format: string, availableFormats: string[]) {
    const list = availableFormats.length > 0 ? availableFormats.join(", ") : "none registered";
    super(`Unsupported export format "${format}". Available formats: [${list}].`);
    this.name = "UnsupportedExportFormatError";
  }
}

export interface ExportRequest {
  format: string;
  filter?: CardFilter;
  options?: ExportOptions & Record<string, any>;
}

export interface BulkDeckExportRequest {
  format: string;
  outputDir: string;
  options?: Omit<ExportOptions, "outputPath" | "targetDeck"> & Record<string, any>;
}

export class ExportService {
  constructor(
    private readonly cardRepo: FlashcardRepository,
    private readonly registry: ExporterRegistry
  ) {}

  private getExtensionForFormat(format: string): string {
    switch (format.toLowerCase()) {
      case "apkg":
        return "apkg";
      case "csv":
        return "csv";
      case "tsv":
        return "tsv";
      case "markdown":
      case "md":
        return "md";
      case "html":
      case "pdf-html":
        return "html";
      default:
        return format.toLowerCase();
    }
  }

  async export(request: ExportRequest): Promise<ExportResult> {
    const format = request.format.toLowerCase();
    const exporter = this.registry.get(format);

    if (!exporter) {
      throw new UnsupportedExportFormatError(request.format, this.registry.listFormats());
    }

    const filter = request.filter || {};
    const cards = this.cardRepo.list(filter);

    const targetDeck = filter.targetDeck || request.options?.targetDeck || (cards.length > 0 ? cards[0].targetDeck : "Default");

    return exporter.export(cards, {
      ...request.options,
      targetDeck,
    });
  }

  async exportAllDecks(request: BulkDeckExportRequest): Promise<ExportResult[]> {
    const format = request.format.toLowerCase();
    if (!this.registry.has(format)) {
      throw new UnsupportedExportFormatError(request.format, this.registry.listFormats());
    }

    let decks = this.cardRepo.listDecks();
    if (decks.length === 0) {
      decks = ["Default"];
    }

    const ext = this.getExtensionForFormat(format);
    const results: ExportResult[] = [];

    for (const deck of decks) {
      const safeName = deck.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const filename = `${safeName}.${ext}`;
      const outputPath = path.join(request.outputDir, filename);

      const res = await this.export({
        format: request.format,
        filter: { targetDeck: deck },
        options: {
          ...request.options,
          targetDeck: deck,
          outputPath,
        },
      });

      results.push(res);
    }

    return results;
  }
}
