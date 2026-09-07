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
      sourceOriginUrl: "https://raft.github.io/raft.pdf",
      documentTitle: "Raft Consensus Paper",
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
      sourceOriginUrl: "https://owasp.org/xss",
      documentTitle: "OWASP XSS Guide",
      difficulty: "expert",
      personaUsed: "strict-examiner",
      targetDeck: "Security",
      tags: ["xss"],
    },
  ];

  it("exports flashcards to self-contained HTML5 with two-column layout, interactive TOC, and print styles", async () => {
    const result = await exporter.export(mockCards, {
      targetDeck: "Distributed Systems",
      includeFoldGuide: true,
      includeToc: true,
      includeCitations: true,
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

    // Table of Contents checks
    expect(content).toContain('id="toc" class="table-of-contents no-print"');
    expect(content).toContain("<h2>📑 Table of Contents</h2>");
    expect(content).toContain('href="#card-1"');
    expect(content).toContain('href="#card-2"');
    expect(content).toContain("Raft Consensus Paper");
    expect(content).toContain("OWASP XSS Guide");
    expect(content).toContain('href="https://raft.github.io/raft.pdf"');

    // Cards content & Anchors
    expect(content).toContain('id="card-1" class="card-row"');
    expect(content).toContain('id="card-2" class="card-row"');
    expect(content).toContain('href="#toc" class="back-to-top no-print"');
    expect(content).toContain("What is Raft consensus?");
    expect(content).toContain("A consensus algorithm for managing replicated state machines.");
    expect(content).toContain("Raft is equivalent to Paxos");

    // Clickable citation link checks
    expect(content).toContain('class="citation-link"');
    expect(content).toContain('href="https://raft.github.io/raft.pdf"');
    expect(content).toContain("Raft Consensus Paper ↗");

    // HTML Escaping check
    expect(content).not.toContain("<script>alert(1)</script>");
    expect(content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("supports omitting Table of Contents and back-to-top links when includeToc is false", async () => {
    const result = await exporter.export(mockCards, {
      includeToc: false,
    });

    const content = result.data as string;
    expect(content).not.toContain('class="table-of-contents');
    expect(content).not.toContain("📑 Table of Contents");
    expect(content).not.toContain('class="back-to-top');
    expect(content).toContain('id="card-1"');
  });

  it("renders origin references even if sourceQuote is omitted or whitespace", async () => {
    const cardsWithoutQuote: Flashcard[] = [
      {
        id: "33333333-3333-3333-3333-333333333333",
        question: "What is B-tree indexing?",
        answer: "A self-balancing search tree data structure.",
        sourceQuote: "   ",
        sourceOriginUrl: "https://en.wikipedia.org/wiki/B-tree",
        documentTitle: "B-Tree Overview",
        difficulty: "beginner",
        personaUsed: "socratic-mentor",
        targetDeck: "Databases",
        tags: ["db"],
      },
    ];

    const result = await exporter.export(cardsWithoutQuote, { includeCitations: true });
    const content = result.data as string;

    expect(content).toContain("B-Tree Overview ↗");
    expect(content).toContain('href="https://en.wikipedia.org/wiki/B-tree"');
    expect(content).not.toContain("Source Quote:");
  });

  it("sanitizes unsafe URI schemes in links", async () => {
    const cardsWithMaliciousUrl: Flashcard[] = [
      {
        id: "44444444-4444-4444-4444-444444444444",
        question: "Malicious card question?",
        answer: "Safe answer.",
        sourceQuote: "Safe quote.",
        sourceOriginUrl: "javascript:alert('pwned')",
        documentTitle: "Malicious Title",
        difficulty: "intermediate",
        personaUsed: "strict-examiner",
        targetDeck: "Security",
        tags: ["sec"],
      },
    ];

    const result = await exporter.export(cardsWithMaliciousUrl);
    const content = result.data as string;

    expect(content).not.toContain('href="javascript:');
    expect(content).toContain("Malicious Title");
  });

  it("supports omitting citations when includeCitations is false", async () => {
    const result = await exporter.export(mockCards, {
      includeCitations: false,
    });

    const content = result.data as string;
    expect(content).not.toContain("Source Quote:");
    expect(content).not.toContain("class=\"citation\"");
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
    expect(empty.data as string).not.toContain('class="table-of-contents');
  });
});
