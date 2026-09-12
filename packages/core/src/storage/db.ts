import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt', 'notion')),
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
    raw_content TEXT,
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
    difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed')),
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

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('generation', 'sync_all', 'sync_source', 'export')),
    status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
    title TEXT NOT NULL,
    total_steps INTEGER NOT NULL DEFAULT 1,
    current_step INTEGER NOT NULL DEFAULT 0,
    progress_percent REAL NOT NULL DEFAULT 0.0,
    current_step_name TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    result_summary TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_title TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error', 'success')),
    message TEXT NOT NULL,
    details TEXT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
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

export function getDefaultMediaDirectory(): string {
  const home = os.homedir();
  const dir = path.join(home, ".flashcard-master", "media");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
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

  // 1. Check if data_sources table exists and needs check constraint update for 'sitemap', 'llms-txt', or 'notion'
  const sourceRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='data_sources'")
    .get() as { sql?: string } | undefined;

  if (sourceRow && sourceRow.sql && (!sourceRow.sql.includes("'sitemap'") || !sourceRow.sql.includes("'notion'"))) {
    db.transaction(() => {
      db.exec("ALTER TABLE data_sources RENAME TO _data_sources_old;");
      db.exec(`
        CREATE TABLE data_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt', 'notion')),
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
            difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed')),
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

  // 3b. Repair documents table if foreign key references _data_sources_old
  const docsRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")
    .get() as { sql?: string } | undefined;

  if (docsRow && docsRow.sql && docsRow.sql.includes("_data_sources_old")) {
    db.transaction(() => {
      db.exec("ALTER TABLE documents RENAME TO _documents_old;");
      db.exec(`
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
      `);
      db.exec(`
        INSERT INTO documents (id, source_id, title, url, text_content, raw_content, content_hash, word_count, created_at, updated_at)
        SELECT id, source_id, title, url, text_content, raw_content, content_hash, word_count, created_at, updated_at FROM _documents_old;
      `);
      db.exec("DROP TABLE _documents_old;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_id, url) WHERE url IS NOT NULL;");
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

  // 6. Ensure documents table, deduplication, and indices exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
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
    DELETE FROM documents
    WHERE rowid NOT IN (
      SELECT min(rowid)
      FROM documents
      GROUP BY source_id, COALESCE(url, title)
    );
    CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_id, url) WHERE url IS NOT NULL;
  `);

  // 7. Ensure raw_content column exists in documents table for existing databases
  const docCols = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
  if (docCols && docCols.length > 0 && !docCols.some((c) => c.name === "raw_content")) {
    try {
      db.exec("ALTER TABLE documents ADD COLUMN raw_content TEXT;");
    } catch {
      // Catch "duplicate column" or other non-fatal migration errors cleanly
    }
  }

  // 8. Update flashcards table CHECK constraint to include 'mixed' difficulty
  const flashcardsSchemaRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='flashcards'")
    .get() as { sql?: string } | undefined;

  if (flashcardsSchemaRow && flashcardsSchemaRow.sql && !flashcardsSchemaRow.sql.includes("'mixed'")) {
    db.transaction(() => {
      db.exec("ALTER TABLE flashcards RENAME TO _flashcards_difficulty_old;");
      db.exec(`
        CREATE TABLE flashcards (
            id TEXT PRIMARY KEY,
            source_id TEXT REFERENCES data_sources(id) ON DELETE SET NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            source_quote TEXT NOT NULL,
            source_origin_url TEXT,
            document_title TEXT,
            difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed')),
            persona_used TEXT NOT NULL DEFAULT 'socratic-mentor',
            target_deck TEXT NOT NULL DEFAULT 'Default',
            tags TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
      `);
      db.exec(`
        INSERT INTO flashcards (id, source_id, question, answer, source_quote, source_origin_url, document_title, difficulty, persona_used, target_deck, tags, created_at, updated_at)
        SELECT id, source_id, question, answer, source_quote, source_origin_url, document_title, difficulty, persona_used, target_deck, tags, created_at, updated_at FROM _flashcards_difficulty_old;
      `);
      db.exec("DROP TABLE _flashcards_difficulty_old;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_source_id ON flashcards(source_id);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_target_deck ON flashcards(target_deck);");
      db.exec("CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty ON flashcards(difficulty);");
    })();
  }

  // 6. Ensure jobs and job_logs tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('generation', 'sync_all', 'sync_source', 'export')),
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'completed_with_warnings', 'failed', 'cancelled')),
        title TEXT NOT NULL,
        total_steps INTEGER NOT NULL DEFAULT 1,
        current_step INTEGER NOT NULL DEFAULT 0,
        progress_percent REAL NOT NULL DEFAULT 0.0,
        current_step_name TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        result_summary TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        started_at TEXT,
        completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS job_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        step_title TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error', 'success')),
        message TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
  `);

  // Migrate job_logs table check constraint if created before 'debug' level was added
  const jobLogsTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='job_logs'").get() as { sql?: string } | undefined;
  if (jobLogsTable?.sql && !jobLogsTable.sql.includes("'debug'")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        step_title TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error', 'success')),
        message TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      INSERT INTO job_logs_new (id, job_id, step_number, step_title, level, message, details, timestamp)
        SELECT id, job_id, step_number, step_title, level, message, details, timestamp FROM job_logs;
      DROP TABLE job_logs;
      ALTER TABLE job_logs_new RENAME TO job_logs;
      CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
    `);
  }

  // 7. Ensure app_settings table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);
}

