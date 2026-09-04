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

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT,
    text_content TEXT NOT NULL,
    content_hash TEXT,
    word_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_flashcards_source_id ON flashcards(source_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_target_deck ON flashcards(target_deck);
CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty ON flashcards(difficulty);
CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);
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

  // 4. Ensure document_title column exists in flashcards table
  const cardCols = db.prepare("PRAGMA table_info(flashcards)").all() as Array<{ name: string }>;
  if (cardCols && cardCols.length > 0 && !cardCols.some((c) => c.name === "document_title")) {
    db.exec("ALTER TABLE flashcards ADD COLUMN document_title TEXT;");
  }

  // 5. Backfill source_origin_url and document_title from parent data source for legacy cards
  db.exec(`
    UPDATE flashcards
    SET 
      source_origin_url = COALESCE(source_origin_url, (SELECT uri FROM data_sources WHERE data_sources.id = flashcards.source_id)),
      document_title = COALESCE(document_title, (SELECT name FROM data_sources WHERE data_sources.id = flashcards.source_id))
    WHERE source_id IS NOT NULL AND (source_origin_url IS NULL OR document_title IS NULL);
  `);

  // 6. Ensure documents table and index exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        url TEXT,
        text_content TEXT NOT NULL,
        content_hash TEXT,
        word_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);
  `);
}
