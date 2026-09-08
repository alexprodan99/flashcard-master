---
title: "Product Requirements Document: flashcard-master"
status: "draft"
created: "2026-08-30"
updated: "2026-09-05"
---

# Product Requirements Document (PRD): flashcard-master

## 1. Product Overview & Strategic Vision

`flashcard-master` is a local-first, AI-powered knowledge extraction and spaced-repetition acceleration tool. It bridges the gap between passive consumption (reading blogs, newsletters, and documentation) and active retention by automatically transforming dynamic text streams into high-yield, atomic flashcards.

Every generated flashcard is strictly tethered to the source text via mandatory **verbatim quote citations**, completely eliminating AI hallucination and enabling rapid verification. Cards are persisted to an embedded local database and exported seamlessly to Anki (`.apkg`, AnkiConnect), active-recall Markdown, and PDF study guides.

### Success Metrics & Target SLAs
- **Onboarding & Source Setup Velocity:** A user can configure a new data source via the interactive CLI wizard or Web UI in **< 60 seconds**.
- **Zero-Touch Card Quality:** The LLM engine produces **10 high-quality, atomic cards with exact verbatim citations in 1 click**, with a target of $\ge 90\%$ card acceptance without manual edits.
- **Export Latency:** AnkiConnect push or `.apkg` generation completes in **< 2 seconds** for batches up to 500 cards.
- **Document Export Performance:** Compiling and generating a 50-document merged Markdown/HTML file or ZIP archive completes in **< 1.5 seconds**.

---

## 2. User Personas & Core User Journeys

### Primary Protagonist: Alex (Senior Software Engineer)
Alex reads technical blogs (Netflix TechBlog, ByteByteGo, HackerNews), engineering RFCs, and framework documentation. Alex wants to retain core system design trade-offs without spending hours manually typing cards into Anki.

```mermaid
journey
    title Alex's Progressive Learning Pipeline in flashcard-master
    section 1. Overview
      Views database KPIs & recent cards: 5: Alex
    section 2. Ingestion (Data Sources)
      Registers RSS feeds, multi-web URLs, & local notes: 5: Alex
      Syncs documents & tracks content hashes: 5: flashcard-master
      Prunes noisy/empty documents: 5: Alex
    section 3. Synthesis (Generate Studio)
      Selects AI provider, model, persona, & sources: 5: Alex
      Synthesizes grounded Q&A with verbatim citations: 5: flashcard-master
    section 4. Curation & Study (Question Explorer)
      Searches knowledge base & inspects source quotes: 5: Alex
      Performs active-recall testing & inline edits: 5: Alex
    section 5. Deliverables (Export & Knowledge Base)
      Pushes to Anki desktop or downloads .apkg / markdown: 5: Alex
      Exports clean merged/split documents with TOC & citations: 5: Alex
```

### Core User Journeys (UJ)

#### UJ-1: Zero-Friction Setup via Interactive Wizard & Dashboard
1. Alex launches Flashcard Master and views the Dashboard overview displaying database statistics, deck breakdowns, and recent cards.

#### UJ-2: Data Sources Ingestion & Content Tracking
1. Alex navigates to **🌐 Data Sources** (the second menu stage) to register subscribed RSS feeds, multi-URL web article collections, or local Markdown directories.
2. Alex clicks "Sync" to ingest clean, reader-mode documents into local storage while tracking delta hashes to prevent duplication.

#### UJ-3: In-Browser AI Card Generation Studio
1. Alex navigates to **⚡ Generate Studio** (the third menu stage) to synthesize flashcards from the ingested materials.
2. Alex selects the AI Provider (Ollama, Gemini, OpenAI, Anthropic), configures the model (with smart 2026 presets or custom text overrides), chooses a cognitive persona (`socratic-mentor`, `strict-examiner`, `analogy-builder`), and checks the target data sources or specific documents.
3. Alex clicks "Start AI Generation", watching real-time spinner feedback as cards are synthesized, verified against verbatim grounding citations, and deduplicated into SQLite.

