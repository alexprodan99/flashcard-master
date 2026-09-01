import { describe, it, expect, vi } from "vitest";
import { LlmsTxtIngestionStrategy } from "../src/ingestion/llms-txt-strategy.js";
import type { DataSource } from "@flashcard-master/core";

describe("LlmsTxtIngestionStrategy", () => {
  const dummySource: DataSource = {
    id: "llms-src-123",
    name: "Tech Architecture LLMs Catalog",
    type: "llms-txt",
    uri: "https://example.com/llms-full.txt",
    targetDeck: "DotNet Architecture",
    tags: ["dotnet", "architecture"],
    isActive: true,
  };

  const sampleLlmsTxt = `# Software Engineering: full content catalog

> Every published article and guide on software architecture.

## AI for .NET

- [Building a RAG System in .NET](https://example.com/blog/rag-system-dotnet): Every RAG demo works until you point it at documents.
- [Working with LLMs in .NET](https://example.com/blog/llms-in-dotnet): Semantic Kernel and Microsoft.Extensions.AI.

## Architecture

- [Vertical Slice Architecture](https://example.com/blog/vertical-slice-architecture): Organizing code by features.
- [About Us](https://example.com/about): Background info.
`;

  const sampleArticleHtml = (title: string, body: string) => `<!DOCTYPE html>
<html>
  <head><title>${title}</title></head>
  <body>
    <article>
      <h1>${title}</h1>
      <p>${body}</p>
    </article>
  </body>
</html>`;

  it("parses llms.txt markdown and extracts catalog articles with topic metadata", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com/llms-full.txt") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleLlmsTxt,
        };
      }
      if (url === "https://example.com/blog/rag-system-dotnet") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticleHtml("Building a RAG System in .NET", "RAG combines vector retrieval with generative models."),
        };
      }
      if (url === "https://example.com/blog/llms-in-dotnet") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticleHtml("Working with LLMs in .NET", "Microsoft.Extensions.AI provides unified abstractions."),
        };
      }
      if (url === "https://example.com/blog/vertical-slice-architecture") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticleHtml("Vertical Slice Architecture", "Vertical slices replace technical layers with feature cohesion."),
        };
      }
      return { ok: false, status: 404, text: async () => "Not Found" };
    });

    const strategy = new LlmsTxtIngestionStrategy({
      customFetch: mockFetch as any,
    });

    const docs = await strategy.fetch(dummySource);

    expect(docs).toHaveLength(3);
    expect(docs[0].title).toBe("Building a RAG System in .NET");
    expect(docs[0].originUrl).toBe("https://example.com/blog/rag-system-dotnet");
    expect(docs[0].rawContent).toContain("RAG combines vector retrieval");
    expect(docs[2].title).toBe("Vertical Slice Architecture");
  });

  it("extracts clean reader-mode text and calculates SHA-256 hash", () => {
    const strategy = new LlmsTxtIngestionStrategy();
    const rawDoc = {
      id: "doc-1",
      sourceId: "src-1",
      title: "Vertical Slices",
      rawContent: "<p>Feature <strong>cohesion</strong> is essential.</p>",
      originUrl: "https://example.com/vertical-slices",
    };

    const clean = strategy.extractCleanText(rawDoc);

    expect(clean.textContent).toBe("Feature cohesion is essential.");
    expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(clean.title).toBe("Vertical Slices");
  });

  it("handles network errors and 404s gracefully without throwing", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    const strategy = new LlmsTxtIngestionStrategy({ customFetch: mockFetch as any });

    const docs = await strategy.fetch(dummySource);
    expect(docs).toEqual([]);
  });
});
