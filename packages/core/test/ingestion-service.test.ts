import { describe, it, expect, beforeEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { SyncStateRepository } from "../src/storage/sync-state-repository.js";
import { StrategyRegistry } from "../src/services/strategy-registry.js";
import { IngestionService } from "../src/services/ingestion-service.js";
import type { IngestionStrategy, IngestionOptions } from "../src/ports/index.js";
import type { DataSource, RawDocument, CleanTextDocument } from "../src/domain/models.js";

class MockFeedStrategy implements IngestionStrategy {
  readonly type = "rss" as const;
  public mockItems: RawDocument[] = [];

  async fetch(source: DataSource): Promise<RawDocument[]> {
    return this.mockItems;
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: raw.rawContent,
      originUrl: raw.originUrl,
      contentHash: `hash-${raw.guid || raw.title}`,
    };
  }
}

import { DocumentRepository } from "../src/storage/document-repository.js";

describe("IngestionService", () => {
  let db: any;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;
  let docRepo: DocumentRepository;
  let strategyRegistry: StrategyRegistry;
  let mockStrategy: MockFeedStrategy;
  let service: IngestionService;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    docRepo = new DocumentRepository(db);
    strategyRegistry = new StrategyRegistry();
    mockStrategy = new MockFeedStrategy();
    strategyRegistry.register(mockStrategy);
    service = new IngestionService(sourceRepo, syncRepo, strategyRegistry, docRepo);
  });

  it("performs initial sync, stores sync_state, and persists documents to DocumentRepository", async () => {
    const source = sourceRepo.create({ name: "Tech Blog", type: "rss", uri: "https://tech.blog" });

    mockStrategy.mockItems = [
      { id: "1", sourceId: source.id, title: "Post 1", rawContent: "Content 1 with words", guid: "guid-1", originUrl: "https://tech.blog/post-1" },
      { id: "2", sourceId: source.id, title: "Post 2", rawContent: "Content 2 with words", guid: "guid-2", originUrl: "https://tech.blog/post-2" },
    ];

    const result = await service.syncSource(source.id);

    expect(result.newCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.newDocuments.length).toBe(2);

    const syncState = syncRepo.get(source.id);
    expect(syncState).toBeDefined();
    expect(syncState?.lastGuid).toBe("guid-2");

    // Check DocumentRepository persistence
    const savedDocs = docRepo.listBySourceId(source.id);
    expect(savedDocs.length).toBe(2);
    expect(savedDocs[0].title).toBe("Post 1");
    expect(savedDocs[0].url).toBe("https://tech.blog/post-1");
    expect(savedDocs[0].wordCount).toBe(4);
    expect(savedDocs[0].rawContent).toBe("Content 1 with words");
  });

  it("filters previously seen documents in incremental delta sync", async () => {
    const source = sourceRepo.create({ name: "Tech Blog", type: "rss", uri: "https://tech.blog" });

    mockStrategy.mockItems = [
      { id: "1", sourceId: source.id, title: "Post 1", rawContent: "Content 1", guid: "guid-1" },
      { id: "2", sourceId: source.id, title: "Post 2", rawContent: "Content 2", guid: "guid-2" },
    ];

    // First sync
    await service.syncSource(source.id);

    // Add new item 3 and keep item 2
    mockStrategy.mockItems = [
      { id: "2", sourceId: source.id, title: "Post 2", rawContent: "Content 2", guid: "guid-2" },
      { id: "3", sourceId: source.id, title: "Post 3", rawContent: "Content 3", guid: "guid-3" },
    ];

    const secondResult = await service.syncSource(source.id);

    expect(secondResult.totalFetched).toBe(2);
    expect(secondResult.newCount).toBe(1);
    expect(secondResult.skippedCount).toBe(1);
    expect(secondResult.newDocuments[0].title).toBe("Post 3");
  });

  it("syncAllActive isolates failures per source", async () => {
    const s1 = sourceRepo.create({ name: "Valid Source", type: "rss", uri: "https://valid.com" });
    const s2 = sourceRepo.create({ name: "Disabled Source", type: "rss", uri: "https://disabled.com", isActive: false });

    mockStrategy.mockItems = [
      { id: "1", sourceId: s1.id, title: "Item 1", rawContent: "Content", guid: "g1" },
    ];

    const results = await service.syncAllActive();
    expect(results.length).toBe(1);
    expect(results[0].sourceId).toBe(s1.id);
    expect(results[0].newCount).toBe(1);
  });

  it("does not create duplicate documents in DocumentRepository on repeated syncs of the same items", async () => {
    const source = sourceRepo.create({ name: "Duplicate Test Blog", type: "rss", uri: "https://dup.blog" });

    mockStrategy.mockItems = [
      { id: "1", sourceId: source.id, title: "Article A", rawContent: "Content A", guid: "guid-A", originUrl: "https://dup.blog/a" },
      { id: "2", sourceId: source.id, title: "Article B", rawContent: "Content B", guid: "guid-B", originUrl: "https://dup.blog/b" },
    ];

    // First sync
    await service.syncSource(source.id);
    expect(docRepo.listBySourceId(source.id).length).toBe(2);

    // Second sync of exact same items
    await service.syncSource(source.id);
    expect(docRepo.listBySourceId(source.id).length).toBe(2);

    // Third sync
    await service.syncSource(source.id);
    expect(docRepo.listBySourceId(source.id).length).toBe(2);
  });

  it("slices multi-page document into discrete subdocument rows during syncSource when slicing is configured", async () => {
    const source = sourceRepo.create({ name: "PDF Textbook Source", type: "rss", uri: "file:///books/math" });

    const pageTexts: string[] = [];
    for (let i = 1; i <= 10; i++) {
      pageTexts.push(`<!-- page: ${i} -->\n\nPage ${i} content on mathematics.`);
    }

    mockStrategy.mockItems = [
      {
        id: "pdf-doc-1",
        sourceId: source.id,
        title: "Calculus.pdf",
        rawContent: pageTexts.join("\n\n"),
        guid: "guid-pdf-1",
        originUrl: "file:///books/math/Calculus.pdf",
      },
    ];

    const result = await service.syncSource(source.id, {
      slicing: {
        mode: "budget",
        pagesPerChunk: 5,
      },
    });

    // Should generate 2 subdocuments (pages 1-5 and pages 6-10)
    expect(result.newCount).toBe(2);
    expect(result.newDocuments.length).toBe(2);
    expect(result.newDocuments[0].startPage).toBe(1);
    expect(result.newDocuments[0].endPage).toBe(5);

    const savedDocs = docRepo.listBySourceId(source.id);
    expect(savedDocs.length).toBe(2);
    expect(savedDocs.map((d) => d.title)).toContain("Calculus.pdf - Pages 1-5");
    expect(savedDocs.map((d) => d.title)).toContain("Calculus.pdf - Pages 6-10");
    expect(savedDocs.find((d) => d.startPage === 1)?.url).toBe("file:///books/math/Calculus.pdf#page=1-5");
    expect(savedDocs.find((d) => d.startPage === 6)?.url).toBe("file:///books/math/Calculus.pdf#page=6-10");
  });

  it("populates startPage: 1 and endPage: totalPages when page markers exist and slicing is not configured", async () => {
    const source = sourceRepo.create({ name: "Single PDF Source", type: "rss", uri: "file:///books/bio" });

    const pageTexts: string[] = [];
    for (let i = 1; i <= 8; i++) {
      pageTexts.push(`<!-- page: ${i} -->\n\nPage ${i} content on biology.`);
    }

    mockStrategy.mockItems = [
      {
        id: "pdf-doc-single",
        sourceId: source.id,
        title: "Biology.pdf",
        rawContent: pageTexts.join("\n\n"),
        guid: "guid-bio-1",
        originUrl: "file:///books/bio/Biology.pdf",
      },
    ];

    const result = await service.syncSource(source.id);

    expect(result.newCount).toBe(1);
    expect(result.newDocuments.length).toBe(1);
    expect(result.newDocuments[0].startPage).toBe(1);
    expect(result.newDocuments[0].endPage).toBe(8);

    const savedDocs = docRepo.listBySourceId(source.id);
    expect(savedDocs.length).toBe(1);
    expect(savedDocs[0].title).toBe("Biology.pdf");
    expect(savedDocs[0].startPage).toBe(1);
    expect(savedDocs[0].endPage).toBe(8);
  });

  it("purges previously generated subdocuments when source is re-synced with altered slicing parameters", async () => {
    const source = sourceRepo.create({ name: "Math PDF Source", type: "rss", uri: "file:///books/math" });

    const pageTexts: string[] = [];
    for (let i = 1; i <= 10; i++) {
      pageTexts.push(`<!-- page: ${i} -->\n\nPage ${i} content on mathematics.`);
    }

    mockStrategy.mockItems = [
      {
        id: "pdf-doc-1",
        sourceId: source.id,
        title: "Calculus.pdf",
        rawContent: pageTexts.join("\n\n"),
        guid: "guid-calc-1",
        originUrl: "file:///books/math/Calculus.pdf",
      },
    ];

    // Initial sync with page budget: 5 -> produces 2 slices
    await service.syncSource(source.id, {
      slicing: { mode: "budget", pagesPerChunk: 5 },
    });
    expect(docRepo.listBySourceId(source.id).length).toBe(2);

    // Re-sync with altered budget: 2 -> produces 5 slices (old 2 slices purged)
    mockStrategy.mockItems = [
      {
        id: "pdf-doc-1",
        sourceId: source.id,
        title: "Calculus.pdf",
        rawContent: pageTexts.join("\n\n"),
        guid: "guid-calc-2", // New guid so delta check lets it through
        originUrl: "file:///books/math/Calculus.pdf",
      },
    ];

    await service.syncSource(source.id, {
      syncMode: "full",
      slicing: { mode: "budget", pagesPerChunk: 2 },
    });

    const reslicedDocs = docRepo.listBySourceId(source.id);
    expect(reslicedDocs.length).toBe(5);
    expect(reslicedDocs.every((d) => d.title.includes("Pages "))).toBe(true);
  });

  it("cleans up stale subdocuments when re-syncing from sliced mode to mode='none'", async () => {
    const src = sourceRepo.create({
      name: "Book Source",
      type: "rss",
      uri: "https://example.com/book.xml",
    });

    mockStrategy.mockItems = [
      {
        id: "paged-1",
        sourceId: src.id,
        guid: "paged-1",
        title: "Book",
        rawContent: "<!-- page: 1 -->\n\nAlpha.\n\n<!-- page: 2 -->\n\nBeta.\n\n<!-- page: 3 -->\n\nGamma.",
        originUrl: "https://example.com/book",
      },
    ];

    const slicedRes = await service.syncSource(src.id, {
      slicing: { mode: "budget", pagesPerChunk: 1 },
    });
    expect(slicedRes.newCount).toBe(3);
    expect(docRepo.listBySourceId(src.id)).toHaveLength(3);

    const unslicedRes = await service.syncSource(src.id, {
      syncMode: "full",
      slicing: { mode: "none" },
    });
    expect(unslicedRes.newCount).toBe(1);
    const remaining = docRepo.listBySourceId(src.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("Book");
  });

  it("preserves existing documents and logs warning when custom timestampRanges match zero cues", async () => {
    const src = sourceRepo.create({
      name: "YT Lecture",
      type: "rss",
      uri: "https://example.com/yt.xml",
    });

    mockStrategy.mockItems = [
      {
        id: "vid-1",
        sourceId: src.id,
        guid: "vid-1",
        title: "Lecture",
        rawContent: "[00:00 - 00:30] Intro content only.",
        originUrl: "https://www.youtube.com/watch?v=LPZh9BOjkQs",
      },
    ];

    await service.syncSource(src.id, {
      syncMode: "full", slicing: { mode: "none" } });
    expect(docRepo.listBySourceId(src.id)).toHaveLength(1);

    const warnMessages: string[] = [];
    await service.syncSource(src.id, {
      syncMode: "full",
      slicing: {
        mode: "timestamps",
        minutesPerChunk: 10,
        timestampRanges: [{ start: "50:00", end: "55:00" }],
      },
      onLog: (level, msg) => {
        if (level === "warn") warnMessages.push(msg);
      },
    });

    expect(docRepo.listBySourceId(src.id)).toHaveLength(1);
    expect(warnMessages.some((m) => m.includes("preserving existing documents"))).toBe(true);
  });

  it("applies source defaultSlicingMode and honors per-item slicingHint overrides", async () => {
    const src = sourceRepo.create({
      name: "Mixed Media Source",
      type: "rss",
      uri: "https://example.com/mixed.xml",
      defaultSlicingMode: "timestamps",
      defaultIntervalMinutes: 1,
    });

    mockStrategy.mockItems = [
      {
        id: "vid-default",
        sourceId: src.id,
        guid: "vid-default",
        title: "Long Talk",
        rawContent: "[00:00 - 00:30] First minute.\n\n[01:05 - 01:30] Second minute.",
        originUrl: "https://example.com/talk",
      },
      {
        id: "vid-override-none",
        sourceId: src.id,
        guid: "vid-override-none",
        title: "Short Intro",
        rawContent: "[00:00 - 00:30] First short part.\n\n[01:05 - 01:30] Second short part.",
        originUrl: "https://example.com/intro",
        slicingHint: { mode: "none" },
      },
    ];

    const res = await service.syncSource(src.id);
    expect(res.error).toBeUndefined();
    const docs = docRepo.listBySourceId(src.id);
    // Long Talk is split into 2 1-minute windows; Short Intro stays 1 unsliced document
    expect(docs).toHaveLength(3);
    expect(docs.filter((d) => d.title.startsWith("Long Talk"))).toHaveLength(2);
    expect(docs.filter((d) => d.title === "Short Intro")).toHaveLength(1);
  });

  it("defaults syncMode to 'new-only', preserves existing sliced documents, and counts pre-fetch skips", async () => {
    const source = sourceRepo.create({
      name: "Books Collection",
      type: "web",
      uri: "https://books.example.com/calculus",
      defaultSlicingMode: "budget",
    });

    class WebMockStrategy implements IngestionStrategy {
      readonly type = "web" as const;
      public items: RawDocument[] = [];
      public fetchCalls: Array<IngestionOptions | undefined> = [];

      async fetch(_source: DataSource, _lastSync?: any, options?: IngestionOptions): Promise<RawDocument[]> {
        this.fetchCalls.push(options);
        if (options?.syncMode !== "full" && options?.knownItemKeys?.size) {
          return this.items.filter((item) => {
            if (item.originUrl && options.knownItemKeys!.has(item.originUrl)) {
              options.onItemSkipped?.(item.originUrl);
              return false;
            }
            return true;
          });
        }
        return this.items;
      }

      extractCleanText(raw: RawDocument): CleanTextDocument {
        return {
          id: raw.id,
          sourceId: raw.sourceId,
          title: raw.title,
          textContent: raw.rawContent,
          originUrl: raw.originUrl,
          contentHash: `hash-${raw.id}`,
        };
      }
    }

    const webStrategy = new WebMockStrategy();
    strategyRegistry.register(webStrategy);

    const book1Pages = Array.from({ length: 6 }, (_, i) => `<!-- page: ${i + 1} -->\n\nBook 1 page ${i + 1}`).join("\n\n");
    const book2Pages = Array.from({ length: 6 }, (_, i) => `<!-- page: ${i + 1} -->\n\nBook 2 page ${i + 1}`).join("\n\n");

    webStrategy.items = [
      {
        id: "b1",
        sourceId: source.id,
        title: "Book 1",
        rawContent: book1Pages,
        originUrl: "https://books.example.com/book1",
      },
    ];

    const first = await service.syncSource(source.id, {
      slicing: { mode: "budget", pagesPerChunk: 3 },
    });
    expect(first.newCount).toBe(2);
    expect(first.skippedCount).toBe(0);
    expect(docRepo.listBySourceId(source.id)).toHaveLength(2);

    webStrategy.items = [
      ...webStrategy.items,
      {
        id: "b2",
        sourceId: source.id,
        title: "Book 2",
        rawContent: book2Pages,
        originUrl: "https://books.example.com/book2",
      },
    ];

    const second = await service.syncSource(source.id, {
      slicing: { mode: "budget", pagesPerChunk: 3 },
    });
    expect(webStrategy.fetchCalls[1]?.syncMode).toBe("new-only");
    expect(webStrategy.fetchCalls[1]?.knownItemKeys?.has("https://books.example.com/book1")).toBe(true);
    expect(second.totalFetched).toBe(1);
    expect(second.newCount).toBe(2);
    expect(second.skippedCount).toBe(1);
    expect(docRepo.listBySourceId(source.id)).toHaveLength(4);

    const third = await service.syncSource(source.id, {
      syncMode: "full",
      slicing: { mode: "budget", pagesPerChunk: 3 },
    });
    expect(webStrategy.fetchCalls[2]?.syncMode).toBe("full");
    expect(webStrategy.fetchCalls[2]?.knownItemKeys).toBeUndefined();
    expect(third.totalFetched).toBe(2);
    expect(third.newCount).toBe(4);
    expect(third.skippedCount).toBe(0);
    expect(docRepo.listBySourceId(source.id)).toHaveLength(4);
  });

  it("matches local PDFs strictly by normalized path without cross-path content-hash deduplication", async () => {
    const source = sourceRepo.create({
      name: "Local PDFs",
      type: "local",
      uri: "/books",
    });

    const receivedKnownSets: Array<Set<string> | undefined> = [];
    class LocalMockStrategy implements IngestionStrategy {
      readonly type = "local" as const;
      public items: RawDocument[] = [];

      async fetch(_source: DataSource, _lastSync?: any, options?: IngestionOptions): Promise<RawDocument[]> {
        receivedKnownSets.push(options?.knownItemKeys);
        if (options?.syncMode !== "full" && options?.knownItemKeys?.size) {
          return this.items.filter((item) => {
            if (item.originUrl && options.knownItemKeys!.has(item.originUrl)) {
              options.onItemSkipped?.(item.originUrl);
              return false;
            }
            return true;
          });
        }
        return this.items;
      }

      extractCleanText(raw: RawDocument): CleanTextDocument {
        return {
          id: raw.id,
          sourceId: raw.sourceId,
          title: raw.title,
          textContent: raw.rawContent,
          originUrl: raw.originUrl,
          contentHash: "identical-pdf-content-hash",
        };
      }
    }

    const localMock = new LocalMockStrategy();
    strategyRegistry.register(localMock);

    localMock.items = [
      {
        id: "pdf-dir-a",
        sourceId: source.id,
        title: "report.pdf",
        rawContent: "Identical bytes content",
        originUrl: "file:///books/dirA/report.pdf",
      },
    ];
    await service.syncSource(source.id);

    localMock.items = [
      ...localMock.items,
      {
        id: "pdf-dir-b",
        sourceId: source.id,
        title: "report.pdf",
        rawContent: "Identical bytes content",
        originUrl: "file:///books/dirB/report.pdf",
      },
    ];
    const second = await service.syncSource(source.id, {
      slicing: { mode: "none" },
    });
    expect(receivedKnownSets[1]?.has("/books/dirA/report.pdf")).toBe(true);
    expect(receivedKnownSets[1]?.has("/books/dirB/report.pdf")).toBe(false);
    expect(second.skippedCount).toBe(1);
    expect(second.newCount).toBe(1);
    expect(docRepo.listBySourceId(source.id)).toHaveLength(2);
  });

  it("enforces post-fetch isRawDocKnown safety net, preserves edited Notion pages in 'new-only' mode, and strips knownItemKeys in 'full' mode", async () => {
    const notionPageId = "12345678-90ab-cdef-1234-567890abcdef";
    const notionSource = sourceRepo.create({
      name: "Notion Docs",
      type: "notion",
      uri: notionPageId,
    });

    const seenFullKnownSets: Array<Set<string> | undefined> = [];
    let notionEditedAt = "2026-09-01T00:00:00.000Z";
    let notionContent = "Initial Notion content";

    // Strategy intentionally ignores options.knownItemKeys to verify IngestionService post-fetch safety net
    class IgnorantNotionStrategy implements IngestionStrategy {
      readonly type = "notion" as const;

      async fetch(source: DataSource, _lastSync?: any, options?: IngestionOptions): Promise<RawDocument[]> {
        seenFullKnownSets.push(options?.knownItemKeys);
        return [
          {
            id: "notion-doc-1",
            sourceId: source.id,
            title: "Notion Page",
            rawContent: notionContent,
            originUrl: `https://www.notion.so/Page-${notionPageId.replace(/-/g, "")}`,
            guid: notionPageId,
            publishedAt: notionEditedAt,
          },
        ];
      }

      extractCleanText(raw: RawDocument): CleanTextDocument {
        return {
          id: raw.id,
          sourceId: raw.sourceId,
          title: raw.title,
          textContent: raw.rawContent,
          originUrl: raw.originUrl,
          contentHash: `hash-${raw.rawContent}`,
        };
      }
    }

    strategyRegistry.register(new IgnorantNotionStrategy());

    const first = await service.syncSource(notionSource.id);
    expect(first.newCount).toBe(1);

    // Same publishedAt <= lastSyncedAt -> skipped cleanly by post-fetch fallback
    const unchanged = await service.syncSource(notionSource.id);
    expect(unchanged.newCount).toBe(0);
    expect(unchanged.skippedCount).toBe(1);

    // Edited after lastSyncedAt -> must NOT be dropped post-fetch!
    notionEditedAt = new Date(Date.now() + 60_000).toISOString();
    notionContent = "Updated Notion body";
    const updated = await service.syncSource(notionSource.id);
    expect(updated.newCount).toBe(1);
    expect(updated.skippedCount).toBe(0);
    expect(docRepo.listBySourceId(notionSource.id)[0].textContent).toBe("Updated Notion body");

    // Caller-supplied knownItemKeys must NOT leak into strategy in 'full' mode
    await service.syncSource(notionSource.id, {
      syncMode: "full",
      knownItemKeys: new Set(["should-not-leak"]),
    });
    expect(seenFullKnownSets[seenFullKnownSets.length - 1]).toBeUndefined();
  });

  it("backfills YouTube canonical URIs and resolved titles from plain-text or empty-title entries while preserving per-item metadata", async () => {
    const ytSrc = sourceRepo.create({
      name: "Plain YouTube Source",
      type: "youtube",
      uri: "https://youtu.be/VidAlpha001\nhttps://www.youtube.com/shorts/VidAlpha001",
    });

    class MockYtStrategy implements IngestionStrategy {
      readonly type = "youtube" as const;

      async fetch(source: DataSource, _lastSync?: any, options?: IngestionOptions): Promise<RawDocument[]> {
        if (options?.knownItemKeys?.has("VidAlpha001") && options?.syncMode !== "full") {
          options.onItemSkipped?.("VidAlpha001");
          return [];
        }
        return [
          {
            id: "yt-1",
            sourceId: source.id,
            title: "Alpha Resolved Title",
            rawContent: "[00:00 - 00:10] Hello world.",
            originUrl: "https://www.youtube.com/watch?v=VidAlpha001",
          },
        ];
      }

      extractCleanText(raw: RawDocument): CleanTextDocument {
        return {
          id: raw.id,
          sourceId: raw.sourceId,
          title: raw.title,
          textContent: raw.rawContent,
          originUrl: raw.originUrl,
          contentHash: `hash-${raw.id}`,
        };
      }
    }

    strategyRegistry.register(new MockYtStrategy());

    const first = await service.syncSource(ytSrc.id);
    expect(first.newCount).toBe(1);

    const afterFirst = JSON.parse(sourceRepo.getById(ytSrc.id)!.uri);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({
      uri: "https://www.youtube.com/watch?v=VidAlpha001",
      title: "Alpha Resolved Title",
    });

    // Update source with empty title "" and custom slicing fields + duplicate; 'new-only' sync still canonicalizes/dedups and strips empty title
    sourceRepo.update(ytSrc.id, {
      uri: JSON.stringify([
        {
          uri: "https://youtu.be/VidAlpha001",
          title: "",
          extractionMode: "stt",
          sttProvider: "gemini",
          slicingMode: "timestamps",
          intervalMinutes: 5,
          timestampRanges: [{ start: "00:00", end: "01:00" }],
        },
        { uri: "https://www.youtube.com/shorts/VidAlpha001", extractionMode: "auto" },
      ]),
    });

    const second = await service.syncSource(ytSrc.id);
    expect(second.skippedCount).toBe(1);
    const afterSecond = JSON.parse(sourceRepo.getById(ytSrc.id)!.uri);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]).toMatchObject({
      uri: "https://www.youtube.com/watch?v=VidAlpha001",
      extractionMode: "stt",
      sttProvider: "gemini",
      slicingMode: "timestamps",
      intervalMinutes: 5,
      timestampRanges: [{ start: "00:00", end: "01:00" }],
    });
    expect(afterSecond[0].title).toBeUndefined();
  });

  it("preserves concurrent YouTube edits during async backfill, purges replaced items on full sync, and guards sync_state on fetch errors", async () => {
    const { StrategyRegistry, SyncStateRepository, DataSourceRepository, DocumentRepository } = await import("../src/index.js");
    const db = (sourceRepo as any).db;
    const syncRepoLocal = new SyncStateRepository(db);
    const sourceRepoLocal = new DataSourceRepository(db);
    const docRepoLocal = new DocumentRepository(db);
    const registry = new StrategyRegistry();

    const ytSource = sourceRepoLocal.create({
      name: "Concurrent YT",
      type: "youtube",
      uri: JSON.stringify([{ uri: "https://youtu.be/dQw4w9WgXcQ", extractionMode: "auto" }]),
    });

    registry.register({
      type: "youtube",
      fetch: async () => {
        sourceRepoLocal.update(ytSource.id, {
          uri: JSON.stringify([
            { uri: "https://youtu.be/dQw4w9WgXcQ", extractionMode: "auto" },
            { uri: "https://www.youtube.com/watch?v=9bZkp7q19f0", title: "Added Mid-Sync", extractionMode: "auto" },
          ]),
        });
        return [
          {
            id: "raw-yt-1",
            sourceId: ytSource.id,
            title: "Resolved Original Video",
            originUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            rawContent: "Transcript body",
            guid: "dQw4w9WgXcQ",
          },
        ];
      },
      extractCleanText: (raw) => ({
        id: raw.id,
        sourceId: raw.sourceId,
        title: raw.title,
        textContent: raw.rawContent,
        originUrl: raw.originUrl,
        contentHash: "hash-yt-1",
        wordCount: 2,
      }),
    });

    const svc = new IngestionService(sourceRepoLocal, syncRepoLocal, registry, docRepoLocal);
    await svc.syncSource(ytSource.id);

    const after = sourceRepoLocal.getById(ytSource.id)!;
    const items = JSON.parse(after.uri);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Resolved Original Video");
    expect(items[1]).toEqual(expect.objectContaining({ title: "Added Mid-Sync" }));

    let returnSecond = false;
    const webSrc = sourceRepoLocal.create({
      name: "Web Replace Full",
      type: "web",
      uri: "https://example.com/a",
    });
    registry.register({
      type: "web",
      fetch: async (_src, _last, opts) => {
        if ((opts as any)?.failNow) {
          opts?.onFetchError?.("HTTP 503");
          return [];
        }
        const url = returnSecond ? "https://example.com/b" : "https://example.com/a";
        return [{ id: url, sourceId: webSrc.id, title: url, originUrl: url, rawContent: "Body " + url, guid: url }];
      },
      extractCleanText: (raw) => ({
        id: raw.id,
        sourceId: raw.sourceId,
        title: raw.title,
        textContent: raw.rawContent,
        originUrl: raw.originUrl,
        contentHash: "hash-" + raw.originUrl,
        wordCount: 2,
      }),
    });

    await svc.syncSource(webSrc.id, { syncMode: "new-only" });
    const prevCursor = syncRepoLocal.get(webSrc.id)!;
    expect(prevCursor.itemCount).toBe(1);

    await new Promise((r) => setTimeout(r, 10));
    await svc.syncSource(webSrc.id, { syncMode: "new-only", failNow: true } as any);
    const afterErrCursor = syncRepoLocal.get(webSrc.id)!;
    expect(afterErrCursor.lastSyncedAt).toBe(prevCursor.lastSyncedAt);
    expect(afterErrCursor.itemCount).toBe(1);

    returnSecond = true;
    await svc.syncSource(webSrc.id, { syncMode: "full" });
    const docsAfterReplace = docRepoLocal.listBySourceId(webSrc.id);
    expect(docsAfterReplace.map((d) => d.url)).toEqual(["https://example.com/b"]);
  });

});