#### UJ-4: Visual Exploration, Search & Active-Recall Practice
1. Alex navigates to **🗂️ Question Explorer** (the fourth menu stage) to browse the generated knowledge base.
2. Alex searches by keyword, filters with interactive deck/tag/difficulty chips, tests knowledge using click-to-reveal answer cards, and performs inline edits via the slide-over drawer.

#### UJ-5: Multi-Target Export & Spaced Repetition Study
1. Alex navigates to **🚀 Export & Anki** (the final menu stage) to deliver flashcards to external study environments.
2. Alex 1-clicks "Push to Anki Desktop" via live AnkiConnect, or downloads `.apkg`, active-recall Markdown (`<details>` blocks), CSV, or printable two-column HTML study sheets.

#### UJ-6: Multi-URL Web Curation & Document Management
1. Alex creates a curated Web Source (e.g. "Distributed Systems Deep Dives") and pastes a list of 5 URLs into the interactive URL Manager.
2. Alex reviews the individual URL badges, removes a duplicate URL, and clicks "Save & Sync".
3. Alex opens the **Document Inspector**, selects 2 empty or outdated articles using row checkboxes, and clicks "Delete Selected (2)" to clean up the source without affecting any previously generated flashcards.

#### UJ-7: Document Knowledge Base Export with Table of Contents
1. Alex wants to export all cleaned articles from a technical documentation source to read offline on an e-reader or Obsidian.
2. Alex opens the Document Inspector, clicks **"📤 Export Documents"**, chooses **Markdown** format and **Merged (Single File)** mode.
3. Alex downloads a formatted master `.md` file complete with an auto-generated Table of Contents, divider sections, word counts, and origin URL citations. Alternatively, Alex selects **Split (ZIP Archive)** to download individual slugified markdown files.

---

## 3. Functional Requirements (FRs)

### 3.1 Data Ingestion & Strategy Engine

| Requirement ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-101** | **Ingestion Strategy Interface** | The system MUST implement a modular Strategy Pattern (`IngestionStrategy`) decoupling source fetching from card generation. | Critical |
| **FR-102** | **RSS/Atom Feed Strategy** | The system MUST parse RSS and Atom XML feeds, extract post content, publication dates, and unique GUIDs. | High |
| **FR-103** | **Web Article Strategy** | The system MUST fetch arbitrary HTTP/HTTPS web URLs and extract clean article text in reader mode (stripping boilerplate, navigation, ads). | High |
| **FR-104** | **Local Document Strategy** | The system MUST ingest local files and directories (supporting `.md`, `.txt`, `.markdown`) matching configurable glob patterns. | High |
| **FR-105** | **Incremental Delta Sync** | The system MUST track processed article GUIDs and file SHA-256 hashes in `sync_state` table to prevent re-processing identical content. | High |
| **FR-106** | **Database Source Registry** | The system MUST store data sources in a local SQLite database with editable metadata (name, type, URI, target deck, default tags, sync status). | Critical |
| **FR-107** | **XML Sitemap Ingestion Strategy** | The system MUST support XML sitemaps (both `<urlset>` and `<sitemapindex>`), discover nested URLs with optional path/glob filtering, and ingest clean reader-mode text in parallel. | High |
| **FR-108** | **LLMs.txt / Markdown Catalog Strategy** | The system MUST parse machine-readable `/llms.txt` and `/llms-full.txt` catalogs, extracting canonical URLs, topic categories, and summaries. | High |
| **FR-109** | **Persistent Discovered Documents Catalog** | The system MUST persist all discovered documents/articles per data source in a dedicated `documents` table (`id`, `source_id`, `title`, `url`, `text_content`, `content_hash`, `word_count`, `created_at`, `updated_at`). | Critical |
| **FR-110** | **Document Word Count & Freshness Tracking** | The system MUST compute word counts and track last updated timestamps for all discovered documents during sync cycles. | High |
| **FR-111** | **Multi-URL Web Source Storage & Ingestion** | The system MUST support storing multiple target URLs per `web` data source in `data_sources.uri` (as a JSON array string `["https://url1", "https://url2"]` or backward-compatible single string) allowing users to curate batches of articles under a single logical source. | Critical |
| **FR-112** | **Smart URL Bulk-Paste & Deduplication Parser** | The system MUST parse multiline, comma-separated, or space-separated URLs, validating HTTP/HTTPS protocols, stripping trailing slashes, and deduplicating inputs upon ingestion setup. | High |
| **FR-113** | **Concurrent Multi-URL Reader Ingestion** | `WebReaderStrategy` MUST ingest all configured URLs in parallel (concurrency limit = 3–5) with isolated error handling per URL, creating or updating a `Document` record per unique URL under that source. | High |
| **FR-114** | **Single & Batch Document Deletion API** | The backend MUST expose `DELETE /api/documents/:id` and `POST /api/documents/bulk-delete` (`{ documentIds: string[] }`) to permanently prune unwanted document records from the `documents` table. | High |
| **FR-115** | **Non-Destructive Flashcard & Study Preservation** | Deleting documents MUST NOT delete or corrupt associated flashcards; flashcards MUST retain their `documentTitle`, `sourceOriginUrl`, `sourceQuote`, and `targetDeck` references so study decks and Anki notes remain 100% operational. | Critical |

