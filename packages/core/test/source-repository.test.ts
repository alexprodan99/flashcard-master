import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { DataSourceRepository } from "../src/storage/source-repository.js";
import type Database from "better-sqlite3";

describe("DataSourceRepository", () => {
  let db: Database.Database;
  let repo: DataSourceRepository;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    repo = new DataSourceRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves a data source with serialized tags", () => {
    const created = repo.create({
      name: "Substack Newsletter",
      type: "rss",
      uri: "https://example.substack.com/feed",
      tags: ["tech", "ai"],
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("Substack Newsletter");
    expect(created.type).toBe("rss");
    expect(created.uri).toBe("https://example.substack.com/feed");
    expect((created as any).targetDeck).toBeUndefined();
    expect(created.tags).toEqual(["tech", "ai"]);
    expect(created.isActive).toBe(true);

    const fetched = repo.getById(created.id);
    expect(fetched).toEqual(created);
  });

  it("returns null when querying non-existent data source ID", () => {
    const fetched = repo.getById("00000000-0000-0000-0000-000000000000");
    expect(fetched).toBeNull();
  });

  it("lists all data sources with optional isActive and type filters", () => {
    repo.create({ name: "Source 1", type: "rss", uri: "https://rss1.com" });
    const s2 = repo.create({ name: "Source 2", type: "web", uri: "https://web.com" });
    repo.create({ name: "Source 3", type: "local", uri: "./docs" });

    // Toggle source 2 inactive
    repo.toggleActive(s2.id);

    const all = repo.list();
    expect(all.length).toBe(3);

    const activeOnly = repo.list({ isActive: true });
    expect(activeOnly.length).toBe(2);
    expect(activeOnly.map((s) => s.name)).not.toContain("Source 2");

    const rssOnly = repo.list({ type: "rss" });
    expect(rssOnly.length).toBe(1);
    expect(rssOnly[0].name).toBe("Source 1");
  });

  it("updates source properties and updates the updatedAt timestamp", () => {
    const created = repo.create({ name: "Old Name", type: "rss", uri: "https://old.com" });

    const updated = repo.update(created.id, {
      name: "New Name",
      tags: ["distributed-systems"],
    });

    expect(updated).toBeDefined();
    expect(updated?.name).toBe("New Name");
    expect((updated as any)?.targetDeck).toBeUndefined();
    expect(updated?.tags).toEqual(["distributed-systems"]);
  });

  it("deletes a data source and cascades properly", () => {
    const created = repo.create({ name: "To Delete", type: "web", uri: "https://delete.me" });
    expect(repo.getById(created.id)).toBeDefined();

    const deleted = repo.delete(created.id);
    expect(deleted).toBe(true);
    expect(repo.getById(created.id)).toBeNull();

    // Deleting again returns false
    expect(repo.delete(created.id)).toBe(false);
  });

  it("completely decouples deck from data source (data source has no targetDeck property)", () => {
    const created = repo.create({
      name: "Knowledge Doc",
      type: "local",
      uri: "./handbook.md",
    });
    expect(created.id).toBeDefined();
    expect((created as any).targetDeck).toBeUndefined();

    const updated = repo.update(created.id, {
      name: "Updated Handbook",
    });
    expect(updated?.name).toBe("Updated Handbook");
    expect((updated as any)?.targetDeck).toBeUndefined();
  });

  it("lists all distinct, normalized tags across data sources using listAllTags", () => {
    // Empty initially
    expect(repo.listAllTags()).toEqual([]);

    repo.create({
      name: "Source 1",
      type: "local",
      uri: "./s1.md",
      tags: ["Distributed-Systems", "raft", "NETWORKING"],
    });

    repo.create({
      name: "Source 2",
      type: "web",
      uri: "https://example.com",
      tags: ["networking", "Raft", "Database"],
    });

    const tags = repo.listAllTags();
    expect(tags).toEqual(["database", "distributed-systems", "networking", "raft"]);
  });
});
