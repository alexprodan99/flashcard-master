import { describe, it, expect } from "vitest";
import { WebReaderStrategy } from "../src/ingestion/web-reader-strategy.js";
import type { DataSource, RawDocument } from "@flashcard-master/core";

const SAMPLE_HTML_ARTICLE = `<!DOCTYPE html>
<html>
<head>
  <title>Understanding Memory Hierarchy in Modern CPUs</title>
</head>
<body>
  <header>
    <nav><a href="/">Home</a> | <a href="/about">About</a></nav>
    <div class="ad-banner">Buy our course!</div>
  </header>
  <main>
    <article>
      <h1>Understanding Memory Hierarchy in Modern CPUs</h1>
      <p class="byline">By Jane Doe</p>
      <p>L1, L2, and L3 caches provide progressively higher capacity at the cost of increased access latency.</p>
      <p>L1 cache access typically takes 4 CPU cycles, whereas main memory requires over 200 cycles.</p>
    </article>
  </main>
  <aside class="sidebar">
    <h3>Trending Posts</h3>
    <ul><li>Post 1</li><li>Post 2</li></ul>
  </aside>
  <footer>
    <p>Copyright 2026 Tech Press</p>
  </footer>
</body>
</html>`;

const SAMPLE_SIMPLE_PAGE = `<!DOCTYPE html>
<html>
<head><title>Simple Readme</title></head>
<body>
  <p>This is a raw documentation page without formal article markup.</p>
</body>
</html>`;

describe("WebReaderStrategy", () => {
  const strategy = new WebReaderStrategy();

  it("extracts clean article title and body while stripping headers, nav, ads, and footers", () => {
    const doc = strategy.parseHtml(SAMPLE_HTML_ARTICLE, "source-uuid-1", "https://example.com/cpu-memory");

    expect(doc).toBeDefined();
    expect(doc?.title).toBe("Understanding Memory Hierarchy in Modern CPUs");
    expect(doc?.originUrl).toBe("https://example.com/cpu-memory");
    expect(doc?.rawContent).toContain("L1, L2, and L3 caches provide progressively higher capacity");
    expect(doc?.rawContent).not.toContain("Buy our course!");
    expect(doc?.rawContent).not.toContain("Trending Posts");
  });

  it("falls back gracefully on simple non-article HTML pages", () => {
    const doc = strategy.parseHtml(SAMPLE_SIMPLE_PAGE, "source-uuid-2", "https://example.com/readme");

    expect(doc).toBeDefined();
    expect(doc?.title).toBe("Simple Readme");
    expect(doc?.rawContent).toContain("This is a raw documentation page");
  });

  it("extracts clean text without HTML tags and generates sha256 contentHash", () => {
    const raw: RawDocument = {
      id: "doc-web-1",
      sourceId: "source-web-1",
      title: "Clean Web Test",
      rawContent: "<div><p>Memory latency is <b>critical</b> for database throughput.</p></div>",
    };

    const clean = strategy.extractCleanText(raw);

    expect(clean.id).toBe("doc-web-1");
    expect(clean.textContent).toBe("Memory latency is critical for database throughput.");
    expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles HTTP errors and network timeouts gracefully", async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }) as any;

    const customStrategy = new WebReaderStrategy({ customFetch: mockFetch });
    const dummySource: DataSource = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Broken Web URL",
      type: "web",
      uri: "https://example.com/500",
      targetDeck: "Default",
      tags: [],
      isActive: true,
    };

    const results = await customStrategy.fetch(dummySource);
    expect(results).toEqual([]);
  });
});