### 3.2 Grounded Q&A Generation Engine

| Requirement ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-201** | **Atomic Front/Back Cards** | The engine MUST generate concise, atomic Front/Back Q&A flashcards following the Minimum Information Principle (1 concept per card). | Critical |
| **FR-202** | **Verbatim Citation Guard** | Every generated card MUST include the exact source sentence/quote it was derived from. Cards lacking verifiable source quotes MUST be rejected. | Critical |
| **FR-203** | **Configurable Difficulty** | The system MUST support configurable difficulty levels (`beginner`, `intermediate`, `expert`) modifying the cognitive depth of generated questions. | Medium |
| **FR-204** | **Selectable Prompt Personas** | The system MUST support selectable generation personas (`socratic-mentor`, `strict-examiner`, `executive-synthesizer`) and allow custom persona prompts. | Medium |
| **FR-205** | **Auto-Commit to Database** | Generated flashcards MUST be automatically committed directly to the database with source foreign key, difficulty, tags, and timestamps. | Critical |
| **FR-206** | **Question Deduplication** | `[ASSUMPTION]` The system SHOULD calculate text similarity or concept overlap to filter out duplicate questions generated from adjacent sources. | Low |
| **FR-207** | **Document Provenance & Material Reference** | Generated flashcards MUST retain rich material references (Document Title, Origin URL, Section / Topic Tag) presented in the Explorer, Editor Drawer, and exported files. | Medium |
| **FR-208** | **Configurable Question Depth & Granularity** | The generation engine MUST support selectable card depth modes (`atomic`: rapid 1-fact recall, `deep-dive`: comprehensive multi-concept mechanisms, tradeoffs and structured explanations, `scenario`: applied architectural / troubleshooting case studies). | High |
| **FR-209** | **Configurable Document Context Chunk Sizing** | The text chunking engine MUST support adjustable chunk size multipliers (`1x` 2,000 chars, `2x` 4,000 chars, `4x` 8,000 chars, or `full-document` mode) allowing macro-level cross-section synthesis for long articles. | High |
| **FR-210** | **Card Depth Prompt Calibrations** | Prompt templates MUST dynamically adapt active-recall formatting and conciseness rules based on the selected depth mode while strictly enforcing verbatim quote grounding. | High |
| **FR-211** | **Mixed Difficulty Level & Adaptive Synthesis** | The generation engine and domain schema MUST support a `mixed` difficulty option in addition to `beginner`, `intermediate`, and `expert`. When selected, prompts MUST instruct LLMs to generate a balanced progression of difficulty levels across the study material, tagging each card appropriately. | High |

### 3.3 Multi-Target & Knowledge Base Exporter Pipeline

