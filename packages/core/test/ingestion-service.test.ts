import { describe, it, expect, beforeEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { SyncStateRepository } from "../src/storage/sync-state-repository.js";
import { StrategyRegistry } from "../src/services/strategy-registry.js";
import { IngestionService } from "../src/services/ingestion-service.js";
import type { IngestionStrategy } from "../src/ports/index.js";
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
});
