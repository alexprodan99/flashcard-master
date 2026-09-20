import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AnkiPackageExporter } from "../src/export/anki-package-exporter.js";
import type { Flashcard } from "@flashcard-master/core";

describe("AnkiPackageExporter", () => {
  const exporter = new AnkiPackageExporter();

  const mockCards: Flashcard[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      question: "What is WAL mode in SQLite?",
      answer: "Write-Ahead Logging provides concurrent readers and writers.",
      sourceQuote: "SQLite WAL mode allows multiple readers to operate concurrently with a writer.",
      keywords: ["sqlite", "wal"],
      sourceLocator: "WAL Docs",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Databases & Storage",
      tags: ["sqlite", "databases"],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      question: "What is Raft consensus?",
      answer: "A leader-based consensus algorithm.",
      sourceQuote: "Raft is a consensus algorithm for managing replicated logs.",
      keywords: ["raft", "consensus"],
      sourceLocator: "Raft Paper Section 1",
      difficulty: "beginner",
      personaUsed: "socratic-mentor",
      targetDeck: "Distributed Systems",
      tags: ["raft", "consensus"],
    },
  ];

  it("exports flashcards to a valid .apkg ZIP package with SQLite database", async () => {
    const result = await exporter.export(mockCards, {
      targetDeck: "Distributed Systems",
      includeCitationFootnotes: true,
    });

    expect(result.format).toBe("apkg");
    expect(result.successCount).toBe(2);
    expect(Buffer.isBuffer(result.data)).toBe(true);

    // Unzip the package
    const zip = await JSZip.loadAsync(result.data as Buffer);
    expect(zip.file("collection.anki2")).not.toBeNull();
    expect(zip.file("media")).not.toBeNull();

    const mediaContent = await zip.file("media")!.async("string");
    expect(mediaContent).toBe("{}");

    // Inspect the SQLite collection
    const dbBuffer = await zip.file("collection.anki2")!.async("nodebuffer");
    const tempDbPath = path.join(os.tmpdir(), `test-anki-${Date.now()}.db`);
    fs.writeFileSync(tempDbPath, dbBuffer);

    const db = new Database(tempDbPath);
    try {
      const col = db.prepare("SELECT * FROM col").get() as any;
      expect(col).toBeDefined();

      const decks = JSON.parse(col.decks);
      expect(Object.values(decks)[0]).toMatchObject({
        name: "Distributed Systems",
      });

      const notes = db.prepare("SELECT * FROM notes").all() as any[];
      expect(notes.length).toBe(2);
      expect(notes[0].flds).toContain("What is WAL mode in SQLite?");
      expect(notes[0].flds).toContain("Write-Ahead Logging provides");
      expect(notes[0].flds).toContain("Source Citation");
      expect(notes[0].tags).toBe("sqlite databases");

      const cards = db.prepare("SELECT * FROM cards").all() as any[];
      expect(cards.length).toBe(2);
    } finally {
      db.close();
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    }
  });

  it("exports directly to disk when outputPath is specified", async () => {
    const tempOut = path.join(os.tmpdir(), `exported-deck-${Date.now()}.apkg`);

    const result = await exporter.export(mockCards, {
      outputPath: tempOut,
    });

    expect(result.outputPath).toBe(tempOut);
    expect(fs.existsSync(tempOut)).toBe(true);

    // Validate generated file
    const fileBuffer = fs.readFileSync(tempOut);
    const zip = await JSZip.loadAsync(fileBuffer);
    expect(zip.file("collection.anki2")).not.toBeNull();

    // Clean up
    fs.unlinkSync(tempOut);
  });

  it("handles empty card arrays without error", async () => {
    const result = await exporter.export([], { targetDeck: "Empty Deck" });
    expect(result.successCount).toBe(0);
    expect(Buffer.isBuffer(result.data)).toBe(true);
  });
});