| Requirement ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-301** | **Native Anki Package (.apkg)** | The system MUST generate valid `.apkg` files containing front/back card templates, custom CSS styling, tags, and source metadata fields. | Critical |
| **FR-302** | **AnkiConnect Live Sync** | The system MUST support pushing cards directly into desktop Anki via the AnkiConnect HTTP API (`http://localhost:8765`). | High |
| **FR-303** | **Delimited File Export** | The system MUST export flashcards to standard Anki-compatible CSV and TSV formats. | Medium |
| **FR-304** | **Active-Recall Markdown** | The system MUST export cards as Markdown files utilizing collapsible HTML `<details><summary>Question</summary>Answer & Quote</details>` tags. | High |
| **FR-305** | **PDF Study Guide** | The system MUST export cards into a structured, printable 2-column Q&A PDF study sheet with citation callouts. | Medium |
| **FR-306** | **Scoped Export Filtering** | The system MUST allow filtering exports by specific data source, tag, difficulty level, or creation date range. | High |
| **FR-307** | **Document Clean Text Exporters (MD, HTML, TXT, JSON)** | The export engine (`DocumentExportService`) MUST support exporting clean document texts to Markdown (`.md`), HTML (`.html`), Plain Text (`.txt`), and JSON (`.json`). | Critical |
| **FR-308** | **Merged Single-File Compilation with Table of Contents & Citations** | The system MUST support compiling multiple documents into a single master file featuring a clickable Table of Contents, header dividers, word count badges, and origin URL citation links. | High |
| **FR-309** | **Split ZIP Archive Bundling** | `[ASSUMPTION]` The system MUST support packaging individual exported documents into a downloadable `.zip` archive named with clean slugified filenames (e.g. `01-getting-started.md`) using `jszip`. | High |
| **FR-310** | **Document EPUB eBook Exporter** | The system MUST support exporting documents into valid EPUB 3.0 eBooks (`.epub`) with metadata packaging (`content.opf`, `mimetype`, `toc.ncx` / `nav.xhtml`), e-reader clean styling, chapter navigation, and embedded local image assets. | High |

### 3.4 Dual User Interface (CLI & Web UI)

