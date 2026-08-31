import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { FlashcardRepository } from "../src/storage/card-repository.js";
import { ExporterRegistry } from "../src/services/exporter-registry.js";
import { ExportService, UnsupportedExportFormatError } from "../src/services/export-service.js";
import type { ExporterPort, ExportOptions, ExportResult } from "../src/ports/index.js";
import type { Flashcard } from "../src/domain/models.js";
import type Database from "better-sqlite3";

class MockExporter implements ExporterPort {
  constructor(readonly format: string) {}

  async export(cards: Flashcard[], options?: ExportOptions): Promise<ExportResult> {
    return {
      format: this.format,
      successCount: cards.length,
      outputPath: options?.outputPath,
      data: `Exported ${cards.length} cards to ${this.format}`,
    };
  }
}

describe("ExportService & ExporterRegistry", () => {
  let db: Database.Database;
  let cardRepo: FlashcardRepository;
  let registry: ExporterRegistry;
  let exportService: ExportService;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    cardRepo = new FlashcardRepository(db);
    registry = new ExporterRegistry();
    exportService = new ExportService(cardRepo, registry);

    registry.register(new MockExporter("csv"));
    registry.register(new MockExporter("markdown"));
    registry.register(new MockExporter("apkg"));

    // Seed test cards
    cardRepo.create({
      question: "Q1",
      answer: "A1",
      sourceQuote: "Quote 1",
      targetDeck: "Deck A",
      difficulty: "beginner",
      tags: ["tag1"],
    });

    cardRepo.create({
      question: "Q2",
      answer: "A2",
      sourceQuote: "Quote 2",
      targetDeck: "Deck A",
      difficulty: "expert",
      tags: ["tag2"],
    });

    cardRepo.create({
      question: "Q3",
      answer: "A3",
      sourceQuote: "Quote 3",
      targetDeck: "Deck B",
      difficulty: "intermediate",
      tags: ["tag1"],
    });
  });

  afterEach(() => {
    db.close();
  });

  it("lists available formats in registry", () => {
    expect(registry.listFormats()).toEqual(["apkg", "csv", "markdown"]);
    expect(registry.has("csv")).toBe(true);
    expect(registry.has("unknown")).toBe(false);
  });

  it("exports cards filtered by target deck", async () => {
    const result = await exportService.export({
      format: "csv",
      filter: { targetDeck: "Deck A" },
    });

    expect(result.format).toBe("csv");
    expect(result.successCount).toBe(2);
    expect(result.data).toBe("Exported 2 cards to csv");
  });

  it("exports cards filtered by tag", async () => {
    const result = await exportService.export({
      format: "markdown",
      filter: { tag: "tag1" },
    });

    expect(result.format).toBe("markdown");
    expect(result.successCount).toBe(2); // Q1 (Deck A) and Q3 (Deck B)
  });

  it("throws UnsupportedExportFormatError when an unknown format is requested", async () => {
    await expect(
      exportService.export({
        format: "docx",
      })
    ).rejects.toThrow(UnsupportedExportFormatError);
  });

  it("exports all distinct decks in batch", async () => {
    const results = await exportService.exportAllDecks({
      format: "apkg",
      outputDir: "/tmp/exports",
    });

    expect(results.length).toBe(2); // Deck A (2 cards) and Deck B (1 card)
    expect(results[0].successCount).toBe(2);
    expect(results[0].outputPath).toContain("deck_a.apkg");
    expect(results[1].successCount).toBe(1);
    expect(results[1].outputPath).toContain("deck_b.apkg");
  });
});
