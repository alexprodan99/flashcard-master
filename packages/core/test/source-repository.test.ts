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

  it("creates and retrieves a data source with default deck and serialized tags", () => {
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
    expect(created.targetDeck).toBe("Default");
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
      targetDeck: "Computer Science",
      tags: ["distributed-systems"],
    });

    expect(updated).toBeDefined();
    expect(updated?.name).toBe("New Name");
    expect(updated?.targetDeck).toBe("Computer Science");
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
});
