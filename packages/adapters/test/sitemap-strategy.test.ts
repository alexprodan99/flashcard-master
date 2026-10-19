import { describe, it, expect, vi } from "vitest";
import { SitemapIngestionStrategy } from "../src/ingestion/sitemap-strategy.js";
import type { DataSource } from "@flashcard-master/core";

describe("SitemapIngestionStrategy", () => {
  const dummySource: DataSource = {
    id: "sitemap-src-123",
    name: "Tech Blog Sitemap",
    type: "sitemap",
    uri: "https://example.com/sitemap.xml",
    tags: ["tech", "architecture"],
    isActive: true,
  };

  const sampleUrlsetXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/blog/article-1</loc>
    <lastmod>2026-08-30T00:00:00Z</lastmod>
  </url>
  <url>
    <loc>https://example.com/blog/article-2</loc>
    <lastmod>2026-08-31T00:00:00Z</lastmod>
  </url>
  <url>
    <loc>https://example.com/assets/logo.png</loc>
  </url>
</urlset>`;

  const sampleSitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-sub1.xml</loc>
    <lastmod>2026-08-31T00:00:00Z</lastmod>
  </sitemap>
</sitemapindex>`;

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

  it("parses standard urlset sitemap and fetches all filtered article pages", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com/sitemap.xml") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleUrlsetXml,
        };
      }
      if (url === "https://example.com/blog/article-1") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticleHtml("Article 1", "Clean Architecture is an architectural pattern."),
        };
      }
      if (url === "https://example.com/blog/article-2") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticleHtml("Article 2", "Temporal tables maintain full version history."),
        };
      }
      return { ok: false, status: 404, text: async () => "Not Found" };
    });

    const strategy = new SitemapIngestionStrategy({
      customFetch: mockFetch as any,
      concurrency: 2,
    });

    const docs = await strategy.fetch(dummySource);

    expect(docs).toHaveLength(2);
    expect(docs[0].title).toBe("Article 1");
    expect(docs[0].originUrl).toBe("https://example.com/blog/article-1");
    expect(docs[0].rawContent).toContain("Clean Architecture");
    expect(docs[1].title).toBe("Article 2");
    expect(docs[1].originUrl).toBe("https://example.com/blog/article-2");
    expect(docs[1].rawContent).toContain("Temporal tables");
  });

  it("recursively resolves sitemap index files", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://example.com/sitemap.xml") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleSitemapIndexXml,
        };
      }
      if (url === "https://example.com/sitemap-sub1.xml") {
        return {
          ok: true,
          status: 200,
          text: async () => sampleUrlsetXml,
        };
      }
      if (url.startsWith("https://example.com/blog/")) {
        return {
          ok: true,
          status: 200,
          text: async () => sampleArticleHtml("Sub Article", "Deep dive into .NET microservices."),
        };
      }
      return { ok: false, status: 404, text: async () => "Not Found" };
    });

    const strategy = new SitemapIngestionStrategy({
      customFetch: mockFetch as any,
    });

    const docs = await strategy.fetch(dummySource);
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs[0].rawContent).toContain("Deep dive into .NET microservices");
  });

  it("extracts clean reader-mode text and calculates SHA-256 hash", () => {
    const strategy = new SitemapIngestionStrategy();
    const rawDoc = {
      id: "doc-1",
      sourceId: "src-1",
      title: "Clean Code",
      rawContent: "<p>Readability &amp; Maintainability <strong>matter</strong>.</p>",
      originUrl: "https://example.com/clean-code",
    };

    const clean = strategy.extractCleanText(rawDoc);

    expect(clean.textContent).toBe("Readability & Maintainability matter.");
    expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(clean.title).toBe("Clean Code");
  });

  it("handles network failures and 404s gracefully without crashing", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const strategy = new SitemapIngestionStrategy({ customFetch: mockFetch as any });

    const docs = await strategy.fetch(dummySource);
    expect(docs).toEqual([]);
  });
});
