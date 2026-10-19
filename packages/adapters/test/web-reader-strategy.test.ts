import { describe, it, expect } from "vitest";
import { WebReaderStrategy, parseSourceUrls } from "../src/ingestion/web-reader-strategy.js";
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
    expect(clean.rawContent).toBe(raw.rawContent);
    expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves paragraph breaks, headings, lists, and code blocks from HTML article content", () => {
    const rawHtml = `
      <article>
        <h1>Database Indexes</h1>
        <p>B-Trees provide O(log n) lookup, insertion, and deletion guarantees.</p>
        <h2>LSM Trees</h2>
        <p>Log-Structured Merge-trees optimize for high write throughput by appending to an in-memory memtable.</p>
        <pre><code>CREATE INDEX idx_user_email ON users(email);</code></pre>
        <ul>
          <li>Clustered indexes determine physical table order.</li>
          <li>Secondary indexes contain index keys and row pointers.</li>
        </ul>
      </article>
    `;

    const raw: RawDocument = {
      id: "doc-web-2",
      sourceId: "source-web-2",
      title: "Database Indexes",
      rawContent: rawHtml,
    };

    const clean = strategy.extractCleanText(raw);

    expect(clean.rawContent).toBe(rawHtml);
    expect(clean.textContent).toContain("# Database Indexes\n\nB-Trees provide O(log n) lookup, insertion, and deletion guarantees.");
    expect(clean.textContent).toContain("## LSM Trees\n\nLog-Structured Merge-trees optimize for high write throughput");
    expect(clean.textContent).toContain("```\nCREATE INDEX idx_user_email ON users(email);\n```");
    expect(clean.textContent).toContain("- Clustered indexes determine physical table order.\n- Secondary indexes contain index keys and row pointers.");
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
      tags: [],
      isActive: true,
    };

    const results = await customStrategy.fetch(dummySource);
    expect(results).toEqual([]);
  });

  describe("parseSourceUrls", () => {
    it("parses single URL strings", () => {
      const urls = parseSourceUrls("https://example.com/single");
      expect(urls).toEqual(["https://example.com/single"]);
    });

    it("parses JSON array strings", () => {
      const input = JSON.stringify(["https://example.com/p1", "https://example.com/p2"]);
      const urls = parseSourceUrls(input);
      expect(urls).toEqual(["https://example.com/p1", "https://example.com/p2"]);
    });

    it("parses newline and comma separated URLs", () => {
      const input = "https://example.com/line1\nhttps://example.com/line2,https://example.com/line3";
      const urls = parseSourceUrls(input);
      expect(urls).toEqual([
        "https://example.com/line1",
        "https://example.com/line2",
        "https://example.com/line3",
      ]);
    });

    it("filters out invalid/non-HTTP URLs and empty strings", () => {
      const input = JSON.stringify(["not-a-url", "ftp://example.com/file", "https://valid.com/page", "   "]);
      const urls = parseSourceUrls(input);
      expect(urls).toEqual(["https://valid.com/page"]);
    });

    it("deduplicates identical URLs", () => {
      const input = JSON.stringify(["https://example.com/p1", "https://example.com/p1", "https://example.com/p2"]);
      const urls = parseSourceUrls(input);
      expect(urls).toEqual(["https://example.com/p1", "https://example.com/p2"]);
    });

    it("preserves commas inside URL query parameters", () => {
      const input = "https://example.com/search?tags=a,b&filter=true\nhttps://example.com/page2";
      const urls = parseSourceUrls(input);
      expect(urls).toEqual([
        "https://example.com/search?tags=a,b&filter=true",
        "https://example.com/page2",
      ]);
    });

    it("handles unquoted bracket list fallback", () => {
      const input = "[https://example.com/1\nhttps://example.com/2]";
      const urls = parseSourceUrls(input);
      expect(urls).toEqual(["https://example.com/1", "https://example.com/2"]);
    });

    it("returns empty array for whitespace or empty strings", () => {
      expect(parseSourceUrls("   ")).toEqual([]);
      expect(parseSourceUrls("")).toEqual([]);
    });
  });

  describe("Multi-URL Concurrent Ingestion", () => {
    it("fetches multiple URLs in parallel and returns RawDocuments with deterministic IDs", async () => {
      const mockFetch = async (url: string) => {
        return {
          ok: true,
          status: 200,
          text: async () => `<!DOCTYPE html><html><head><title>Title for ${url}</title></head><body><article><p>Content for ${url}</p></article></body></html>`,
        } as any;
      };

      const customStrategy = new WebReaderStrategy({ customFetch: mockFetch as any, concurrency: 2 });
      const source: DataSource = {
        id: "source-multi-123",
        name: "Multi Source",
        type: "web",
        uri: JSON.stringify(["https://example.com/1", "https://example.com/2", "https://example.com/3"]),
        tags: [],
        isActive: true,
      };

      const docs = await customStrategy.fetch(source);
      expect(docs).toHaveLength(3);
      expect(docs[0].originUrl).toBe("https://example.com/1");
      expect(docs[0].title).toBe("Title for https://example.com/1");
      expect(docs[1].originUrl).toBe("https://example.com/2");
      expect(docs[2].originUrl).toBe("https://example.com/3");
    });

    it("isolates errors so a 500 error on one URL does not drop successful siblings", async () => {
      const mockFetch = async (url: string) => {
        if (url.includes("fail")) {
          return {
            ok: false,
            status: 500,
            text: async () => "Internal Error",
          } as any;
        }
        return {
          ok: true,
          status: 200,
          text: async () => `<!DOCTYPE html><html><head><title>Success Doc</title></head><body><article><p>Valid content</p></article></body></html>`,
        } as any;
      };

      const customStrategy = new WebReaderStrategy({ customFetch: mockFetch as any });
      const source: DataSource = {
        id: "source-error-iso",
        name: "Resilient Multi Source",
        type: "web",
        uri: JSON.stringify(["https://example.com/fail", "https://example.com/ok"]),
        tags: [],
        isActive: true,
      };

      const docs = await customStrategy.fetch(source);
      expect(docs).toHaveLength(1);
      expect(docs[0].originUrl).toBe("https://example.com/ok");
      expect(docs[0].title).toBe("Success Doc");
    });

    it("respects bounded concurrency limits", async () => {
      let activeRequests = 0;
      let maxSimultaneousRequests = 0;

      const mockFetch = async (url: string) => {
        activeRequests++;
        maxSimultaneousRequests = Math.max(maxSimultaneousRequests, activeRequests);
        await new Promise((r) => setTimeout(r, 20));
        activeRequests--;
        return {
          ok: true,
          status: 200,
          text: async () => `<!DOCTYPE html><html><head><title>Doc</title></head><body><p>Text</p></body></html>`,
        } as any;
      };

      const customStrategy = new WebReaderStrategy({ customFetch: mockFetch as any, concurrency: 2 });
      const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/page-${i}`);
      const source: DataSource = {
        id: "source-concurrency-test",
        name: "Concurrency Test",
        type: "web",
        uri: JSON.stringify(urls),
        tags: [],
        isActive: true,
      };

      const docs = await customStrategy.fetch(source);
      expect(docs).toHaveLength(6);
      expect(maxSimultaneousRequests).toBeLessThanOrEqual(2);
    });
  });

  describe("Media Asset Localization", () => {
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    it("downloads and localizes article images with WebP optimization and replaces them with /api/media/<hash>.webp", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-web-media-"));

      const mockFetch = async (url: string | URL | Request) => {
        const u = url.toString();
        if (u === "https://example.com/article") {
          return new Response(
            `<!DOCTYPE html>
            <html>
              <head><title>Distributed Systems Architecture</title></head>
              <body>
                <article>
                  <h1>Distributed Systems Architecture</h1>
                  <p>Here is the replication scheme:</p>
                  <img src="/images/raft.png" alt="Raft Architecture" />
                </article>
              </body>
            </html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
        if (u === "https://example.com/images/raft.png") {
          return new Response(validPngBuffer, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        return new Response("Not Found", { status: 404 });
      };

      const mediaService = new MediaService({
        mediaDir: tempDir,
        customFetch: mockFetch as any,
      });

      const strategy = new WebReaderStrategy({
        customFetch: mockFetch as any,
        mediaService,
      });

      const source: DataSource = {
        id: "source-media-test",
        name: "Media Source",
        type: "web",
        uri: "https://example.com/article",
        tags: [],
        isActive: true,
      };

      try {
        const docs = await strategy.fetch(source);
        expect(docs).toHaveLength(1);
        expect(docs[0].rawContent).toContain("/api/media/");

        const cleanDoc = strategy.extractCleanText(docs[0]);
        expect(cleanDoc.textContent).toMatch(/!\[Raft Architecture\]\(\/api\/media\/[a-f0-9]{32}\.webp\)/);

        // Verify image was saved to mediaDir as .webp
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

    it("falls back to saving raw buffer when image binary is corrupted", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-web-media-corrupt-"));
      const corruptPayload = Buffer.from("corrupted-not-an-image-data");

      const mockFetch = async (url: string | URL | Request) => {
        const u = url.toString();
        if (u === "https://example.com/article") {
          return new Response(
            `<!DOCTYPE html>
            <html>
              <head><title>Corrupted Image Article</title></head>
              <body>
                <article>
                  <h1>Corrupted Image Article</h1>
                  <img src="/images/corrupted.png" alt="Corrupt" />
                </article>
              </body>
            </html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
        if (u === "https://example.com/images/corrupted.png") {
          return new Response(corruptPayload, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        return new Response("Not Found", { status: 404 });
      };

      const mediaService = new MediaService({
        mediaDir: tempDir,
        customFetch: mockFetch as any,
      });

      const strategy = new WebReaderStrategy({
        customFetch: mockFetch as any,
        mediaService,
      });

      const source: DataSource = {
        id: "source-corrupt-test",
        name: "Corrupt Source",
        type: "web",
        uri: "https://example.com/article",
        tags: [],
        isActive: true,
      };

      try {
        const docs = await strategy.fetch(source);
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

    it("degrades gracefully to resolved remote URL when image download fails", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-web-media-fail-"));

      const mockFetch = async (url: string | URL | Request) => {
        const u = url.toString();
        if (u === "https://example.com/article-404-img") {
          return new Response(
            `<!DOCTYPE html>
            <html>
              <head><title>Fault Tolerant Article</title></head>
              <body>
                <article>
                  <h1>Fault Tolerant Article</h1>
                  <p>Check out our figure:</p>
                  <img src="/broken/diagram.png" alt="Broken Diagram" />
                </article>
              </body>
            </html>`,
            { status: 200, headers: { "Content-Type": "text/html" } }
          );
        }
        return new Response("Not Found", { status: 404 });
      };

      const mediaService = new MediaService({
        mediaDir: tempDir,
        customFetch: mockFetch as any,
      });

      const strategy = new WebReaderStrategy({
        customFetch: mockFetch as any,
        mediaService,
      });

      const source: DataSource = {
        id: "source-fail-test",
        name: "Fail Source",
        type: "web",
        uri: "https://example.com/article-404-img",
        tags: [],
        isActive: true,
      };

      try {
        const docs = await strategy.fetch(source);
        expect(docs).toHaveLength(1);
        const cleanDoc = strategy.extractCleanText(docs[0]);
        expect(cleanDoc.textContent).toContain("![Broken Diagram](https://example.com/broken/diagram.png)");
      } finally {
        if (fs.existsSync(tempDir)) {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
          } catch {}
        }
      }
    });

    it("localizes multiple intra-article images concurrently via Promise.all", async () => {
      let activeDownloads = 0;
      let maxConcurrent = 0;

      const mockMediaService: any = {
        downloadAndSave: async (url: string) => {
          activeDownloads++;
          maxConcurrent = Math.max(maxConcurrent, activeDownloads);
          await new Promise((r) => setTimeout(r, 20));
          activeDownloads--;
          return {
            filename: "mock.webp",
            url: `/api/media/mock-${encodeURIComponent(url)}.webp`,
          };
        },
      };

      const strategy = new WebReaderStrategy({
        mediaService: mockMediaService,
      });

      const htmlWithMultipleImages = `
        <html>
          <body>
            <img src="https://example.com/fig1.png" />
            <img src="https://example.com/fig2.png" />
            <img src="https://example.com/fig3.png" />
          </body>
        </html>
      `;

      const resultHtml = await strategy.localizeImagesInHtml(htmlWithMultipleImages, "https://example.com/article");

      expect(maxConcurrent).toBeGreaterThan(1);
      expect(resultHtml).toContain("/api/media/mock-");
    });
  });
});

