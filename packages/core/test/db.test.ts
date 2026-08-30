import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("SQLite Database Client", () => {
  let tempDir: string;
  let tempDbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-test-"));
    tempDbPath = path.join(tempDir, "test-data.sqlite");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("initializes an in-memory database with all required schema tables", () => {
    const db = createDatabaseClient({ inMemory: true });
    
    // Check tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("data_sources");
    expect(tableNames).toContain("sync_state");
    expect(tableNames).toContain("flashcards");
    expect(tableNames).toContain("app_settings");

    db.close();
  });

  it("initializes a file-based database in WAL mode and foreign keys enabled", () => {
    const db = createDatabaseClient({ dbPath: tempDbPath });

    const journalMode = db.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");

    const foreignKeys = db.pragma("foreign_keys", { simple: true });
    expect(foreignKeys).toBe(1);

    // Verify inserting and querying a data source
    db.prepare(`
      INSERT INTO data_sources (id, name, type, uri, target_deck, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("test-id-1", "Test Feed", "rss", "https://example.com/feed.xml", "Default", JSON.stringify(["tech"]));

    const row = db.prepare("SELECT * FROM data_sources WHERE id = ?").get("test-id-1") as any;
    expect(row).toBeDefined();
    expect(row.name).toBe("Test Feed");
    expect(row.type).toBe("rss");

    db.close();
    expect(fs.existsSync(tempDbPath)).toBe(true);
  });

  it("preserves data and is idempotent across multiple database client creations", () => {
    const db1 = createDatabaseClient({ dbPath: tempDbPath });
    db1.prepare(`
      INSERT INTO app_settings (key, value) VALUES ('theme', 'dark')
    `).run();
    db1.close();

    const db2 = createDatabaseClient({ dbPath: tempDbPath });
    const setting = db2.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get() as any;
    expect(setting.value).toBe("dark");
    db2.close();
  });
});
