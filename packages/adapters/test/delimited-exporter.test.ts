import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CsvExporter, TsvExporter } from "../src/export/delimited-exporter.js";
import type { Flashcard } from "@flashcard-master/core";

describe("DelimitedExporters (CSV & TSV)", () => {
  const mockCards: Flashcard[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      question: 'What does "WAL" stand for in SQLite?',
      answer: "Write-Ahead Logging, which enables concurrent reads and writes.",
      sourceQuote: "SQLite WAL mode improves concurrency.",
      keywords: ["sqlite", "wal"],
      sourceLocator: "WAL Docs",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Databases",
      tags: ["sqlite", "storage"],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      question: "Line 1\nLine 2 question",
      answer: "Multi-line\r\nAnswer with, comma and \"quotes\"",
      sourceQuote: "Multiline quote text.",
      keywords: ["multiline"],
      sourceLocator: "Doc 2",
      difficulty: "expert",
      personaUsed: "strict-examiner",
      targetDeck: "Advanced",
      tags: ["multiline"],
    },
  ];

  it("exports cards to RFC 4180 compliant CSV string", async () => {
    const exporter = new CsvExporter();
    const result = await exporter.export(mockCards);

    expect(result.format).toBe("csv");
    expect(result.successCount).toBe(2);
    expect(typeof result.data).toBe("string");

    const content = result.data as string;
    const lines = content.split("\r\n");

    // Header
    expect(lines[0]).toBe("Front,Back,Tags,Source Quote,Difficulty,Deck");

    // Quotes and commas escaped properly
    expect(lines[1]).toContain('"What does ""WAL"" stand for in SQLite?"');
    expect(lines[1]).toContain('"Write-Ahead Logging, which enables concurrent reads and writes."');
  });

  it("exports cards to TSV format", async () => {
    const exporter = new TsvExporter();
    const result = await exporter.export(mockCards);

    expect(result.format).toBe("tsv");
    expect(result.successCount).toBe(2);

    const content = result.data as string;
    expect(content.startsWith("Front\tBack\tTags\tSource Quote\tDifficulty\tDeck")).toBe(true);
  });

  it("writes output directly to file on disk", async () => {
    const tempFile = path.join(os.tmpdir(), `test-export-${Date.now()}.csv`);
    const exporter = new CsvExporter();

    const result = await exporter.export(mockCards, { outputPath: tempFile });

    expect(result.outputPath).toBe(tempFile);
    expect(fs.existsSync(tempFile)).toBe(true);

    const readData = fs.readFileSync(tempFile, "utf8");
    expect(readData).toContain("What does");

    fs.unlinkSync(tempFile);
  });

  it("supports disabling headers and handles empty card arrays", async () => {
    const exporter = new CsvExporter();
    const noHeaders = await exporter.export(mockCards, { includeHeaders: false });
    expect((noHeaders.data as string).startsWith("Front,Back")).toBe(false);

    const empty = await exporter.export([]);
    expect(empty.successCount).toBe(0);
  });
});
