import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS data_sources (
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

CREATE TABLE IF NOT EXISTS sync_state (
    source_id TEXT PRIMARY KEY REFERENCES data_sources(id) ON DELETE CASCADE,
    last_synced_at TEXT NOT NULL,
    last_guid TEXT,
    content_hash TEXT,
    item_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_quote TEXT NOT NULL,
    source_origin_url TEXT,
    difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert')),
    persona_used TEXT NOT NULL DEFAULT 'socratic-mentor',
    target_deck TEXT NOT NULL DEFAULT 'Default',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_flashcards_source_id ON flashcards(source_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_target_deck ON flashcards(target_deck);
CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty ON flashcards(difficulty);
`;

export interface DatabaseClientOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export function getDefaultDatabasePath(): string {
  const home = os.homedir();
  const dir = path.join(home, ".flashcard-master");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "data.sqlite");
}

export function createDatabaseClient(options: DatabaseClientOptions = {}): Database.Database {
  let dbLocation = options.dbPath;
  if (options.inMemory || options.dbPath === ":memory:") {
    dbLocation = ":memory:";
  } else if (!dbLocation) {
    dbLocation = getDefaultDatabasePath();
  } else {
    const parentDir = path.dirname(dbLocation);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  const db = new Database(dbLocation);

  // Enforce WAL mode (AD-3)
  if (dbLocation !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  
  // Disable foreign keys during schema creation and migration
  db.pragma("foreign_keys = OFF");

  // Execute schema creation
  db.exec(SCHEMA_SQL);

  // Run automatic migrations and repairs on existing databases
  runMigrations(db);

  // Enable foreign keys after migrations are complete
  db.pragma("foreign_keys = ON");

  return db;
}

export function runMigrations(db: Database.Database): void {
  db.pragma("foreign_keys = OFF");

  // 1. Check if data_sources table exists and needs check constraint update for 'sitemap' and 'llms-txt'
  const sourceRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='data_sources'")
    .get() as { sql?: string } | undefined;

  if (sourceRow && sourceRow.sql && !sourceRow.sql.includes("'sitemap'")) {
    db.transaction(() => {
      db.exec("ALTER TABLE data_sources RENAME TO _data_sources_old;");
      db.exec(`
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
      `);
      db.exec(`
        INSERT INTO data_sources (id, name, type, uri, target_deck, tags, is_active, created_at, updated_at)
        SELECT id, name, type, uri, target_deck, tags, is_active, created_at, updated_at FROM _data_sources_old;
      `);
      db.exec("DROP TABLE _data_sources_old;");
    })();
  }

  // 2. Repair sync_state table if foreign key references _data_sources_old
  const syncRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_state'")
    .get() as { sql?: string } | undefined;

  if (syncRow && syncRow.sql && syncRow.sql.includes("_data_sources_old")) {
    db.transaction(() => {
      db.exec("ALTER TABLE sync_state RENAME TO _sync_state_old;");
      db.exec(`
        CREATE TABLE sync_state (
            source_id TEXT PRIMARY KEY REFERENCES data_sources(id) ON DELETE CASCADE,
            last_synced_at TEXT NOT NULL,
            last_guid TEXT,
            content_hash TEXT,
            item_count INTEGER NOT NULL DEFAULT 0
        );
      `);
      db.exec(`
        INSERT INTO sync_state (source_id, last_synced_at, last_guid, content_hash, item_count)
        SELECT source_id, last_synced_at, last_guid, content_hash, item_count FROM _sync_state_old;
      `);
      db.exec("DROP TABLE _sync_state_old;");
    })();
  }

  // 3. Repair flashcards table if foreign key references _data_sources_old
  const cardsRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='flashcards'")
    .get() as { sql?: string } | undefined;

  if (cardsRow && cardsRow.sql && cardsRow.sql.includes("_data_sources_old")) {
    db.transaction(() => {
      db.exec("ALTER TABLE flashcards RENAME TO _flashcards_old;");
      db.exec(`
        CREATE TABLE flashcards (
            id TEXT PRIMARY KEY,
            source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            source_quote TEXT NOT NULL,
            source_origin_url TEXT,
            difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert')),
            persona_used TEXT NOT NULL DEFAULT 'socratic-mentor',
            target_deck TEXT NOT NULL DEFAULT 'Default',
            tags TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
      `);
      db.exec(`
        INSERT INTO flashcards (id, source_id, question, answer, source_quote, source_origin_url, difficulty, persona_used, target_deck, tags, created_at, updated_at)
        SELECT id, source_id, question, answer, source_quote, source_origin_url, difficulty, persona_used, target_deck, tags, created_at, updated_at FROM _flashcards_old;
      `);
      db.exec("DROP TABLE _flashcards_old;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_source_id ON flashcards(source_id);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_target_deck ON flashcards(target_deck);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty ON flashcards(difficulty);");
    })();
  }
}
