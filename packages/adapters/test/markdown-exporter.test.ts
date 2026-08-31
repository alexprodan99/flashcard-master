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
      difficulty: "expert",
      personaUsed: "strict-examiner",
      targetDeck: "Databases",
      tags: ["sqlite", "storage"],
    },
  ];

  it("exports flashcards to an active-recall Markdown document with frontmatter and collapsible answers", async () => {
    const result = await exporter.export(mockCards, {
      targetDeck: "Distributed Systems",
    });

    expect(result.format).toBe("markdown");
    expect(result.successCount).toBe(2);
    expect(typeof result.data).toBe("string");

    const content = result.data as string;

    // YAML Frontmatter check
    expect(content).toContain("title: \"Distributed Systems - Active Recall Study Guide\"");
    expect(content).toContain("deck: \"Distributed Systems\"");
    expect(content).toContain("total_cards: 2");
    expect(content).toContain("- raft");
    expect(content).toContain("- sqlite");

    // Markdown elements
    expect(content).toContain("### Card 1: What is Raft consensus?");
    expect(content).toContain("<details>");
    expect(content).toContain("<summary><strong>💡 Reveal Answer</strong></summary>");
    expect(content).toContain("> **Answer:**");
    expect(content).toContain("> [!NOTE]");
    expect(content).toContain("**Source Citation:**");
    expect(content).toContain("Raft is a consensus protocol designed");
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

  it("supports options to omit frontmatter, badges, or citations", async () => {
    const custom = await exporter.export(mockCards, {
      includeFrontmatter: false,
      includeBadges: false,
      includeCitations: false,
    });

    const content = custom.data as string;
    expect(content.startsWith("---")).toBe(false);
    expect(content).not.toContain("`🏷️ Tags:");
    expect(content).not.toContain("[!NOTE]");
  });

  it("handles empty card list gracefully", async () => {
    const empty = await exporter.export([]);
    expect(empty.successCount).toBe(0);
    expect((empty.data as string)).toContain("total_cards: 0");
  });
});