| Requirement ID | Title | Description | Priority |
| :--- | :--- | :--- | :--- |
| **FR-401** | **Interactive CLI Setup Wizard** | The CLI MUST provide an interactive terminal wizard (`flashcard-master config init` / `source add -i`) with keyboard navigation. | High |
| **FR-402** | **Scriptable CLI Subcommands** | The CLI MUST provide non-interactive subcommands (`source`, `sync`, `export`, `cards`, `config`) for headless scripting. | High |
| **FR-403** | **Progressive 4-Step Web UI Pipeline** | The system MUST serve a lightweight local web dashboard (`flashcard-master serve` on `localhost:3000`) structured with a Central Dashboard Overview 📊 and a chronological 4-Step Learning Pipeline: **1. Ingest Sources 🌐 $\rightarrow$ 2. Generate Studio ⚡ $\rightarrow$ 3. Question Explorer 🗂️ $\rightarrow$ 4. Export & Anki 🚀**. | High |
| **FR-404** | **UI Sources Management** | The Web UI MUST allow users to add, edit, toggle, and trigger manual sync on data sources with live progress feedback. | High |
| **FR-405** | **UI Question Explorer & Editor** | The Web UI MUST provide a searchable card database with keyword search, filter chips, and inline card editing. | High |
| **FR-406** | **UI 1-Click Export & Anki Center** | The Web UI MUST offer 1-click downloads for `.apkg`, Markdown, PDF, and 1-click Push to running AnkiConnect. | High |
| **FR-407** | **UI AI Generation Studio** | The Web UI MUST provide an in-browser generation studio with provider switching (Ollama, Gemini, OpenAI, Anthropic), smart model defaults, and custom model text overrides. | Critical |
| **FR-408** | **UI Multi-Source Scope Selector** | The Web UI MUST provide an interactive multi-source checkbox list with type badges, master "Toggle All" control, and real-time selection counter to selectively synthesize cards from any subset of sources. | High |
| **FR-409** | **UI Secure API Key Input** | The Web UI MUST allow optional in-browser API key entry for cloud LLM providers with automatic fallback to server environment variables. | Medium |
| **FR-410** | **UI Live Generation Feedback** | The Web UI MUST display real-time spinning state during generation, followed by metric reporting (cards created, duplicates skipped, ungrounded rejected) and card previews. | High |
| **FR-411** | **Svelte 5 Reactive Client Architecture** | The Web UI MUST be architected with Svelte 5 single-file components and reactive runes ($state, $derived), compiled via Vite into static client assets served locally by the Node.js backend server with zero Virtual DOM overhead. | High |
| **FR-412** | **UI & CLI Sitemap Source Configuration** | The Web UI (Add Source Modal, Sources View) and CLI (`source add`) MUST support registering and syncing `sitemap` and `llms-txt` source types with optional URL path filtering and batch progress feedback. | High |
| **FR-413** | **Question Explorer Bulk Deletion** | The Question Explorer MUST provide multi-card selection checkboxes, a "Select All" toggle, a selected item counter badge, and bulk-delete API support (`POST /api/cards/bulk-delete`) with user confirmation. | High |
| **FR-414** | **Data Sources Dashboard & Document Catalog Inspector** | The Web UI MUST provide an interactive document catalog inspector per data source, displaying total discovered document count, search/filter, word counts, and card generation stats. | High |
| **FR-415** | **Document Clean Text Preview & Selective Generation** | The Web UI MUST allow users to view extracted clean text for any discovered document and selectively trigger flashcard generation for specific chosen documents. | High |
| **FR-416** | **CLI Discovered Document Inspection** | The CLI MUST provide `flashcard-master source docs <source-id>` to list all discovered articles with titles, URLs, and word counts from the terminal. | Medium |
| **FR-417** | **Hierarchical Multi-Level Scope Tree** | The Generate Studio MUST provide an interactive hierarchical scope tree allowing users to toggle whole data sources OR expand sources to individually select/deselect specific discovered documents with tri-state checkbox logic and live document selection counters. | High |
| **FR-418** | **Lazy Accordion Document Catalog & Search Filter** | The Generate Studio MUST lazy-load discovered documents when a data source accordion is expanded and provide an in-accordion search input to filter documents by title/keyword. | High |
| **FR-419** | **Document Text Preview in Generate Studio** | The Generate Studio MUST allow users to preview clean extracted text for any document directly within the scope selector via an inline `👁️ Preview` action without navigating away. | High |
| **FR-420** | **Document-Level In-Context Full Configuration Modal** | The Data Sources Document Inspector MUST provide a "⚡ Configure & Generate" action opening a comprehensive configuration modal with full access to AI engine, model, persona, difficulty, depth mode, chunk multiplier, and target deck. | High |
| **FR-421** | **Deep-Link Scope Pre-selection via URL Parameters** | The Generate Studio MUST support deep-linking via query parameters (e.g., `?docId=<id>` or `?sourceId=<id>`) to automatically expand the target source, pre-select the document, and highlight it on mount. | Medium |
| **FR-422** | **Interactive URL List Manager in UI & Modals** | The Web UI (`AddSourceModal` and Source Edit view) MUST provide an interactive URL manager with single-item add (`Enter` or button), smart bulk-paste breakdown, per-item deletion (`✕`), duplicate warnings, and live URL counter badge. | High |
| **FR-423** | **Incremental Web Source Synchronization** | When a user adds new URLs to an existing web source, syncing MUST fetch only newly added/modified URLs without re-scraping unchanged existing documents. | High |
| **FR-424** | **Document Catalog Bulk Selection & Deletion Controls** | `SourceDocumentInspector` MUST provide row-level checkboxes, a "Select All" toggle, a selected counter badge, a single-item delete action (`🗑️`), and a "Delete Selected" bulk button with a confirmation modal. | High |
| **FR-425** | **Document Inspector Quick Filter Selectors** | The Document Inspector MUST provide quick selection filters (e.g. "Select All", "Select Unused (0 cards)", "Invert Selection") to quickly clean up noisy or empty scraped pages. | Medium |
| **FR-426** | **Document Export Modal & Scope Controls** | `SourceDocumentInspector` and Document Preview Modal MUST provide an "📤 Export Documents" action allowing users to select format (MD/HTML/TXT/JSON), packaging mode (Merged Master File vs. Split ZIP), and scope (All Documents, Selected Documents, or Current Document). | High |
| **FR-427** | **Streaming Download & File Handlers** | The backend MUST stream exported document files or ZIP archives with appropriate `Content-Disposition` and `Content-Type` headers for direct browser downloads. | High |
| **FR-428** | **Question Explorer Real-Time Refresh Action** | The Question Explorer MUST provide a dedicated "🔄 Refresh" action in its filter toolbar with active loading animation and disabled state, allowing users to reload flashcard catalog changes without reloading the web application or losing active filter parameters. | High |
| **FR-429** | **Interactive Local File Picker & Drag-and-Drop** | The Web UI (Add/Edit Source Modal) MUST provide an interactive file chooser and drag-and-drop zone for local source configuration, uploading local files (`.md`, `.markdown`, `.txt`) directly to the local server, eliminating error-prone manual typing of absolute filesystem paths while preserving optional manual entry. | High |

