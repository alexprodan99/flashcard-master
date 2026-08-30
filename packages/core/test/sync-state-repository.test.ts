import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import { SyncStateRepository } from "../src/storage/sync-state-repository.js";
import type Database from "better-sqlite3";

describe("SyncStateRepository", () => {
  let db: Database.Database;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("upserts and retrieves sync state for a data source", () => {
    const source = sourceRepo.create({ name: "Sync Test Feed", type: "rss", uri: "https://sync.com/rss" });

    syncRepo.upsert({
      sourceId: source.id,
      lastSyncedAt: "2026-08-30T21:00:00.000Z",
      lastGuid: "guid-item-10",
      contentHash: "a1b2c3d4e5f6",
      itemCount: 5,
    });

    const fetched = syncRepo.get(source.id);
    expect(fetched).toBeDefined();
    expect(fetched?.sourceId).toBe(source.id);
    expect(fetched?.lastGuid).toBe("guid-item-10");
    expect(fetched?.contentHash).toBe("a1b2c3d4e5f6");
    expect(fetched?.itemCount).toBe(5);

    // Test upsert on update
    syncRepo.upsert({
      sourceId: source.id,
      lastSyncedAt: "2026-08-30T22:00:00.000Z",
      lastGuid: "guid-item-12",
      contentHash: "f6e5d4c3b2a1",
      itemCount: 7,
    });

    const updated = syncRepo.get(source.id);
    expect(updated?.lastGuid).toBe("guid-item-12");
    expect(updated?.itemCount).toBe(7);
  });

  it("deletes sync state when requested or when data source is deleted (CASCADE)", () => {
    const source = sourceRepo.create({ name: "Cascade Feed", type: "rss", uri: "https://cascade.com/rss" });

    syncRepo.upsert({
      sourceId: source.id,
      lastSyncedAt: "2026-08-30T21:00:00.000Z",
      itemCount: 1,
    });

    expect(syncRepo.get(source.id)).toBeDefined();

    // Delete source
    sourceRepo.delete(source.id);
    expect(syncRepo.get(source.id)).toBeNull();
  });
});
