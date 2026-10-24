# 🏛️ Flashcard Master Architecture & System Design

**Document Version:** 1.0.0  
**Target Audience:** Core Contributors, System Architects & Extension Developers  

---

## 1. Architectural Philosophy & Invariants

Flashcard Master is built on five non-negotiable core invariants:

1. **Local-First & Zero Telemetry:** All data sources, extracted articles, vector hashes, settings, and flashcards reside strictly on the user's local disk in SQLite (`~/.flashcard-master/flashcards.db`). No telemetry or user content is ever sent to external cloud servers (except direct user-configured LLM API calls).
2. **Strict Factual Grounding (Zero Hallucinations):** Every flashcard MUST cite an exact, verbatim substring from the source document. Flashcards with altered, paraphrased, or hallucinated quotes are automatically rejected by `GroundingGuard`.
3. **Ports & Adapters (Hexagonal Architecture):** Domain logic and core services are isolated from infrastructure. Database engines, LLMs, ingestion protocols, and exporters are swappable ports.
4. **Adaptive Synthesis & Density Guarantee:** When card generation is requested, the system uses oversampling and bounded backfill loops to guarantee the exact target card quota is delivered even when ungrounded drafts are discarded.
5. **Minimal Information Principle:** Questions prioritize atomic active recall, structured cognitive calibration (Beginner, Intermediate, Expert), and customizable learning personas.

---

## 2. Monorepo Package Topology

```mermaid
graph TD
    CLI["@flashcard-master/cli<br/>(Commander.js, Inquirer.js, App Context)"]
    WEB["@flashcard-master/web<br/>(Node.js REST API Server + Svelte 5 Client)"]
    ADAPTERS["@flashcard-master/adapters<br/>(Ingestion, LLMs, Exporters)"]
    CORE["@flashcard-master/core<br/>(Domain Models, Storage, Services, Ports)"]

    CLI --> CORE
    CLI --> ADAPTERS
    CLI --> WEB
    WEB --> CORE
    WEB --> ADAPTERS
    ADAPTERS --> CORE
```

### Package Responsibilities:

| Package | Role | Key Components |
| :--- | :--- | :--- |
| **`@flashcard-master/core`** | Domain Kernel & Data Access | `Flashcard`, `DataSource`, `CleanTextDocument`, `CardGenerationService`, `TextChunker`, `PromptBuilder`, `GroundingGuard`, `CardDeduplicationService`, `FlashcardRepository`, `DataSourceRepository`, `SyncStateRepository`, `DocumentRepository`, `createDatabaseClient`. |
| **`@flashcard-master/adapters`** | External Protocols & Vendor SDKs | `RssIngestionStrategy`, `WebReaderStrategy`, `LocalFileStrategy`, `EpubParser`, `SitemapIngestionStrategy`, `LlmsTxtIngestionStrategy`, `OllamaAdapter`, `OpenAIAdapter`, `GeminiAdapter`, `AnthropicAdapter`, `AnkiPackageExporter`, `AnkiConnectAdapter`, `MarkdownExporter`, `HtmlStudyGuideExporter`, `PdfStudyGuideExporter`, `CsvExporter`, `TsvExporter`. |
| **`@flashcard-master/cli`** | Headless CLI & Terminal Wizards | `createCli()`, `createAppContext()`, Interactive Setup Wizard, Commands (`init`, `source`, `sync`, `generate`, `export`, `cards`, `serve`). |
| **`@flashcard-master/web`** | Local SPA & REST Backend | `createWebServer()`, `server.ts` HTTP router, Svelte 5 single-page application (`DashboardView`, `SourcesView`, `GenerateStudio`, `QuestionExplorer`, `ExportCenter`). |

---

## 3. Detailed Subsystem Lifecycles

### 3.1 Ingestion & Document Pipeline

```mermaid
sequenceDiagram
    participant User/Timer as User / CLI / Web UI
    participant IngestionSvc as IngestionService
    participant Strategy as IngestionStrategyPort
    participant SourceRepo as DataSourceRepository
    participant SyncRepo as SyncStateRepository
    participant DocRepo as DocumentRepository

    User/Timer->>IngestionSvc: syncSource(sourceId)
    IngestionSvc->>SourceRepo: getById(sourceId)
    IngestionSvc->>SyncRepo: get(sourceId)
    IngestionSvc->>Strategy: fetch(source, lastSync)
    Strategy-->>IngestionSvc: RawDocument[]
    loop Each Raw Document
        IngestionSvc->>Strategy: extractCleanText(rawDoc)
        Strategy-->>IngestionSvc: CleanTextDocument
        IngestionSvc->>DocRepo: upsertDocument(cleanDoc)
    end
    IngestionSvc->>SyncRepo: recordSync(sourceId, itemCount, hash)
    IngestionSvc-->>User/Timer: SyncResult (newCount, totalDocuments)
```