---

## 4. Non-Functional Requirements (NFRs)

### 4.1 Performance & Latency
- **NFR-101:** Reader-mode text extraction from standard web articles (< 3,000 words) MUST complete in **< 3 seconds**.
- **NFR-102:** Local database queries (searching across 10,000+ flashcards) MUST return results in **< 100 milliseconds**.

### 4.2 Privacy & Local-First Invariants
- **NFR-201:** All configurations, source URLs, content caches, and generated cards MUST reside exclusively on the user's local disk in SQLite.
- **NFR-202:** No telemetry, tracking, or user content MUST ever be transmitted to external servers (except direct user-configured LLM API calls).

### 4.3 Reliability & Resilience
- **NFR-301:** Ingestion network failures (e.g. timeout on an RSS feed) MUST fail gracefully per-source without crashing the overall sync batch.
- **NFR-302:** Database writes MUST be transactional to prevent orphaned or partially generated card records.

### 4.4 Portability & Cross-Platform Support
- **NFR-401:** The application (CLI and local Web UI) MUST operate consistently across Windows, macOS, and Linux environments.

---

## 5. Explicit Non-Goals & Scope Boundaries (v1)

1. **No Custom Spaced Repetition Scheduler:** `flashcard-master` does not implement its own review repetition algorithm; it delegates scheduling to Anki (SM-2/FSRS).
2. **No Multimodal Data Ingestion:** Audio, video, and image OCR ingestion are excluded from v1 (text-only focus).
3. **No Complex Card Types in v1:** Cloze deletions and Multiple-Choice cards are deferred to future roadmap releases.
4. **No Multi-Tenant Cloud SaaS:** The architecture is strictly single-user, local-first.

---

## 6. Risk Assessment & Mitigations

| Risk | Impact | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **LLM Hallucinations in Q&A** | High | Low | **Mandatory Quote Grounding (FR-202):** Prompts require exact verbatim sentence extraction; validator rejects ungrounded answers. |
| **Feed / Web Scraping Breakages** | Medium | Medium | **Modular Ingestion Strategy:** Robust fallback parsers (Readability algorithm) and clear error reporting per source. |
| **AnkiConnect Inavailability** | Low | Medium | **Graceful Fallback:** If Anki desktop is not running, UI/CLI clearly alerts user and provides immediate `.apkg` file download instead. |
| **Duplicate Card Proliferation** | Medium | Medium | **Incremental Delta Sync (FR-105):** GUID and content hash checks prevent re-ingesting unmodified posts. |

