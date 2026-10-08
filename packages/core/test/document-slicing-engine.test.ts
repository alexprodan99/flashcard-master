import { describe, it, expect } from "vitest";
import { DocumentSlicingEngine } from "../src/services/document-slicing-engine.js";

describe("DocumentSlicingEngine", () => {
  const engine = new DocumentSlicingEngine();

  describe("Page Budget Mode (mode: 'budget')", () => {
    it("slices 12-page PDF text with <!-- page: N --> markers and pagesPerChunk: 5 into 3 discrete subdocuments", () => {
      const pageTexts: string[] = [];
      for (let i = 1; i <= 12; i++) {
        pageTexts.push(`<!-- page: ${i} -->\n\nContent for page ${i} with some informative academic words.`);
      }
      const fullText = pageTexts.join("\n\n");

      const subdocs = engine.slice(
        {
          sourceId: "src-pdf",
          title: "Calculus",
          textContent: fullText,
          originUrl: "file:///docs/Calculus.pdf",
        },
        {
          mode: "budget",
          pagesPerChunk: 5,
        }
      );

      expect(subdocs.length).toBe(3);

      // Subdocument 1: Pages 1-5
      expect(subdocs[0].title).toBe("Calculus - Pages 1-5");
      expect(subdocs[0].startPage).toBe(1);
      expect(subdocs[0].endPage).toBe(5);
      expect(subdocs[0].url).toBe("file:///docs/Calculus.pdf#page=1-5");
      expect(subdocs[0].textContent).toContain("Content for page 1");
      expect(subdocs[0].textContent).toContain("Content for page 5");
      expect(subdocs[0].wordCount).toBeGreaterThan(0);
      expect(subdocs[0].id).toHaveLength(32);

      // Subdocument 2: Pages 6-10
      expect(subdocs[1].title).toBe("Calculus - Pages 6-10");
      expect(subdocs[1].startPage).toBe(6);
      expect(subdocs[1].endPage).toBe(10);
      expect(subdocs[1].url).toBe("file:///docs/Calculus.pdf#page=6-10");
      expect(subdocs[1].textContent).toContain("Content for page 6");
      expect(subdocs[1].textContent).toContain("Content for page 10");

      // Subdocument 3: Pages 11-12
      expect(subdocs[2].title).toBe("Calculus - Pages 11-12");
      expect(subdocs[2].startPage).toBe(11);
      expect(subdocs[2].endPage).toBe(12);
      expect(subdocs[2].url).toBe("file:///docs/Calculus.pdf#page=11-12");
      expect(subdocs[2].textContent).toContain("Content for page 11");
      expect(subdocs[2].textContent).toContain("Content for page 12");
    });

    it("slices single-page chunk with singular title", () => {
      const fullText = "<!-- page: 1 -->\n\nSingle page content.";

      const subdocs = engine.slice(
        {
          sourceId: "src-1",
          title: "Syllabus",
          textContent: fullText,
          originUrl: "file:///docs/syllabus.pdf",
        },
        { mode: "budget", pagesPerChunk: 5 }
      );

      expect(subdocs.length).toBe(1);
      expect(subdocs[0].title).toBe("Syllabus - Page 1");
      expect(subdocs[0].startPage).toBe(1);
      expect(subdocs[0].endPage).toBe(1);
      expect(subdocs[0].url).toBe("file:///docs/syllabus.pdf#page=1");
    });

    it("strips page comments when calculating word counts", () => {
      const text = "<!-- page: 1 -->\n\nOne two three four five.";
      const subdocs = engine.slice(
        {
          sourceId: "src-wc",
          title: "Test",
          textContent: text,
        },
        { mode: "budget", pagesPerChunk: 5 }
      );

      expect(subdocs.length).toBe(1);
      expect(subdocs[0].wordCount).toBe(5);
    });

    it("slices pageless text by word budget into Part N subdocuments", () => {
      const words = Array.from({ length: 3500 }, (_, i) => `word${i + 1}`).join(" ");

      const subdocs = engine.slice(
        {
          sourceId: "src-txt",
          title: "Notes",
          textContent: words,
          originUrl: "file:///docs/notes.txt",
        },
        {
          mode: "budget",
          wordsPerChunk: 1500,
        }
      );

      expect(subdocs.length).toBe(3);
      expect(subdocs[0].title).toBe("Notes - Part 1");
      expect(subdocs[0].url).toBe("file:///docs/notes.txt#part=1");
      expect(subdocs[0].startPage).toBeNull();
      expect(subdocs[0].endPage).toBeNull();
      expect(subdocs[0].wordCount).toBe(1500);

      expect(subdocs[1].title).toBe("Notes - Part 2");
      expect(subdocs[1].url).toBe("file:///docs/notes.txt#part=2");
      expect(subdocs[1].wordCount).toBe(1500);

      expect(subdocs[2].title).toBe("Notes - Part 3");
      expect(subdocs[2].url).toBe("file:///docs/notes.txt#part=3");
      expect(subdocs[2].wordCount).toBe(500);
    });
  });

  describe("Semantic Outline Mode (mode: 'outline')", () => {
    it("slices Markdown headings into subdocuments with hierarchical titles and page coordinates", () => {
      const markdown = `
<!-- page: 1 -->
# Chapter 1: Foundations
Foundational introduction text on page 1.

<!-- page: 2 -->
## Section 1.1: Background
Detailed background information on page 2.

<!-- page: 3 -->
# Chapter 2: Implementation
Implementation instructions spanning page 3.
<!-- page: 4 -->
Continuing implementation details on page 4.
      `.trim();

      const subdocs = engine.slice(
        {
          sourceId: "src-outline",
          title: "Architecture Guide",
          textContent: markdown,
          originUrl: "https://example.com/guide.md",
        },
        { mode: "outline" }
      );

      expect(subdocs.length).toBe(3);

      expect(subdocs[0].title).toBe("Architecture Guide - Chapter 1: Foundations");
      expect(subdocs[0].startPage).toBe(1);
      expect(subdocs[0].endPage).toBe(1);
      expect(subdocs[0].url).toBe("https://example.com/guide.md#section=Chapter%201%3A%20Foundations&page=1");
      expect(subdocs[0].textContent).toContain("Foundational introduction text");

      expect(subdocs[1].title).toBe("Architecture Guide - Section 1.1: Background");
      expect(subdocs[1].startPage).toBe(2);
      expect(subdocs[1].endPage).toBe(2);
      expect(subdocs[1].url).toBe("https://example.com/guide.md#section=Section%201.1%3A%20Background&page=2");
      expect(subdocs[1].textContent).toContain("Detailed background information");

      expect(subdocs[2].title).toBe("Architecture Guide - Chapter 2: Implementation");
      expect(subdocs[2].startPage).toBe(3);
      expect(subdocs[2].endPage).toBe(4);
      expect(subdocs[2].url).toBe("https://example.com/guide.md#section=Chapter%202%3A%20Implementation&page=3");
      expect(subdocs[2].textContent).toContain("Implementation instructions");
    });

    it("merges sections smaller than minChunkWords with adjacent section", () => {
      const markdown = `
# Section 1
Short.

# Section 2
This section has enough words to be substantial and fulfill the minimum chunk threshold.
      `.trim();

      const subdocs = engine.slice(
        {
          sourceId: "src-merge",
          title: "Manual",
          textContent: markdown,
        },
        { mode: "outline", minChunkWords: 10 }
      );

      // Section 1 has 1 word (< 10), so it merges with Section 2
      expect(subdocs.length).toBe(1);
      expect(subdocs[0].textContent).toContain("Short.");
      expect(subdocs[0].textContent).toContain("This section has enough words");
    });

    it("falls back gracefully to Page Budget mode when outline mode finds zero headings", () => {
      const textWithPages = `
<!-- page: 1 -->
Page 1 text without any markdown headings.
<!-- page: 2 -->
Page 2 text also without headings.
      `.trim();

      const subdocs = engine.slice(
        {
          sourceId: "src-fallback",
          title: "Scanned Book",
          textContent: textWithPages,
          originUrl: "file:///book.pdf",
        },
        { mode: "outline", pagesPerChunk: 1 }
      );

      expect(subdocs.length).toBe(2);
      expect(subdocs[0].title).toBe("Scanned Book - Page 1");
      expect(subdocs[0].startPage).toBe(1);
      expect(subdocs[1].title).toBe("Scanned Book - Page 2");
      expect(subdocs[1].startPage).toBe(2);
    });

    it("falls back gracefully to Word Budget mode when outline mode finds zero headings and no page markers", () => {
      const pagelessText = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");

      const subdocs = engine.slice(
        {
          sourceId: "src-fallback-txt",
          title: "Document",
          textContent: pagelessText,
        },
        { mode: "outline", wordsPerChunk: 1500 }
      );

      expect(subdocs.length).toBe(2);
      expect(subdocs[0].title).toBe("Document - Part 1");
      expect(subdocs[1].title).toBe("Document - Part 2");
    });
  });

  describe("Full Document Mode (mode: 'none' or unconfigured)", () => {
    it("returns single subdocument with total startPage and endPage if page markers exist", () => {
      const text = "<!-- page: 1 -->\n\nIntro\n\n<!-- page: 8 -->\n\nOutro";

      const subdocs = engine.slice(
        {
          sourceId: "src-full",
          title: "Complete Book",
          textContent: text,
          originUrl: "file:///book.pdf",
        },
        { mode: "none" }
      );

      expect(subdocs.length).toBe(1);
      expect(subdocs[0].title).toBe("Complete Book");
      expect(subdocs[0].startPage).toBe(1);
      expect(subdocs[0].endPage).toBe(8);
      expect(subdocs[0].url).toBe("file:///book.pdf");
    });

    it("returns single subdocument without page markers if document is pageless", () => {
      const text = "Just a short plain text document.";

      const subdocs = engine.slice({
        sourceId: "src-plain",
        title: "Short Read",
        textContent: text,
      });

      expect(subdocs.length).toBe(1);
      expect(subdocs[0].title).toBe("Short Read");
      expect(subdocs[0].startPage).toBeNull();
      expect(subdocs[0].endPage).toBeNull();
      expect(subdocs[0].wordCount).toBe(6);
    });

    it("returns empty array for empty or whitespace text", () => {
      expect(engine.slice({ sourceId: "src", title: "Empty", textContent: "" })).toEqual([]);
      expect(engine.slice({ sourceId: "src", title: "Spaces", textContent: "   \n\n  " })).toEqual([]);
    });
  });
});