### 3.2 AI Card Generation & Verification Pipeline

```mermaid
sequenceDiagram
    participant Studio as Generate Studio / CLI
    participant GenSvc as CardGenerationService
    participant Chunker as TextChunker
    participant Prompt as PromptBuilder
    participant LLM as LLMProviderPort
    participant Guard as GroundingGuard
    participant Dedup as CardDeduplicationService
    participant CardRepo as FlashcardRepository

    Studio->>GenSvc: generateFromDocument(doc, options)
    GenSvc->>Chunker: chunkText(doc.textContent, chunkMultiplier)
    Chunker-->>GenSvc: Chunks[] (1x, 2x, 3x, or Full Doc)
    
    loop Each Text Chunk
        GenSvc->>Prompt: buildGenerationInstructions(targetCount + 2, depthMode, difficulty)
        GenSvc->>LLM: generateQAPairs(chunk, prompt)
        LLM-->>GenSvc: CandidateDrafts[]
        GenSvc->>Guard: filterValidDrafts(CandidateDrafts, chunk)
        Guard-->>GenSvc: ValidDrafts[] (Exact Verbatim Substring Verified)
        
        opt If ValidDrafts < targetCount (Adaptive Backfill)
            loop Up to 5 Backfill Attempts
                GenSvc->>Prompt: buildGenerationInstructions(deficit + 1)
                GenSvc->>LLM: generateQAPairs(chunk, retryPrompt)
                GenSvc->>Guard: filterValidDrafts(retryDrafts, chunk)
            end
        end
    end

    GenSvc->>Dedup: filterUnique(allDrafts, existingDeckCards)
    GenSvc->>CardRepo: createBatch(uniqueCards)
    CardRepo-->>Studio: Generated Flashcards with Provenance
```

---

## 4. SQLite Database Schema & Migration Invariants

