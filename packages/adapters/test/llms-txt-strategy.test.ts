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

  describe("Media Asset Localization & WebP Optimization", () => {
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("downloads and localizes article images, optimizing them to WebP format", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-llms-media-"));

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === "https://example.com/llms-full.txt") {
          return {
            ok: true,
            status: 200,
            text: async () => `# Catalog\n\n- [Architecture Guide](https://example.com/blog/arch): Deep dive.`,
          };
        }
        if (url === "https://example.com/blog/arch") {
          return {
            ok: true,
            status: 200,
            text: async () => `<!DOCTYPE html><html><head><title>Architecture Guide</title></head><body><article><h1>Architecture Guide</h1><img src="/assets/diagram.png" alt="System Flow" /></article></body></html>`,
          };
        }
        if (url === "https://example.com/assets/diagram.png") {
          return new Response(validPngBuffer, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        return { ok: false, status: 404, text: async () => "Not Found" };
      });

      const mediaService = new MediaService({
        mediaDir: tempDir,
        customFetch: mockFetch as any,
      });

      const strategy = new LlmsTxtIngestionStrategy({
        customFetch: mockFetch as any,
        mediaService,
      });

      try {
        const docs = await strategy.fetch(dummySource);
        expect(docs).toHaveLength(1);
        expect(docs[0].rawContent).toContain("/api/media/");

        const cleanDoc = strategy.extractCleanText(docs[0]);
        expect(cleanDoc.textContent).toMatch(/!\[System Flow\]\(\/api\/media\/[a-f0-9]{32}\.webp\)/);

        const files = fs.readdirSync(tempDir);
        expect(files).toHaveLength(1);
        expect(files[0].endsWith(".webp")).toBe(true);
      } finally {
        if (fs.existsSync(tempDir)) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
          } catch {}
        }
      }
    });

    it("falls back safely to raw buffer when image buffer is corrupted", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-llms-corrupt-"));
      const corruptedBytes = Buffer.from("corrupted-not-an-image-data");

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === "https://example.com/llms-full.txt") {
          return {
            ok: true,
            status: 200,
            text: async () => `# Catalog\n\n- [Corrupt Image Article](https://example.com/blog/corrupt): Info.`,
          };
        }
        if (url === "https://example.com/blog/corrupt") {
          return {
            ok: true,
            status: 200,
            text: async () => `<!DOCTYPE html><html><head><title>Corrupt Image Article</title></head><body><article><h1>Article</h1><img src="/corrupted.png" alt="Corrupt" /></article></body></html>`,
          };
        }
        if (url === "https://example.com/corrupted.png") {
          return new Response(corruptedBytes, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        return { ok: false, status: 404, text: async () => "Not Found" };
      });

      const mediaService = new MediaService({
        mediaDir: tempDir,
        customFetch: mockFetch as any,
      });

      const strategy = new LlmsTxtIngestionStrategy({
        customFetch: mockFetch as any,
        mediaService,
      });

      try {
        const docs = await strategy.fetch(dummySource);
        expect(docs).toHaveLength(1);
        const cleanDoc = strategy.extractCleanText(docs[0]);
        expect(cleanDoc.textContent).toMatch(/!\[Corrupt\]\(\/api\/media\/[a-f0-9]{32}\.png\)/);

        const files = fs.readdirSync(tempDir);
        expect(files).toHaveLength(1);
        expect(files[0].endsWith(".png")).toBe(true);
      } finally {
        if (fs.existsSync(tempDir)) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
          } catch {}
        }
      }
    });

    it("degrades gracefully to resolved URL when image download fails", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-llms-media-fail-"));

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === "https://example.com/llms-full.txt") {
          return {
            ok: true,
            status: 200,
            text: async () => `# Catalog\n\n- [Faulty Article](https://example.com/blog/faulty): Info.`,
          };
        }
        if (url === "https://example.com/blog/faulty") {
          return {
            ok: true,
            status: 200,
            text: async () => `<!DOCTYPE html><html><head><title>Faulty Article</title></head><body><article><h1>Faulty Article</h1><img src="/broken/photo.jpg" alt="Missing Photo" /></article></body></html>`,
          };
        }
        return { ok: false, status: 404, text: async () => "Not Found" };
      });

      const mediaService = new MediaService({
        mediaDir: tempDir,
        customFetch: mockFetch as any,
      });

      const strategy = new LlmsTxtIngestionStrategy({
        customFetch: mockFetch as any,
        mediaService,
      });

      try {
        const docs = await strategy.fetch(dummySource);
        expect(docs).toHaveLength(1);

        const cleanDoc = strategy.extractCleanText(docs[0]);
        expect(cleanDoc.textContent).toContain("![Missing Photo](https://example.com/broken/photo.jpg)");
      } finally {
        if (fs.existsSync(tempDir)) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
          } catch {}
        }
      }
    });
  });
});


