import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownExporter } from "../src/export/markdown-exporter.js";
import type { Flashcard } from "@flashcard-master/core";

describe("MarkdownExporter", () => {
  const exporter = new MarkdownExporter();

  const mockCards: Flashcard[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      question: "What is Raft consensus?",
      answer: "A leader-based distributed consensus protocol ensuring replicated log consistency.",
      sourceQuote: "Raft is a consensus protocol designed for manageability and reliability.",
      sourceOriginUrl: "https://raft.github.io/raft.pdf",
      documentTitle: "Raft Consensus Paper",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Distributed Systems",
      tags: ["raft", "consensus"],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      question: "How does SQLite handle WAL checkpointing?",
      answer: "It flushes transactions from the WAL log back into the main DB file.",
      sourceQuote: "Checkpoints transfer committed pages into the original database.",
      sourceOriginUrl: "https://sqlite.org/wal.html",
      documentTitle: "SQLite WAL Guide",
      difficulty: "expert",
      personaUsed: "strict-examiner",
      targetDeck: "Databases",
      tags: ["sqlite", "storage"],
    },
  ];

  it("exports flashcards to an active-recall Markdown document with frontmatter, TOC, and collapsible answers", async () => {
    const result = await exporter.export(mockCards, {
      targetDeck: "Distributed Systems",
      includeToc: true,
      includeCitations: true,
    });

    expect(result.format).toBe("markdown");
    expect(result.successCount).toBe(2);
    expect(typeof result.data).toBe("string");

    const content = result.data as string;

    // YAML Frontmatter check
    expect(content).toContain("title: \"Distributed Systems - Active Recall Study Guide\"");
    expect(content).toContain("deck: \"Distributed Systems\"");
    expect(content).toContain("total_cards: 2");
    expect(content).toContain('- "raft"');
    expect(content).toContain('- "sqlite"');

    // Table of Contents check
    expect(content).toContain('<a id="table-of-contents"></a>\n## 📑 Table of Contents');
    expect(content).toContain("### 📄 Raft Consensus Paper ([Source Link](<https://raft.github.io/raft.pdf>))");
    expect(content).toContain("### 📄 SQLite WAL Guide ([Source Link](<https://sqlite.org/wal.html>))");
    expect(content).toContain("- [#1: What is Raft consensus?](#card-1) `[intermediate]`");
    expect(content).toContain("- [#2: How does SQLite handle WAL checkpointing?](#card-2) `[expert]`");

    // Markdown card elements & Anchors
    expect(content).toContain('<a id="card-1"></a>');
    expect(content).toContain("### Card 1: What is Raft consensus?");
    expect(content).toContain('<a id="card-2"></a>');
    expect(content).toContain("### Card 2: How does SQLite handle WAL checkpointing?");
    expect(content).toContain("[↑ Back to Table of Contents](#table-of-contents)");
    expect(content).toContain("<details>");
    expect(content).toContain("<summary><strong>💡 Reveal Answer</strong></summary>");
    expect(content).toContain("> **Answer:**");
    expect(content).toContain("> [!NOTE]");
    expect(content).toContain("**Source Citation:**");
    expect(content).toContain("Raft is a consensus protocol designed");
    expect(content).toContain("📖 **Reference:** [Raft Consensus Paper](<https://raft.github.io/raft.pdf>)");
  });

  it("escapes square brackets in questions and titles to protect Markdown link syntax", async () => {
    const cardsWithBrackets: Flashcard[] = [
      {
        id: "55555555-5555-5555-5555-555555555555",
        question: "What is Array[number] in TypeScript?",
        answer: "A generic array type for numeric values.",
        sourceQuote: "Generics like [T] parameterize types.",
        sourceOriginUrl: "https://en.wikipedia.org/wiki/Array_(data_structure)",
        documentTitle: "[TypeScript] Language Spec",
        difficulty: "expert",
        personaUsed: "strict-examiner",
        targetDeck: "TypeScript",
        tags: ["ts", "type:array"],
      },
    ];

    const result = await exporter.export(cardsWithBrackets, { includeToc: true, includeCitations: true });
    const content = result.data as string;

    // Escaped brackets check
    expect(content).toContain("- [#1: What is Array\\[number\\] in TypeScript?](#card-1)");
    expect(content).toContain("### 📄 \\[TypeScript\\] Language Spec");
    expect(content).toContain("📖 **Reference:** [\\[TypeScript\\] Language Spec](<https://en.wikipedia.org/wiki/Array_(data_structure)>)");
    expect(content).toContain('- "type:array"');
  });

  it("supports options to omit frontmatter, TOC, badges, or citations", async () => {
    const custom = await exporter.export(mockCards, {
      includeFrontmatter: false,
      includeToc: false,
      includeBadges: false,
      includeCitations: false,
    });

    const content = custom.data as string;
    expect(content.startsWith("---")).toBe(false);
    expect(content).not.toContain("## 📑 Table of Contents");
    expect(content).not.toContain("`🏷️ Tags:");
    expect(content).not.toContain("[!NOTE]");
    expect(content).not.toContain("[↑ Back to Table of Contents]");
  });

  it("writes output directly to file on disk", async () => {
    const tempFile = path.join(os.tmpdir(), `test-deck-${Date.now()}.md`);

    const result = await exporter.export(mockCards, { outputPath: tempFile });

    expect(result.outputPath).toBe(tempFile);
    expect(fs.existsSync(tempFile)).toBe(true);

    const readData = fs.readFileSync(tempFile, "utf8");
    expect(readData).toContain("### Card 1: What is Raft consensus?");

    fs.unlinkSync(tempFile);
  });

  it("handles empty card list gracefully", async () => {
    const empty = await exporter.export([]);
    expect(empty.successCount).toBe(0);
    expect((empty.data as string)).toContain("total_cards: 0");
    expect((empty.data as string)).not.toContain("## 📑 Table of Contents");
  });
});