The database client uses **`better-sqlite3`** with Write-Ahead Logging (`WAL`) mode enabled. Schema migrations in [`packages/core/src/storage/db.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/core/src/storage/db.ts) run automatically on boot.

### Core Tables:

```sql
-- 1. Ingestion Sources (Knowledge-First, decoupled from flashcard decks)
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

-- 2. Discovered Documents Catalog
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT,
    text_content TEXT,
    content_hash TEXT,
    word_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 3. Sync State Metadata
CREATE TABLE sync_state (
    source_id TEXT PRIMARY KEY REFERENCES data_sources(id) ON DELETE CASCADE,
    last_synced_at TEXT NOT NULL,
    last_guid TEXT,
    content_hash TEXT,
    item_count INTEGER NOT NULL DEFAULT 0
);

-- 4. Flashcards Database (Deck routing designated at generation time)
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

CREATE INDEX idx_flashcards_created_at_id ON flashcards(created_at DESC, id DESC);
CREATE INDEX idx_flashcards_target_deck ON flashcards(target_deck);
CREATE INDEX idx_flashcards_difficulty ON flashcards(difficulty);

-- 5. System Settings & Credentials Store
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

---

## 5. Keyset / Cursor Pagination & Infinite Scrolling

Flashcard Master implements high-performance **keyset / cursor-based pagination** for browsing large flashcard collections in the Question Explorer:

```
Client (IntersectionObserver)  ──▶  GET /api/cards?limit=25&cursor=<base64>  ──▶  SQLite Keyset Seek
```

* **Keyset Query**: Paginated queries seek directly on the composite index `(created_at DESC, id DESC)`:
  ```sql
  WHERE ((created_at < :cursorCreatedAt) OR (created_at = :cursorCreatedAt AND id < :cursorId))
  ORDER BY created_at DESC, id DESC
  LIMIT :limit + 1;
  ```
* **Opaque Cursor**: The cursor is a compact, URL-safe base64 token encoding `{ c: createdAt, i: id }`.
* **Zero Offset Degradation**: Cursor pagination performs an $O(1)$ index seek regardless of page depth and is completely immune to page drift or duplicate items caused by concurrent card creation or deletion.
* **Backward Compatibility**: `GET /api/cards` continues to return flat `Flashcard[]` arrays when pagination parameters are omitted, and supports `offset` queries as a legacy fallback.

---

## 6. Centralized Settings & Configuration Precedence

Flashcard Master unifies application configurations through `SettingsService` in `@flashcard-master/core`. It follows a strict 3-tier precedence hierarchy:

```
SQLite app_settings  ──▶  process.env Fallback  ──▶  Hardcoded Default
```

* **Dynamic Resolvers:** Components such as `AnkiConnectAdapter` and `JobManager` accept dynamic settings resolvers, enabling instant runtime updates (e.g., changing AnkiConnect port or worker pool concurrency) without restarting the Node.js server.
* **Secret Protection:** API keys and sensitive tokens are masked when sent over REST endpoints and never output to console logs.
* **Origin Metadata:** Every configuration item tracks its effective origin (`database`, `env`, or `default`), exposed directly to the UI with visual source badges.
For a complete registry of configuration keys, see [Centralized Settings & Configuration Guide](settings-configuration.md).

---

## 7. Deck Operations & Lifecycle Management

To support flexible study workflows and prevent deck sprawl, Flashcard Master provides atomic, transactional deck manipulation utilities implemented in `FlashcardRepository`:

```
Question Explorer UI  ──▶  REST Endpoints  ──▶  FlashcardRepository (SQLite WAL Transaction)
```

* **Deck Cloning (`cloneDeck`)**:
  - `POST /api/decks/clone` (`{ sourceDeck, targetDeck }`)
  - Duplicates all cards from a source deck into a new target deck with fresh UUIDs.
  - Preserves verbatim source quotes, difficulty ratings, tags, keywords, and document origin metadata.
  - Executes inside an atomic SQLite transaction (`this.db.transaction()`), ensuring all-or-nothing execution.
* **Batch Splitting (`splitDeck`)**:
  - `POST /api/decks/split` (`{ sourceDeck, batchSize, customPrefix? }`)
  - Automatically partitions a large deck into numbered bite-sized sub-decks (e.g., `${prefix} - Part 1`, `${prefix} - Part 2`).
  - Ideal for pacing study sessions across multiple days or modules.
* **Selective Card Moving (`moveCards`)**:
  - `POST /api/decks/move-cards` (`{ cardIds, targetDeck }`)
  - Selectively relocates a chosen subset of flashcards from Question Explorer into an existing or newly created deck.
  - Updates `target_deck` and refreshes `updated_at` timestamps transactionally.

---

## 8. Exporter Architecture

Flashcard Master uses an open **`ExporterRegistry`**. Exporters implement:

```typescript
export interface ExporterPort {
  readonly format: string;
  export(cards: Flashcard[], options?: ExportOptions): Promise<ExportResult>;
}
```

* **Anki Package Exporter (`apkg`):** Builds `.apkg` SQLite bundles using `sql.js` with front/back templates, CSS styling, and Anki schema tables (`col`, `notes`, `cards`).
* **AnkiConnect Exporter (`ankiconnect`):** Communicates with running Anki Desktop instances via HTTP (`http://127.0.0.1:8765`), creating decks and calling `addNotes`.
* **Markdown Exporter (`markdown`):** Formats cards into active-recall collapsible `<details><summary>` HTML blocks.
* **HTML / Printable PDF Exporter (`html` / `pdf`):** Produces a clean 2-column printable study guide with `@media print` CSS layout, folding cut lines, and browser "Save as PDF" optimization.
* **Delimited Exporters (`csv` / `tsv`):** Exports standard RFC-4180 Anki-compatible delimited text.

### Partial, Date-Filtered & Randomized Export Engine

Flashcard Master supports granular scoping and stochastic subsampling across all export formats, the AnkiConnect live sync integration, the headless CLI, and the web interface:

1. **Card Filtering Criteria (`CardFilter`):**
   - `createdAfter` / `createdBefore`: ISO 8601 timestamp comparisons (`YYYY-MM-DDTHH:mm:ssZ` or `YYYY-MM-DD` auto-expanded to start/end of day UTC) evaluated directly against `flashcards.created_at`.
   - `limit`: Numerical upper bound capping the exported card count.
   - `shuffle`: Enables SQLite `ORDER BY RANDOM()` for true uniform stochastic subsampling when paired with `limit`.
2. **Exporter Format Independence:**
   - Because `ExportService` delegates card fetching directly to `cardRepo.list(filter)` prior to format rendering, all exporters (`apkg`, `epub`, `markdown`, `html`, `pdf`, `csv`, `tsv`) inherit date range filtering, card budget limits, and random shuffling with zero format-specific changes.
3. **REST Endpoints:**
   - `GET /api/export` & `GET /api/export/:format`: Accepts query parameters `deck`, `tag`, `after` / `createdAfter`, `before` / `createdBefore`, `limit`, and `shuffle=true`. Returns HTTP 404 with a structured error message if filter criteria match 0 cards.
   - `POST /api/ankiconnect/sync`: Accepts JSON body `{ targetDeck?, tag?, createdAfter?, createdBefore?, limit?, shuffle? }` to push scoped and randomized subsets directly to Anki Desktop.
4. **Headless CLI:**
   - `flashcard-master export <format> [--deck <name>] [--after <date>] [--before <date>] [--limit <number>] [--shuffle] [--output <path>]`
5. **Interactive UI (`ExportCenter.svelte`):**
   - "Time & Scope Filter" accordion card with one-click date range presets (*All Time*, *Last 24 Hours*, *Last 7 Days*, *Last 30 Days*, *Custom Range*), custom date pickers, card limit budget input, uniform shuffle toggle, and reactive matching cards counter.


