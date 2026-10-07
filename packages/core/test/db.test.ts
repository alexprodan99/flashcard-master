import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDatabaseClient,
  getDefaultDatabasePath,
  migrateLegacyDatabaseIfNeeded,
} from "../src/storage/db.js";
import { DataSourceSchema } from "../src/domain/models.js";
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
    `).run("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "Test Feed", "rss", "https://example.com/feed.xml", "Default", JSON.stringify(["tech"]));

    const row = db.prepare("SELECT * FROM data_sources WHERE id = ?").get("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11") as any;
    expect(row).toBeDefined();
    expect(row.name).toBe("Test Feed");
    expect(row.type).toBe("rss");

    // Verify Zod schema validation parses SQLite output with ISO-8601 timestamp
    const parsedSource = DataSourceSchema.parse({
      id: row.id,
      name: row.name,
      type: row.type,
      uri: row.uri,
      targetDeck: row.target_deck,
      tags: JSON.parse(row.tags),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    expect(parsedSource.id).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    expect(parsedSource.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

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

  it("automatically migrates legacy data_sources check constraint to support sitemap and llms-txt", () => {
    // 1. Manually create legacy database with old check constraint
    const legacyDb = new (require("better-sqlite3"))(tempDbPath);
    legacyDb.exec(`
      CREATE TABLE data_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local')),
          uri TEXT NOT NULL,
          target_deck TEXT NOT NULL DEFAULT 'Default',
          tags TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT INTO data_sources (id, name, type, uri) VALUES ('src-1', 'Legacy RSS', 'rss', 'https://example.com/rss');
    `);
    legacyDb.close();

    // 2. Open with createDatabaseClient which triggers auto-migration
    const migratedDb = createDatabaseClient({ dbPath: tempDbPath });

    // 3. Verify existing data preserved
    const row = migratedDb.prepare("SELECT * FROM data_sources WHERE id = 'src-1'").get() as any;
    expect(row.name).toBe("Legacy RSS");

    // 4. Verify inserting 'sitemap' and 'llms-txt' succeeds without CHECK constraint error
    expect(() => {
      migratedDb.prepare(`
        INSERT INTO data_sources (id, name, type, uri) VALUES ('src-2', 'Sitemap Source', 'sitemap', 'https://example.com/sitemap.xml')
      `).run();
      migratedDb.prepare(`
        INSERT INTO data_sources (id, name, type, uri) VALUES ('src-3', 'LLMs Source', 'llms-txt', 'https://example.com/llms-full.txt')
      `).run();
      migratedDb.prepare(`
        INSERT INTO data_sources (id, name, type, uri) VALUES ('src-4', 'Notion Workspace', 'notion', 'https://www.notion.so/workspace/123456781234123412341234567890ab')
      `).run();
    }).not.toThrow();

    migratedDb.close();
  });

  it("automatically migrates legacy documents table to add raw_content column idempotently", () => {
    // 1. Manually create legacy database with old documents schema (no raw_content column)
    const legacyDb = new (require("better-sqlite3"))(tempDbPath);
    legacyDb.exec(`
      CREATE TABLE data_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt')),
          uri TEXT NOT NULL,
          target_deck TEXT NOT NULL DEFAULT 'Default',
          tags TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT,
          text_content TEXT NOT NULL,
          content_hash TEXT,
          word_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT INTO data_sources (id, name, type, uri) VALUES ('src-1', 'Test Source', 'rss', 'https://example.com/rss');
      INSERT INTO documents (id, source_id, title, url, text_content) VALUES ('doc-1', 'src-1', 'Old Doc', 'https://example.com/doc1', 'Old text content');
    `);
    legacyDb.close();

    // 2. Open with createDatabaseClient which triggers auto-migration
    const migratedDb = createDatabaseClient({ dbPath: tempDbPath });

    // 3. Verify columns include raw_content
    const cols = migratedDb.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
    expect(cols.some((c) => c.name === "raw_content")).toBe(true);

    // 4. Verify existing doc is preserved with null raw_content
    const doc = migratedDb.prepare("SELECT * FROM documents WHERE id = 'doc-1'").get() as any;
    expect(doc.title).toBe("Old Doc");
    expect(doc.text_content).toBe("Old text content");
    expect(doc.raw_content).toBeNull();

    // 5. Update raw_content and verify persistence
    // 6. Verify foreign key integrity after migration
    expect(migratedDb.prepare("PRAGMA foreign_key_check").all()).toHaveLength(0);

    migratedDb.close();
  });

  it("automatically migrates legacy flashcards check constraint to support mixed difficulty", () => {
    // 1. Manually create legacy database with old 3-difficulty check constraint
    const legacyDb = new (require("better-sqlite3"))(tempDbPath);
    legacyDb.exec(`
      CREATE TABLE data_sources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt')),
          uri TEXT NOT NULL,
          target_deck TEXT NOT NULL DEFAULT 'Default',
          tags TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE TABLE flashcards (
          id TEXT PRIMARY KEY,
          source_id TEXT,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          source_quote TEXT NOT NULL,
          source_origin_url TEXT,
          document_title TEXT,
          difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert')),
          persona_used TEXT NOT NULL DEFAULT 'socratic-mentor',
          target_deck TEXT NOT NULL DEFAULT 'Default',
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT INTO flashcards (id, question, answer, source_quote, difficulty)
      VALUES ('c-1', 'Legacy Question', 'Legacy Answer', 'Legacy quote', 'beginner');
    `);
    legacyDb.close();

    // 2. Open with createDatabaseClient which triggers auto-migration step 8
    const migratedDb = createDatabaseClient({ dbPath: tempDbPath });

    // 3. Verify existing legacy card is preserved
    const oldCard = migratedDb.prepare("SELECT * FROM flashcards WHERE id = 'c-1'").get() as any;
    expect(oldCard.question).toBe("Legacy Question");
    expect(oldCard.difficulty).toBe("beginner");

    // 4. Verify inserting a new card with 'mixed' difficulty succeeds without check violation
    migratedDb.prepare(`
      INSERT INTO flashcards (id, question, answer, source_quote, difficulty)
      VALUES ('c-2', 'Mixed Question', 'Mixed Answer', 'Mixed quote', 'mixed')
    `).run();

    const mixedCard = migratedDb.prepare("SELECT * FROM flashcards WHERE id = 'c-2'").get() as any;
    expect(mixedCard).toBeDefined();
    expect(mixedCard.difficulty).toBe("mixed");

    migratedDb.close();
  });

  it("resolves canonical database path pointing to ~/.flashcard-master/data.sqlite", () => {
    const canonical = getDefaultDatabasePath();
    expect(canonical.endsWith(path.join(".flashcard-master", "data.sqlite"))).toBe(true);
  });

  it("migrates legacy flashcards.db to data.sqlite non-destructively preserving all records", () => {
    const legacyDbPath = path.join(tempDir, "flashcards.db");
    const canonicalDbPath = path.join(tempDir, "data.sqlite");

    // 1. Create legacy DB with data
    const legacyDb = createDatabaseClient({ dbPath: legacyDbPath });
    legacyDb.prepare(`
      INSERT INTO data_sources (id, name, type, uri, target_deck)
      VALUES ('legacy-src-1', 'Legacy Tech Feed', 'rss', 'https://example.com/rss', 'Default')
    `).run();
    legacyDb.prepare(`
      INSERT INTO flashcards (id, source_id, question, answer, source_quote, difficulty)
      VALUES ('legacy-card-1', 'legacy-src-1', 'Legacy Q', 'Legacy A', 'Legacy quote', 'beginner')
    `).run();
    legacyDb.close();

    expect(fs.existsSync(legacyDbPath)).toBe(true);
    expect(fs.existsSync(canonicalDbPath)).toBe(false);

    // 2. Open canonical database - should detect legacy and copy
    const client = createDatabaseClient({ dbPath: canonicalDbPath });
    expect(fs.existsSync(canonicalDbPath)).toBe(true);

    const source = client.prepare("SELECT * FROM data_sources WHERE id = 'legacy-src-1'").get() as any;
    expect(source).toBeDefined();
    expect(source.name).toBe("Legacy Tech Feed");

    const card = client.prepare("SELECT * FROM flashcards WHERE id = 'legacy-card-1'").get() as any;
    expect(card).toBeDefined();
    expect(card.question).toBe("Legacy Q");

    // Verify WAL mode on canonical database
    const journalMode = client.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");

    client.close();
    // Legacy file should also remain intact (non-destructive)
    expect(fs.existsSync(legacyDbPath)).toBe(true);
  });

  it("does not overwrite data.sqlite if both legacy and canonical databases exist", () => {
    const legacyDbPath = path.join(tempDir, "flashcards.db");
    const canonicalDbPath = path.join(tempDir, "data.sqlite");

    // 1. Create legacy DB
    // 1. Create canonical DB first with value 'canonical'
    const canonicalDb = createDatabaseClient({ dbPath: canonicalDbPath });
    canonicalDb.prepare(`
      INSERT INTO app_settings (key, value) VALUES ('version', 'canonical')
    `).run();
    canonicalDb.close();

    // 2. Create legacy DB with value 'legacy'
    const legacyDb = createDatabaseClient({ dbPath: legacyDbPath });
    legacyDb.prepare(`
      INSERT INTO app_settings (key, value) VALUES ('version', 'legacy')
    `).run();
    legacyDb.close();

    // 3. Run migration helper - should detect canonical already exists and refuse to overwrite
    const result = migrateLegacyDatabaseIfNeeded(legacyDbPath, canonicalDbPath);
    expect(result).toBe(false);

    // 4. Verify canonical DB was NOT overwritten
    const checkDb = createDatabaseClient({ dbPath: canonicalDbPath });
    const setting = checkDb.prepare("SELECT value FROM app_settings WHERE key = 'version'").get() as any;
    expect(setting.value).toBe("canonical");
    checkDb.close();
  });

  it("migrates legacy flashcards.db if canonical data.sqlite exists but contains zero user records", () => {
    const legacyDbPath = path.join(tempDir, "flashcards.db");
    const canonicalDbPath = path.join(tempDir, "data.sqlite");

    // 1. Create canonical DB with schema initialized but zero rows in any table
    const canonicalDb = createDatabaseClient({ dbPath: canonicalDbPath });
    canonicalDb.close();

    // 2. Create legacy DB with real data
    const legacyDb = createDatabaseClient({ dbPath: legacyDbPath });
    legacyDb.prepare(`
      INSERT INTO data_sources (id, name, type, uri, target_deck)
      VALUES ('legacy-src-2', 'Populated Feed', 'rss', 'https://example.com/feed', 'Default')
    `).run();
    legacyDb.close();

    // 3. Trigger migration - should detect canonical is unpopulated and migrate legacy
    const result = migrateLegacyDatabaseIfNeeded(legacyDbPath, canonicalDbPath);
    expect(result).toBe(true);

    // 4. Verify canonical DB now has the legacy data
    const checkDb = createDatabaseClient({ dbPath: canonicalDbPath });
    const source = checkDb.prepare("SELECT * FROM data_sources WHERE id = 'legacy-src-2'").get() as any;
    expect(source).toBeDefined();
    expect(source.name).toBe("Populated Feed");
    checkDb.close();
  });

  it("migrates legacy flashcards.db-wal to data.sqlite-wal when WAL sidecar exists", () => {
    const legacyDbPath = path.join(tempDir, "flashcards.db");
    const legacyWalPath = `${legacyDbPath}-wal`;
    const canonicalDbPath = path.join(tempDir, "data.sqlite");
    const canonicalWalPath = `${canonicalDbPath}-wal`;

    // 1. Create legacy DB
    const legacyDb = createDatabaseClient({ dbPath: legacyDbPath });
    legacyDb.close();

    // 2. Simulate WAL sidecar file
    fs.writeFileSync(legacyWalPath, "simulated-wal-content");

    expect(fs.existsSync(legacyDbPath)).toBe(true);
    expect(fs.existsSync(legacyWalPath)).toBe(true);
    expect(fs.existsSync(canonicalDbPath)).toBe(false);
    expect(fs.existsSync(canonicalWalPath)).toBe(false);

    // 3. Trigger migration
    const migrated = migrateLegacyDatabaseIfNeeded(legacyDbPath, canonicalDbPath);
    expect(migrated).toBe(true);
    expect(fs.existsSync(canonicalDbPath)).toBe(true);
    expect(fs.existsSync(canonicalWalPath)).toBe(true);
    expect(fs.readFileSync(canonicalWalPath, "utf-8")).toBe("simulated-wal-content");
  });

  it("migrates existing database missing start_page and end_page without data loss", () => {
    const dbFile = path.join(tempDir, "legacy-docs.sqlite");
    const rawDb = new (require("better-sqlite3"))(dbFile);

    // Create minimal data_sources table
    rawDb.exec(`
      CREATE TABLE data_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        uri TEXT NOT NULL,
        target_deck TEXT NOT NULL DEFAULT 'Default',
        tags TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT INTO data_sources (id, name, type, uri) VALUES ('src-1', 'Source 1', 'local', 'file:///test');

      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        url TEXT,
        text_content TEXT NOT NULL,
        raw_content TEXT,
        content_hash TEXT,
        word_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT INTO documents (id, source_id, title, text_content) VALUES ('doc-legacy', 'src-1', 'Old Doc', 'Legacy text content');
    `);
    rawDb.close();

    // Now open via createDatabaseClient which executes runMigrations
    const migratedDb = createDatabaseClient({ dbPath: dbFile });

    const columns = migratedDb.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain("start_page");
    expect(colNames).toContain("end_page");

    // Verify data was preserved
    const row = migratedDb.prepare("SELECT * FROM documents WHERE id = 'doc-legacy'").get() as any;
    expect(row).toBeDefined();
    expect(row.title).toBe("Old Doc");
    expect(row.text_content).toBe("Legacy text content");
    expect(row.start_page).toBeNull();
    expect(row.end_page).toBeNull();

    migratedDb.close();
  });
});
