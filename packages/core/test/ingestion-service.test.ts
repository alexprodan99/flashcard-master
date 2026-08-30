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

describe("IngestionService", () => {
  let db: any;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;
  let strategyRegistry: StrategyRegistry;
  let mockStrategy: MockFeedStrategy;
  let service: IngestionService;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    strategyRegistry = new StrategyRegistry();
    mockStrategy = new MockFeedStrategy();
    strategyRegistry.register(mockStrategy);
    service = new IngestionService(sourceRepo, syncRepo, strategyRegistry);
  });

  it("performs initial sync and stores sync_state", async () => {
    const source = sourceRepo.create({ name: "Tech Blog", type: "rss", uri: "https://tech.blog" });

    mockStrategy.mockItems = [
      { id: "1", sourceId: source.id, title: "Post 1", rawContent: "Content 1", guid: "guid-1" },
      { id: "2", sourceId: source.id, title: "Post 2", rawContent: "Content 2", guid: "guid-2" },
    ];

    const result = await service.syncSource(source.id);

    expect(result.newCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.newDocuments.length).toBe(2);

    const syncState = syncRepo.get(source.id);
    expect(syncState).toBeDefined();
    expect(syncState?.lastGuid).toBe("guid-2");
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
});
