import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HtmlStudyGuideExporter } from "../src/export/html-study-guide-exporter.js";
import type { Flashcard } from "@flashcard-master/core";

describe("HtmlStudyGuideExporter", () => {
  const exporter = new HtmlStudyGuideExporter();

  const mockCards: Flashcard[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      question: "What is Raft consensus?",
      answer: "A consensus algorithm for managing replicated state machines.",
      sourceQuote: "Raft is equivalent to Paxos in fault-tolerance and performance.",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Distributed Systems",
      tags: ["raft", "consensus"],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      question: "What is <script>alert(1)</script> testing?",
      answer: "HTML escaping test & validation.",
      sourceQuote: "Special chars <>&\" must be escaped.",
      difficulty: "expert",
      personaUsed: "strict-examiner",
      targetDeck: "Security",
      tags: ["xss"],
    },
  ];

  it("exports flashcards to self-contained HTML5 with two-column layout and print styles", async () => {
    const result = await exporter.export(mockCards, {
      targetDeck: "Distributed Systems",
      includeFoldGuide: true,
    });

    expect(result.format).toBe("html");
    expect(result.successCount).toBe(2);
    expect(typeof result.data).toBe("string");

    const content = result.data as string;

    // Structure checks
    expect(content).toContain("<!DOCTYPE html>");
    expect(content).toContain("Distributed Systems - Printable Study Guide");
    expect(content).toContain("fold-border");
    expect(content).toContain("@media print");
    expect(content).toContain("page-break-inside: avoid");

    // Cards content
    expect(content).toContain("What is Raft consensus?");
    expect(content).toContain("A consensus algorithm for managing replicated state machines.");
    expect(content).toContain("Raft is equivalent to Paxos");

    // HTML Escaping check
    expect(content).not.toContain("<script>alert(1)</script>");
    expect(content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("writes output directly to file on disk", async () => {
    const tempFile = path.join(os.tmpdir(), `test-guide-${Date.now()}.html`);

    const result = await exporter.export(mockCards, { outputPath: tempFile });

    expect(result.outputPath).toBe(tempFile);
    expect(fs.existsSync(tempFile)).toBe(true);

    const readData = fs.readFileSync(tempFile, "utf8");
    expect(readData).toContain("<!DOCTYPE html>");

    fs.unlinkSync(tempFile);
  });

  it("handles empty card array gracefully", async () => {
    const empty = await exporter.export([]);
    expect(empty.successCount).toBe(0);
    expect(empty.data as string).toContain("0 Flashcards");
  });
});
