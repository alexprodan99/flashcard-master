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
    start_page INTEGER DEFAULT NULL,
    end_page INTEGER DEFAULT NULL,
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
    keywords TEXT NOT NULL DEFAULT '[]',
    source_locator TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_flashcards_created_at_id ON flashcards(created_at DESC, id DESC);
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

function hasUserData(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (stats.size === 0) return false;
    let testDb: Database.Database | null = null;
    try {
      testDb = new Database(filePath, { readonly: true, fileMustExist: true });
      const sourceCount = (testDb.prepare("SELECT count(*) as c FROM data_sources").get() as any)?.c ?? 0;
      const cardCount = (testDb.prepare("SELECT count(*) as c FROM flashcards").get() as any)?.c ?? 0;
      const docCount = (testDb.prepare("SELECT count(*) as c FROM documents").get() as any)?.c ?? 0;
      const settingsCount = (testDb.prepare("SELECT count(*) as c FROM app_settings").get() as any)?.c ?? 0;
      return sourceCount > 0 || cardCount > 0 || docCount > 0 || settingsCount > 0;
    } catch {
      if (testDb) {
        try {
          const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as any[];
          for (const t of tables) {
            const count = (testDb.prepare(`SELECT count(*) as c FROM "${t.name}"`).get() as any)?.c ?? 0;
            if (count > 0) return true;
          }
        } catch {}
      }
      return false;
    } finally {
      if (testDb) {
        try {
          testDb.close();
        } catch {}
      }
    }
  } catch {
    return true; // Fail-safe: if unreadable, assume it has data
  }
}

export function migrateLegacyDatabaseIfNeeded(
  legacyPath?: string,
  canonicalPath?: string
): boolean {
  const home = os.homedir();
  const defaultDir = path.join(home, ".flashcard-master");
  const actualLegacy = legacyPath || path.join(defaultDir, "flashcards.db");
  const actualCanonical = canonicalPath || path.join(defaultDir, "data.sqlite");
  const tempCanonical = `${actualCanonical}.tmp`;

  try {
    const legacyExists = fs.existsSync(actualLegacy);
    if (!legacyExists) {
      return false;
    }

    const canonicalExists = fs.existsSync(actualCanonical);
    const shouldMigrate =
      !canonicalExists ||
      (!hasUserData(actualCanonical) && hasUserData(actualLegacy));

    if (shouldMigrate) {
      const destDir = path.dirname(actualCanonical);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Clean up stale .tmp file if left over from a previous interrupted run
      if (fs.existsSync(tempCanonical)) {
        try {
          fs.unlinkSync(tempCanonical);
        } catch {}
      }

      // Safe atomic copy: copy to temporary file first
      fs.copyFileSync(actualLegacy, tempCanonical);

      // If legacy WAL/SHM files exist, copy them as well if present
      const legacyWal = `${actualLegacy}-wal`;
      const canonicalWal = `${actualCanonical}-wal`;
      if (fs.existsSync(legacyWal)) {
        try {
          fs.copyFileSync(legacyWal, `${tempCanonical}-wal`);
        } catch {}
      }

      const legacyShm = `${actualLegacy}-shm`;
      const canonicalShm = `${actualCanonical}-shm`;
      if (fs.existsSync(legacyShm)) {
        try {
          fs.copyFileSync(legacyShm, `${tempCanonical}-shm`);
        } catch {}
      }

      // If replacing an unpopulated canonical file, clean up its sidecars first
      if (canonicalExists) {
        try {
          if (fs.existsSync(canonicalWal)) fs.unlinkSync(canonicalWal);
          if (fs.existsSync(canonicalShm)) fs.unlinkSync(canonicalShm);
          fs.unlinkSync(actualCanonical);
        } catch {}
      }

      // Atomic rename from .tmp to canonical destination
      fs.renameSync(tempCanonical, actualCanonical);
      if (fs.existsSync(`${tempCanonical}-wal`)) {
        try {
          fs.renameSync(`${tempCanonical}-wal`, canonicalWal);
        } catch {}
      }
      if (fs.existsSync(`${tempCanonical}-shm`)) {
        try {
          fs.renameSync(`${tempCanonical}-shm`, canonicalShm);
        } catch {}
      }

      return true;
    }
  } catch (err) {
    if (fs.existsSync(tempCanonical)) {
      try {
        fs.unlinkSync(tempCanonical);
      } catch {}
    }
    console.warn(
      `[db] Failed to migrate legacy database from ${actualLegacy} to ${actualCanonical}:`,
      err
    );
  }

  return false;
}

export function getDefaultDatabasePath(): string {
  const home = os.homedir();
  const dir = path.join(home, ".flashcard-master");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const canonicalPath = path.join(dir, "data.sqlite");
  const legacyPath = path.join(dir, "flashcards.db");

  migrateLegacyDatabaseIfNeeded(legacyPath, canonicalPath);

  return canonicalPath;
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
    if (path.basename(dbLocation) === "data.sqlite") {
      const legacyPath = path.join(parentDir, "flashcards.db");
      migrateLegacyDatabaseIfNeeded(legacyPath, dbLocation);
    }
  }

  const db = new Database(dbLocation);

  // Enforce WAL mode (AD-3) and configure busy timeout for worker concurrency
  if (dbLocation !== ":memory:") {
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
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
            tags TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
      `);
      db.exec(`
        INSERT INTO data_sources (id, name, type, uri, tags, is_active, created_at, updated_at)
        SELECT id, name, type, uri, tags, is_active, created_at, updated_at FROM _data_sources_old;
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
      const oldCols = (db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>).map((c) =>
        c.name.toLowerCase()
      );
      const hasRaw = oldCols.includes("raw_content") ? "raw_content" : "NULL AS raw_content";
      const hasStart = oldCols.includes("start_page") ? "start_page" : "NULL AS start_page";
      const hasEnd = oldCols.includes("end_page") ? "end_page" : "NULL AS end_page";

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
            start_page INTEGER DEFAULT NULL,
            end_page INTEGER DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
      `);
      db.exec(`
        INSERT INTO documents (id, source_id, title, url, text_content, raw_content, content_hash, word_count, start_page, end_page, created_at, updated_at)
        SELECT id, source_id, title, url, text_content, ${hasRaw}, content_hash, word_count, ${hasStart}, ${hasEnd}, created_at, updated_at FROM _documents_old;
      `);
      db.exec("DROP TABLE _documents_old;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_id, url) WHERE url IS NOT NULL;");
    })();
  }

  // 4. Ensure document_title, keywords, and source_locator columns exist in flashcards table
  const cardCols = db.prepare("PRAGMA table_info(flashcards)").all() as Array<{ name: string }>;
  if (cardCols && cardCols.length > 0) {
    if (!cardCols.some((c) => c.name.toLowerCase() === "document_title")) {
      db.exec("ALTER TABLE flashcards ADD COLUMN document_title TEXT;");
    }
    if (!cardCols.some((c) => c.name.toLowerCase() === "keywords")) {
      db.exec("ALTER TABLE flashcards ADD COLUMN keywords TEXT NOT NULL DEFAULT '[]';");
    }
    if (!cardCols.some((c) => c.name.toLowerCase() === "source_locator")) {
      db.exec("ALTER TABLE flashcards ADD COLUMN source_locator TEXT NOT NULL DEFAULT '';");
    }
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
        start_page INTEGER DEFAULT NULL,
        end_page INTEGER DEFAULT NULL,
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

  // 7. Ensure raw_content, start_page, and end_page columns exist in documents table for existing databases
  const docCols = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
  if (docCols && docCols.length > 0) {
    if (!docCols.some((c) => c.name === "raw_content")) {
      try {
        db.exec("ALTER TABLE documents ADD COLUMN raw_content TEXT;");
      } catch {
        // Catch "duplicate column" or other non-fatal migration errors cleanly
      }
    }
    if (!docCols.some((c) => c.name === "start_page")) {
      try {
        db.exec("ALTER TABLE documents ADD COLUMN start_page INTEGER DEFAULT NULL;");
      } catch {
        // Catch "duplicate column" or other non-fatal migration errors cleanly
      }
    }
    if (!docCols.some((c) => c.name === "end_page")) {
      try {
        db.exec("ALTER TABLE documents ADD COLUMN end_page INTEGER DEFAULT NULL;");
      } catch {
        // Catch "duplicate column" or other non-fatal migration errors cleanly
      }
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
            keywords TEXT NOT NULL DEFAULT '[]',
            source_locator TEXT NOT NULL DEFAULT '',
            difficulty TEXT NOT NULL CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed')),
            persona_used TEXT NOT NULL DEFAULT 'socratic-mentor',
            target_deck TEXT NOT NULL DEFAULT 'Default',
            tags TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        );
      `);
      db.exec(`
        INSERT INTO flashcards (id, source_id, question, answer, source_quote, source_origin_url, document_title, keywords, source_locator, difficulty, persona_used, target_deck, tags, created_at, updated_at)
        SELECT id, source_id, question, answer, source_quote, source_origin_url, document_title, keywords, source_locator, difficulty, persona_used, target_deck, tags, created_at, updated_at FROM _flashcards_difficulty_old;
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

  // 8. Decouple target_deck from data_sources (Epic 18)
  const dsCols = db.prepare("PRAGMA table_info(data_sources)").all() as Array<{ name: string }>;
  if (dsCols && dsCols.some((c) => c.name.toLowerCase() === "target_deck")) {
    try {
      db.exec("ALTER TABLE data_sources DROP COLUMN target_deck;");
    } catch {
      // Fallback table rebuild if running on an environment without DROP COLUMN support
      try {
        db.transaction(() => {
          db.exec("ALTER TABLE data_sources RENAME TO _data_sources_drop_deck;");
          db.exec(`
            CREATE TABLE data_sources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt', 'notion')),
                uri TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
          `);
          db.exec(`
            INSERT INTO data_sources (id, name, type, uri, tags, is_active, created_at, updated_at)
            SELECT id, name, type, uri, tags, is_active, created_at, updated_at FROM _data_sources_drop_deck;
          `);
          db.exec("DROP TABLE _data_sources_drop_deck;");
        })();
      } catch {
        // Table might already be migrated
      }
    }
  }
}


