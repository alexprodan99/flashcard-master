---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validationinputDocuments:
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux/DESIGN.md
  - _bmad-output/planning-artifacts/ux/EXPERIENCE.md
---

# flashcard-master - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for `flashcard-master`, decomposing requirements from the PRD, UX Design Spines (`DESIGN.md` & `EXPERIENCE.md`), and Architecture Spine (`ARCHITECTURE-SPINE.md`) into implementable user stories with testable Acceptance Criteria (AC).

---

## Requirements Inventory

### Functional Requirements

- **FR-101**: Ingestion Strategy Interface & Pluggable Architecture (Strategy Pattern decoupling source fetching from card generation).
- **FR-102**: RSS/Atom Feed Strategy (Parse RSS/Atom XML feeds, extract post content, publication dates, and unique GUIDs).
- **FR-103**: Web Article Strategy (Fetch arbitrary HTTP/HTTPS web URLs and extract clean article text in reader mode).
- **FR-104**: Local Document Strategy (Ingest local files and directories matching `.md`, `.txt`, `.markdown` globs).
- **FR-105**: Incremental Delta Sync (Track processed article GUIDs and file SHA-256 hashes in `sync_state` to prevent duplicate processing).
- **FR-106**: Database-Backed Source Registry (Store data sources in local SQLite database with editable metadata, tags, and target deck).
- **FR-107**: XML Sitemap Strategy (Discover and parallel-ingest nested URLs from sitemaps).
- **FR-108**: LLMs.txt Catalog Strategy (Parse structured llms.txt markdown catalogs and summaries).
- **FR-109**: Persistent Discovered Documents Catalog (Store all discovered articles per source in `documents` table with word counts).
- **FR-110**: Document Word Count & Freshness Tracking (Compute word counts and timestamps during sync cycles).
- **FR-111**: Multi-URL Web Source Storage & Ingestion (Store multiple URLs per `web` source in `data_sources.uri` as a JSON array string).
- **FR-112**: Smart URL Bulk-Paste & Deduplication Parser (Parse multiline/comma-separated URLs, validate HTTP/HTTPS, and deduplicate).
- **FR-113**: Concurrent Multi-URL Reader Ingestion (Fetch all configured URLs in parallel with bounded pool and error isolation).
- **FR-114**: Single & Batch Document Deletion API (`DELETE /api/documents/:id` and `POST /api/documents/bulk-delete`).
- **FR-115**: Non-Destructive Flashcard & Study Preservation (Deleting documents prunes raw text while keeping 100% of flashcards intact).
- **FR-116**: Notion Ingestion Strategy & Resource Detection (Auto-detect whether Notion URL or UUID is a Database or Page via `@notionhq/client`).
- **FR-117**: Notion Database Ingestion & Metadata Mapping (Delta sync via `last_edited_time`, map Title to title, select tags to document tags).
- **FR-118**: Notion Page Block Conversion & Configurable Subpage Scope (Markdown block conversion, toggle for recursive subpages as discrete docs).
- **FR-119**: Notion S3 Presigned Image Localization (Download expiring S3 image assets via `MediaService` to `.flashcard-master/media/`).
- **FR-201**: Atomic Front/Back Cards (Generate concise, atomic Front/Back Q&A flashcards following the Minimum Information Principle).
- **FR-202**: Mandatory Verbatim Citation Guard (Every card must include the exact source sentence/quote; reject ungrounded cards).
- **FR-203**: Configurable Difficulty Levels (Support `beginner`, `intermediate`, `expert` cognitive depth scaling).
- **FR-204**: Selectable Prompt Personas (Support `socratic-mentor`, `strict-examiner`, `executive-synthesizer` and custom prompts).
- **FR-205**: Auto-Commit to Database (Automatically persist generated flashcards directly to SQLite database with metadata).
- **FR-206**: Question Deduplication (Calculate text similarity / hash matching to filter out duplicate questions).
- **FR-207**: Document Provenance & Material Reference (Retain Document Title, Origin URL, and Section in cards).
- **FR-208**: Configurable Question Depth (Support `atomic`, `deep-dive`, and `scenario` depth modes).
- **FR-209**: Configurable Context Chunk Sizing (Support `1x`, `2x`, `4x`, and `full-document` context multipliers).
- **FR-210**: Card Depth Prompt Calibrations (Dynamic active-recall prompt formatting).
- **FR-301**: Native Anki Package (`.apkg`) (Generate valid `.apkg` packages with front/back templates, CSS styling, tags, and origin metadata).
- **FR-302**: AnkiConnect Live Sync (Push cards directly to running desktop Anki via HTTP API `http://localhost:8765`).
- **FR-303**: Delimited File Export (Export flashcards to standard Anki-compatible CSV and TSV formats).
- **FR-304**: Active-Recall Markdown (Export cards as Markdown files utilizing collapsible `<details><summary>Q</summary>A & Quote</details>`).
- **FR-305**: PDF Study Guide (Export cards into a structured, printable 2-column Q&A PDF study sheet with citation callouts).
- **FR-306**: Scoped Export Filtering (Filter exports by data source, tag, difficulty level, or creation date range).
- **FR-307**: Document Clean Text Exporters (Export raw/clean document texts to Markdown, HTML, Plain Text, and JSON).
- **FR-308**: Merged Single-File Master Compilation (Compile documents into single file with clickable Table of Contents and Citations).
- **FR-309**: Split ZIP Archive Bundling (Package individual slugified document files into a `.zip` archive via `jszip`).
- **FR-401**: Interactive CLI Setup Wizard (`flashcard-master config init` / `source add -i` with keyboard arrow navigation).
- **FR-402**: Scriptable CLI Subcommands (`source`, `sync`, `export`, `cards`, `config` for automated workflows).
- **FR-403**: Local Web UI Dashboard (`flashcard-master ui` serving web app on `localhost:3000`).
- **FR-404**: UI Sources Management (Add, edit, toggle, and trigger manual sync on data sources with live progress feedback).
- **FR-405**: UI Question Explorer & Editor (Searchable card database with keyword search, filter chips, and inline card editor drawer).
- **FR-406**: UI 1-Click Export & Anki Center (1-click downloads for `.apkg`, Markdown, PDF, and 1-click Push to running AnkiConnect).
- **FR-414**: Data Sources Dashboard & Document Catalog Inspector (Browse discovered articles with word counts and card stats).
- **FR-415**: Document Clean Text Preview & Selective Generation (Preview clean text and synthesize cards for specific docs).
- **FR-417**: Hierarchical Scope Tree (Select whole sources or individual documents with tri-state selection logic).
- **FR-418**: Lazy Accordion Catalog & Search (Lazy-load discovered articles on accordion expansion with keyword search).
- **FR-419**: Document Text Preview in Generate Studio (Inline preview modal in generation scope selector).
- **FR-420**: Document-Level In-Context Full Configuration Modal (Configure AI parameters directly from Document Inspector).
- **FR-421**: Deep-Link Scope Pre-selection via URL Parameters (`?docId=<id>` and `?sourceId=<id>`).
- **FR-422**: Interactive URL List Manager UI (Dynamic chip list, smart bulk-paste, per-item delete, duplicate warning in Add Source modal).
- **FR-423**: Incremental Web Source Synchronization (Fetch newly added URLs without re-scraping existing documents).
- **FR-424**: Document Catalog Bulk Selection & Deletion Controls (Row checkboxes, "Select All", selected counter, bulk delete modal).
- **FR-425**: Document Inspector Quick Filter Selectors ("Select All", "Select Unused (0 cards)", "Invert Selection").
- **FR-426**: Document Export Modal & Scope Controls (Export modal supporting format selection, merged vs. split, and document scope).
- **FR-427**: Streaming Download & File Handlers (Direct browser download with Content-Disposition headers).
- **FR-428**: Question Explorer Real-Time Refresh Action (Preserve active filters while fetching latest card state).
- **FR-429**: Interactive Local File Picker & Drag-and-Drop (Upload local Markdown/text files directly into server).
- **FR-430**: Svelte 5 Shared State Modules & LocalStorage Retention (Decoupled reactive stores in `.svelte.ts`).
- **FR-431**: Two-Way URL & Browser History Navigation Sync (History API sync for seamless back/forward navigation).
- **FR-432**: Unified Worker Thread Task Queue with Concurrency Pools (Node.js worker threads with bounded pools).
- **FR-433**: Centralized SQLite Main-Thread Custodian (Zero `SQLITE_BUSY` contention by serializing DB writes on main thread).
- **FR-434**: Persistent Step-by-Step Logging Sessions (SQLite `jobs` and `job_logs` execution tracking).
- **FR-435**: Real-Time Server-Sent Events (SSE) Streaming & Cancellation (Live job and log streaming).
- **FR-436**: Task Center Slide-Over Drawer with Step Accordions (Drawer with active jobs, step logs, and history).
- **FR-437**: Action Hardening & Immediate Button Disabling (Loading spinners and anti-double-click protection).
- **FR-438**: CLI & Server Concurrency Pool Flags (Configurable worker pool caps).
- **FR-439**: Persistent SQLite Settings & Secrets Store (`app_settings` key-value store with `.env` fallback chain).
- **FR-440**: Secrets Management REST API with Value Masking (Endpoints returning masked credentials e.g. `sk-...4a12`).
- **FR-441**: Live Provider Connection Verification Endpoints (`POST /api/settings/keys/test` for Notion and LLMs).
- **FR-442**: Integrations & Secrets Dashboard UI (Dedicated "⚙️ Settings & Integrations" view/tab in Web UI).
- **FR-443**: Zero-Friction Token Auto-Injection (Generate Studio and workers automatically retrieve active credentials).
- **FR-444**: Interactive Notion Source Configuration UI (Add/Edit Source modal with Notion URL validator and recursion toggle).
- **FR-211**: Provider-Native Structured Output Enforcement (Gemini responseSchema, OpenAI strict json_schema, Anthropic forced tools, Ollama format).
- **FR-212**: Polymorphic Zod Dialect Compiler (Translates core Zod schema to provider-specific schema definitions and embeds .describe() prompt guidelines).
- **FR-213**: Enriched Flashcard Learning Facets (keywords: string[] and sourceLocator: string added to domain models, database schema, and Question Explorer UI).
- **FR-214**: Progressive SSE Card Streaming & Partial Token-Cutoff Retention (Emit validated cards incrementally via SSE into Task Center; gracefully harvest and commit partial cards with warning notifications upon hitting token limits).
- **FR-215**: Complete Elimination of Legacy String Sanitization (Remove regex cleaners, fence strippers, quote heuristics, and syntax repair retries from adapters).

### Non-Functional Requirements

- **NFR-101**: Performance & Latency (Reader-mode extraction < 3s for < 3,000 words; generation of 10 cards < 15s; database queries < 100ms; document export < 1.5s).
- **NFR-103**: Background Task Queue Latency (Task submission acknowledges and returns `{ jobId }` in < 50ms).
- **NFR-104**: Provider Verification Latency (Provider "Test Connection" pings respond in < 3 seconds).
- **NFR-201**: Privacy & Local-First Invariant (All configurations, source URLs, content caches, and generated cards reside exclusively in local SQLite).
- **NFR-202**: Zero Telemetry (No telemetry, tracking, or content transmitted externally except direct user-configured LLM API calls).
- **NFR-203**: Zero-Telemetry Secrets Security & Local-Only Storage (Secrets reside exclusively in local SQLite; never exposed unmasked).
- **NFR-301**: Reliability & Fault Isolation (Network/parsing failures on an individual source or URL do not crash the overall sync batch).
- **NFR-302**: Transactional Integrity (Database writes are atomic with SQLite WAL mode).
- **NFR-303**: Zero Lock Contention (Main thread acts as sole SQLite writer for worker threads, eliminating `SQLITE_BUSY`).
- **NFR-304**: Fault-Tolerant Partial Success (Step errors record warnings/errors without crashing remaining multi-document batches).
- **NFR-401**: Cross-Platform Compatibility (CLI and local Web UI operate consistently across Windows, macOS, and Linux).

### Additional Requirements (from Architecture)

- **ARCH-1**: Monorepo Scaffolding (Turborepo / npm workspaces with `packages/core`, `packages/adapters`, `packages/cli`, `packages/web`).
- **ARCH-2**: Ports & Adapters Isolation (Core domain imports zero external drivers or vendor SDKs; all I/O via ports).
- **ARCH-3**: Strategy Pattern Registry (`StrategyRegistry` managing `RssStrategy`, `WebReaderStrategy`, `LocalFileStrategy`, `SitemapStrategy`, `LlmsTxtStrategy`, `NotionStrategy`).
- **ARCH-4**: Embedded SQLite Database Client (better-sqlite3 / sqlite3 with WAL mode and foreign key constraints).
- **ARCH-5**: Vendor-Neutral LLM Provider Adapters (OpenAI, Anthropic, Gemini, Ollama adapters implementing `LLMProviderPort`).
- **ARCH-6**: Multi-Target Exporter Adapters (`ApkgExporter`, `AnkiConnectAdapter`, `MarkdownExporter`, `PdfExporter`, `DocumentExportService`).
- **ARCH-7**: Centralized Secrets & Integrations Service (`SettingsService`, `SqliteSettingsRepository`, fallback chain, UI key masking).
- **ARCH-8**: Notion Ingestion Adapter (`NotionStrategy` via `@notionhq/client`, S3 media localization via `MediaService`).

### UX Design Requirements (from DESIGN.md & EXPERIENCE.md)

- **UX-DR1**: Visual Design System & Tokens (Dark slate `#0f172a` primary theme, light theme, typography scale, 8pt spacing grid).
- **UX-DR2**: Flashcard Visual Anatomy (Front/back layout, status badges, and highlighted verbatim source quote callout block).
- **UX-DR3**: Sources Manager Interface (Table of active feeds/paths, status badges, and Add Source modal with type selector).
- **UX-DR4**: Question Explorer & Filter Bar (Real-time full-text search, source filter chips, difficulty badges, and card grid).
- **UX-DR5**: Inline Card Editor Slide-over Drawer (Edit question, answer, tags, and difficulty without navigating away).
- **UX-DR6**: 1-Click Export & Anki Center (Real-time AnkiConnect status badge `🟢 Anki Ready` / `⚪ Anki Offline`, format selector).
- **UX-DR7**: Keyboard Shortcuts (Global shortcuts `⌘K` / `/` search, `s` sync, `j/k` card navigation, `Enter` edit, `Esc` close).
- **UX-DR8**: Accessibility & Focus Management (WCAG 2.1 AA compliant color contrast, focus traps on modals/drawers).

---

### FR Coverage Map

- **FR-101**: Epic 1 - Ingestion Strategy Interface & Pluggable Architecture
- **FR-102**: Epic 1 - RSS/Atom Feed Ingestion Strategy
- **FR-103**: Epic 1 - Web Article Ingestion Strategy (Reader-mode)
- **FR-104**: Epic 1 - Local Document Ingestion Strategy
- **FR-105**: Epic 1 - Incremental Delta Synchronization
- **FR-106**: Epic 1 - Database-Backed Source Registry
- **FR-107**: Epic 9 - XML Sitemap Ingestion Strategy
- **FR-108**: Epic 9 - LLMs.txt Catalog Ingestion Strategy
- **FR-109**: Epic 10 - Persistent Discovered Documents Catalog
- **FR-110**: Epic 10 - Document Word Count & Freshness Tracking
- **FR-111**: Epic 12 - Multi-URL Web Source Storage & Ingestion
- **FR-112**: Epic 12 - Smart URL Bulk-Paste & Deduplication Parser
- **FR-113**: Epic 12 - Concurrent Multi-URL Reader Ingestion
- **FR-114**: Epic 12 - Single & Batch Document Deletion API
- **FR-115**: Epic 12 - Non-Destructive Flashcard & Study Preservation
- **FR-201**: Epic 2 - Atomic Front/Back Flashcard Generation
- **FR-202**: Epic 2 - Mandatory Verbatim Citation Guard
- **FR-203**: Epic 2 - Configurable Difficulty Levels
- **FR-204**: Epic 2 - Selectable & Customizable Prompt Personas
- **FR-205**: Epic 2 - Auto-Commit to Database
- **FR-206**: Epic 2 - Question Deduplication
- **FR-207**: Epic 7 - Document Provenance & Material Reference
- **FR-208**: Epic 8 - Configurable Question Depth & Granularity
- **FR-209**: Epic 8 - Configurable Document Context Chunk Sizing
- **FR-210**: Epic 8 - Card Depth Prompt Calibrations
- **FR-301**: Epic 3 - Native Anki Package (.apkg) Exporter
- **FR-302**: Epic 3 - Live Desktop AnkiConnect Integration
- **FR-303**: Epic 3 - Delimited File Export (CSV/TSV)
- **FR-304**: Epic 3 - Active-Recall Markdown Exporter
- **FR-305**: Epic 3 - Printable PDF Study Guide Exporter
- **FR-306**: Epic 3 - Scoped & Filtered Exporting
- **FR-307**: Epic 12 - Document Clean Text Exporters (MD, HTML, TXT, JSON)
- **FR-308**: Epic 12 - Merged Single-File Compilation with Table of Contents & Citations
- **FR-309**: Epic 12 - Split ZIP Archive Bundling
- **FR-401**: Epic 4 - Interactive CLI Setup Wizard
- **FR-402**: Epic 4 - Scriptable CLI Subcommands
- **FR-403**: Epic 4 - Local Web UI Dashboard Server
- **FR-404**: Epic 4 - UI Sources Management
- **FR-405**: Epic 4 - UI Question Database Explorer & Inline Editor
- **FR-406**: Epic 4 - UI 1-Click Export & Anki Center
- **FR-414**: Epic 10 - Data Sources Dashboard & Document Catalog Inspector
- **FR-415**: Epic 10 - Document Clean Text Preview & Selective Generation
- **FR-417**: Epic 11 - Hierarchical Multi-Level Scope Tree
- **FR-418**: Epic 11 - Lazy Accordion Document Catalog & Search Filter
- **FR-419**: Epic 11 - Document Text Preview in Generate Studio
- **FR-420**: Epic 11 - Document-Level In-Context Full Configuration Modal
- **FR-421**: Epic 11 - Deep-Link Scope Pre-selection via URL Parameters
- **FR-422**: Epic 12 - Interactive URL List Manager in UI & Modals
- **FR-423**: Epic 12 - Incremental Web Source Synchronization
- **FR-424**: Epic 12 - Document Catalog Bulk Selection & Deletion Controls
- **FR-425**: Epic 12 - Document Inspector Quick Filter Selectors
- **FR-426**: Epic 12 - Document Export Modal & Scope Controls
- **FR-427**: Epic 12 - Streaming Download & File Handlers

## Epic 1: Project Foundation & Core Ingestion Pipeline

**Goal:** Establish the monorepo foundation, SQLite storage layer, and pluggable Strategy Pattern ingestion engine allowing users to register and sync RSS feeds, web URLs, and local files with incremental delta tracking.

### Story 1.1: Monorepo Scaffolding & SQLite Database Initialization
As a developer,  
I want a modular TypeScript monorepo with an embedded SQLite persistence layer,  
So that core domain logic, strategies, and ports remain decoupled from user interfaces.

**Acceptance Criteria:**
- **Given** an empty project directory
- **When** the monorepo scaffold is initialized
- **Then** workspaces for packages/core, packages/adapters, packages/cli, and packages/web are created with unified build and test scripts.
- **And** the SQLite database is initialized at ~/.flashcard-master/data.sqlite with WAL mode enabled and foreign keys enforced.

### Story 1.2: Data Source Registry & Ingestion Strategy Interface
As a user,  
I want a database-backed data source registry and a pluggable IngestionStrategy contract,  
So that lashcard-master can register and manage heterogeneous data sources cleanly.

**Acceptance Criteria:**
- **Given** the SQLite database is running
- **When** DataSourceRepository.createSource() is invoked with a name, type (ss | web | local), URI, and target deck
- **Then** the source is saved into the data_sources table with a unique ID and timestamps.
- **And** an IngestionStrategy interface is defined in core/ports and registered in StrategyRegistry.

### Story 1.3: RSS & Atom Feed Ingestion Strategy
As a continuous learner,  
I want the system to ingest posts from RSS and Atom XML feeds,  
So that my subscribed newsletters and technical blogs are automatically pulled for study card generation.

**Acceptance Criteria:**
- **Given** a valid RSS or Atom feed URL (e.g. Substack or HackerNews)
- **When** RssIngestionStrategy.fetch(source) is executed
- **Then** all unread feed items are parsed into RawDocument objects containing title, HTML content, publication date, and unique item GUID.
- **And** feed parsing errors fail gracefully without crashing the overall sync batch.

### Story 1.4: Web Article Reader-Mode Extraction Strategy
As a software engineer,  
I want to ingest single web article URLs with boilerplate and navigation stripped out,  
So that clean article text is extracted for accurate Q&A generation.

**Acceptance Criteria:**
- **Given** a web page URL (e.g. a blog post or documentation page)
- **When** WebReaderStrategy.fetch(source) is executed
- **Then** the page HTML is fetched and processed via readability text extraction.
- **And** navigation headers, footers, ads, and scripts are removed, returning clean markdown/text under 3 seconds.

### Story 1.5: Local Document & Directory Ingestion Strategy
As a user,  
I want to ingest local Markdown and text files from my filesystem,  
So that my personal notes and local documentation become study flashcards.

**Acceptance Criteria:**
- **Given** a local directory path or glob pattern (e.g. ./notes/**/*.md)
- **When** LocalFileStrategy.fetch(source) is executed
- **Then** all matching .md, .txt, and .markdown files are recursively discovered and read into RawDocument objects.
- **And** file modification timestamps and paths are recorded.

### Story 1.6: Incremental Delta Sync & Hash Tracking
As a user,  
I want the sync engine to track previously processed articles and file checksums,  
So that syncing only processes new or updated content without generating duplicate cards.

**Acceptance Criteria:**
- **Given** an existing data source with prior sync history
- **When** IngestionService.sync(source) is triggered
- **Then** the engine checks sync_state for matching GUIDs (for RSS) or SHA-256 content hashes (for web/local files).
- **And** only new/modified documents are sent to the Q&A generation pipeline, updating sync_state.last_synced_at.

---

## Epic 2: Grounded Q&A Generation & Fact-Checking Engine

**Goal:** Implement the LLM extraction pipeline that transforms ingested clean text into atomic Front/Back flashcards with mandatory verbatim source quotes, configurable difficulty levels, selectable prompt personas, and automated persistence.

### Story 2.1: LLM Provider Port & Vendor Adapters
As a developer,  
I want a vendor-neutral LLM provider port with adapters for OpenAI, Gemini, Anthropic, and local Ollama,  
So that users can generate flashcards using their preferred AI backend without vendor lock-in.

**Acceptance Criteria:**
- **Given** an active LLM provider configuration (API key or local Ollama endpoint)
- **When** LLMProviderPort.generateQAPairs() is called with text and prompt parameters
- **Then** the request is formatted and transmitted through the respective adapter (OpenAIAdapter, GeminiAdapter, OllamaAdapter).
- **And** rate-limiting errors and network timeouts are caught and reported clearly.

### Story 2.2: Atomic Front/Back Flashcard Prompting Pipeline
As a learner,  
I want the AI engine to generate concise, single-concept Front/Back questions,  
So that every card adheres to the Minimum Information Principle for optimal memory recall.

**Acceptance Criteria:**
- **Given** a clean text document
- **When** the generation prompt is executed
- **Then** the LLM generates atomic Q&A pairs where each question tests exactly one core mechanism, concept, or trade-off.
- **And** questions with multiple sub-parts or trivia giveaways are rejected by prompt guards.

### Story 2.3: Verbatim Quote Grounding Guard & Fact Verification
As a knowledge worker,  
I want every generated flashcard to include and be verified against an exact verbatim quote from the source text,  
So that I have 100% confidence in the accuracy of my study deck without AI hallucination.

**Acceptance Criteria:**
- **Given** a generated card draft containing a proposed sourceQuote
- **When** GroundingGuard.verify(draft, originalText) is executed
- **Then** the guard checks that the quote exists verbatim (with normalized whitespace) in the source document.
- **And** cards with synthetic or altered quotes fail validation and are discarded from the database write.

### Story 2.4: Configurable Prompt Persona Studio & Difficulty Scaling
As a user,  
I want to select different prompt personas (Socratic Mentor, Technical Examiner, Executive Synthesizer) and difficulty levels,  
So that the cognitive depth of generated cards matches my learning goals.

**Acceptance Criteria:**
- **Given** a user preference for difficulty (eginner, intermediate, xpert) and persona (socratic-mentor, strict-examiner)
- **When** card generation is initiated
- **Then** the persona system prompt is injected into the LLM context.
- **And** expert difficulty produces cards focused on edge cases, system trade-offs, and failure domains.

### Story 2.5: Automated Card Persistence & Metadata Tagging
As a user,  
I want generated flashcards to be automatically committed to SQLite with source metadata,  
So that my card database is instantly available for search and export.

**Acceptance Criteria:**
- **Given** verified flashcards produced by the generation engine
- **When** the batch completes
- **Then** all cards are inserted into the lashcards table within a single SQLite transaction.
- **And** each card record stores question, nswer, source_quote, source_origin_url, difficulty, persona_used, 	arget_deck, and 	ags.

### Story 2.6: Card Deduplication & Normalized Content Filter
As a user,  
I want duplicate or near-identical questions from overlapping articles to be filtered out,  
So that my study deck remains concise and free of redundancy.

**Acceptance Criteria:**
- **Given** a newly generated question
- **When** the persistence layer checks existing cards in the target deck
- **Then** questions with matching normalized text or identical concept hashes are detected.
- **And** redundant duplicate cards are skipped during the batch commit.

---

## Epic 3: Multi-Target Exporter Suite (Anki, Markdown, PDF)

**Goal:** Build the complete exporter adapter suite enabling users to generate styled .apkg packages, push live to desktop Anki via AnkiConnect, export active-recall collapsible Markdown, and generate 2-column PDF study guides.

### Story 3.1: Native Anki Package (.apkg) Exporter
As an Anki user,  
I want to export my cards into a styled .apkg deck package,  
So that I can import and study my flashcards on Anki Mobile or Anki Desktop.

**Acceptance Criteria:**
- **Given** a collection of flashcard records
- **When** ApkgExporter.export(cards) is called
- **Then** a valid .apkg zip archive is generated containing the SQLite Anki collection and custom CSS card styling.
- **And** cards in Anki display front/back layouts with highlighted amber source quote boxes.

### Story 3.2: Desktop AnkiConnect Live Sync Client
As a power user,  
I want to push generated cards directly into my running desktop Anki application with one click,  
So that I don't have to manually download and import .apkg files.

**Acceptance Criteria:**
- **Given** desktop Anki is running with AnkiConnect enabled on localhost:8765
- **When** AnkiConnectAdapter.sync(cards) is triggered
- **Then** the client communicates with the AnkiConnect HTTP API, creating target decks and adding notes in batch.
- **And** if Anki is not running, a clear error message is returned offering .apkg download.

### Story 3.3: Delimited CSV/TSV Exporter
As a user,  
I want to export cards as CSV and TSV files,  
So that I can import cards into Quizlet, RemNote, or custom spreadsheets.

**Acceptance Criteria:**
- **Given** a filtered selection of flashcards
- **When** DelimitedExporter.export(cards, { format: 'csv' | 'tsv' }) is executed
- **Then** a properly escaped CSV/TSV file is generated with Question, Answer, Quote, and Source columns.

### Story 3.4: Active-Recall Collapsible Markdown Exporter
As an Obsidian / Markdown user,  
I want to export my flashcards as a structured Markdown file with <details> tags,  
So that I can practice active recall reading in my note-taking app.

**Acceptance Criteria:**
- **Given** a selection of flashcards
- **When** MarkdownExporter.export(cards) is executed
- **Then** a .md file is generated formatted with <details><summary>Q: [Question]</summary><p>A: [Answer]</p><blockquote>Quote: [Verbatim Quote]</blockquote></details>.

### Story 3.5: Two-Column Printable PDF Study Guide Exporter
As a student or researcher,  
I want to generate a printable 2-column Q&A PDF study guide with citation callouts,  
So that I can review and annotate concepts offline on paper or tablet.

**Acceptance Criteria:**
- **Given** a selection of flashcards
- **When** PdfExporter.export(cards) is executed
- **Then** a high-resolution PDF document is compiled with clean 2-column layouts, page numbers, and highlighted quote boxes.

### Story 3.6: Scoped Query & Filtered Export Engine
As a user,  
I want to filter my flashcard exports by source, tag, difficulty, or date range,  
So that I can create targeted decks for specific exams or study sessions.

**Acceptance Criteria:**
- **Given** filter options (e.g. --tag "kubernetes" --difficulty "expert")
- **When** ExportService.export(filters) is called
- **Then** only cards matching all query criteria are selected and passed to the chosen exporter adapter.

---

## Epic 4: Dual Presentation Layer (Interactive CLI Wizard & Web UI Dashboard)

**Goal:** Deliver the user-facing interfaces: an interactive terminal setup wizard and scriptable CLI subcommands, alongside a local visual Web UI dashboard with Sources Manager, Question Explorer, and 1-Click Export & Anki Center.

### Story 4.1: Interactive Terminal Setup Wizard & Scriptable CLI
As a command-line developer,  
I want an interactive terminal wizard and scriptable CLI subcommands,  
So that I can configure sources, trigger syncs, and export cards directly from my terminal.

**Acceptance Criteria:**
- **Given** the user runs `flashcard-master config init`
- **When** the interactive wizard opens
- **Then** arrow-key menus guide the user through provider selection, API keys, persona choices, and initial data sources.
- **And** CLI subcommands (`source add`, `sync`, `export`, `cards list`) execute headlessly with exit codes.

### Story 4.2: Local Web UI Dashboard Server & Design System Foundation
As a user,  
I want a local web dashboard served by `flashcard-master ui`,  
So that I have a beautiful visual interface for managing my knowledge base.

**Acceptance Criteria:**
- **Given** the user runs `flashcard-master ui`
- **When** the local Fastify/Vite server starts on `http://localhost:3000`
- **Then** the web app loads with dark/light theme tokens, responsive sidebar navigation, and status badges.

### Story 4.3: Sources Manager UI with Live Sync Status
As a user,  
I want a visual Sources Manager page in the Web UI,  
So that I can add RSS feeds, paste article URLs, toggle active sources, and view sync progress.

**Acceptance Criteria:**
- **Given** the user navigates to the Sources Manager tab
- **When** the user clicks "Add Source" and submits an RSS or web URL
- **Then** the source is saved to the SQLite database and rendered in the sources table.
- **And** clicking "Sync" triggers real-time progress indicators with item count feedback.

### Story 4.4: Question Explorer, Filter Chips & Visual Card Grid
As a user,  
I want to browse and search my flashcard database with filter chips and real-time search,  
So that I can explore my cards and verify their source quotes.

**Acceptance Criteria:**
- **Given** the user opens the Question Explorer tab
- **When** the user enters a search query or clicks a source filter chip
- **Then** matching flashcards are displayed in a responsive grid showing Question, Answer, highlighted quote, and metadata tags.

### Story 4.5: Inline Card Editor Slide-Over Drawer
As a user,  
I want to edit flashcard questions, answers, or tags in a slide-over drawer,  
So that I can refine card phrasing without leaving the explorer grid.

**Acceptance Criteria:**
- **Given** the user clicks "Edit" or presses Enter on a card
- **When** the slide-over edit drawer opens
- **Then** the user can modify the question, answer, difficulty, or tags and click "Save".
- **And** changes are atomically committed to SQLite and instantly updated in the UI.

### Story 4.6: 1-Click Export & Anki Center & AnkiConnect Badging
As a user,  
I want a dedicated Export & Anki Center in the Web UI with live AnkiConnect detection,  
So that I can push cards to Anki or download .apkg, Markdown, and PDF files with one click.

**Acceptance Criteria:**
- **Given** the user opens the Export & Anki Center
- **When** desktop Anki is running on the machine
- **Then** the UI shows a 🟢 Anki Ready badge and enables the 1-click "Push to Anki" button.
- **And** 1-click download buttons generate and stream .apkg, Markdown, and PDF files directly to the browser.

---

## Epic 5: Interactive Web Generation Studio & In-Browser AI Workflows

**Goal:** Deliver an integrated, in-browser AI generation studio allowing users to synthesize grounded flashcards with provider switching (Ollama, Gemini, OpenAI, Anthropic), cognitive personas, multi-source scoping, and real-time progress feedback.

### Story 5.1: Web UI AI Card Generation Studio
As a learner using the Web UI,  
I want an in-browser Generation Studio interface,  
So that I can configure AI providers, choose models, select cognitive personas, and generate flashcards without terminal commands.

**Acceptance Criteria:**
- **Given** the user navigates to the "⚡ Generate Studio" tab
- **When** selecting a provider and clicking "Start AI Generation"
- **Then** the backend synthesizes flashcards using the selected model, enforces verbatim grounding citations, and deduplicates cards.
- **And** the UI displays live spinner feedback and newly generated card previews.

### Story 5.2: Multi-Source Scope Selector UI
As a learner with multiple ingested sources,  
I want to choose specific data sources to synthesize cards from,  
So that I can generate flashcards focused on particular articles or topics.

**Acceptance Criteria:**
- **Given** the Generate Studio configuration form
- **When** viewing the "Target Data Sources" section
- **Then** an interactive checkbox grid lists all active sources with type badges, master "Toggle All", and selection counter.
- **And** if no sources are selected, the UI displays a clear validation message preventing submission.

### Story 5.3: Navigation Hierarchy Alignment with Progressive Learning Pipeline
As a learner navigating the Flashcard Master Web UI,  
I want the sidebar navigation tabs to follow the chronological learning workflow: **1. Dashboard 📊 $\rightarrow$ 2. Data Sources 🌐 $\rightarrow$ 3. Generate Studio ⚡ $\rightarrow$ 4. Question Explorer 🗂️ $\rightarrow$ 5. Export & Anki 🚀**,  
So that the interface naturally guides me from data ingestion to flashcard generation, curation, and export.

**Acceptance Criteria:**
- **Given** the user accesses the Web UI dashboard
- **When** viewing the sidebar navigation
- **Then** the menu tabs are ordered: **Dashboard (`#nav-dashboard`), Data Sources (`#nav-sources`), Generate Studio (`#nav-generate`), Question Explorer (`#nav-cards`), Export & Anki (`#nav-export`)**.
- **And** clicking each tab switches to the corresponding view seamlessly and loads relevant data.
- **And** keyboard shortcut `s` navigates to Sources, `g` navigates to Generate Studio, `e` navigates to Export & Anki.

---

## Epic 6: Modern UI Migration to Svelte 5 & Component Architecture

**Goal:** Modernize the embedded Web UI dashboard by migrating from inline imperative vanilla HTML/JS string templating to a compile-time, zero-Virtual-DOM **Svelte 5** single-file component architecture with reactive runes (`$state`, `$derived`, `$props`), compiled via Vite and served locally by the Node.js backend server.

### Story 6.1: Svelte 5 & Vite Build Pipeline Setup
**ID:** `6-1-svelte-vite-build-pipeline-setup`
**Description:** Configure Vite and `@sveltejs/vite-plugin-svelte` inside `packages/web`, set up TypeScript compilation for `.svelte` components, establish `packages/web/client/` scaffold, and integrate client build into `npm run build`.
**Acceptance Criteria:**
- **Given** developer runs `npm run build` from monorepo root or `npm run build -w @flashcard-master/web`
- **When** Vite compiles `packages/web/client/`
- **Then** static HTML, JS chunks, and CSS bundle are generated in `packages/web/dist/client/`.
- **And** TypeScript type checks pass with zero errors.

### Story 6.2: Migrate Dashboard & Data Sources Views to Svelte 5
**ID:** `6-2-migrate-dashboard-and-sources-views-to-svelte`
**Description:** Implement Svelte 5 reactive components for the Root App container, Sidebar Navigation, Global Stats KPI Cards, Dashboard View, and Data Sources Manager (including Add Source Modal, Sync triggers, and delete action).
**Acceptance Criteria:**
- **Given** the Svelte client renders in browser
- **When** user views Dashboard or Data Sources tab
- **Then** KPI counters load reactively from `GET /api/stats`
- **And** Data sources list from `GET /api/sources`, with live sync triggers (`POST /api/sync`), add source modal (`POST /api/sources`), and toggle active status.
- **And** UI styling, dark theme tokens, and typography match existing design specification.

### Story 6.3: Migrate Generate Studio, Question Explorer, and Export & Anki Center to Svelte 5
**ID:** `6-3-migrate-generate-studio-question-explorer-and-export-center-to-svelte`
**Description:** Implement Svelte 5 reactive components for AI Generate Studio (with multi-source selection grid, provider presets, custom model overrides, and progress banner), Question Explorer (search bar, filter chips, card grid, and Slide-Over Card Editor drawer), and Export & Anki Center (1-click download cards and AnkiConnect live push).
**Acceptance Criteria:**
- **Given** user navigates to "⚡ Generate Studio"
- **When** user selects sources, provider, model, persona, and difficulty and clicks "Start AI Generation"
- **Then** `POST /api/generate` is triggered with reactive progress spinner, and newly created cards display in live preview banner.
- **Given** user navigates to "🗂️ Question Explorer"
- **When** user types in search or clicks deck/difficulty filter chips
- **Then** cards filter reactively, and clicking "Edit" opens the reactive slide-over drawer to update or delete cards.
- **Given** user navigates to "🚀 Export & Anki"
- **When** user clicks an export button (.apkg, Markdown, PDF, AnkiConnect)
- **Then** file downloads or AnkiConnect push triggers seamlessly.

### Story 6.4: WebServer Static Asset Delivery & End-to-End Test Suite
**ID:** `6-4-web-server-static-asset-delivery-and-e2e-tests`
**Description:** Update Node.js `WebServer` in `packages/web/src/server.ts` to serve compiled static assets from `dist/client/` with fallback to SPA routing, while maintaining all JSON REST API endpoints and ensuring 100% automated test suite coverage.
**Acceptance Criteria:**
- **Given** `flashcard-master serve` is started
- **When** browser requests `GET /` or any static asset (`/assets/*.js`, `/assets/*.css`)
- **Then** `WebServer` serves the compiled Svelte SPA with correct MIME types and cache headers.
- **And** all existing integration test suites in `packages/web/test/server.test.ts` pass with 100% success.

---

## Epic 7: XML Sitemap & LLMs.txt Multi-Article Ingestion Engine

**Goal:** Expand Flashcard Master's ingestion capabilities to ingest entire publication archives, documentation portals, and blogs by implementing pluggable **XML Sitemap** (`<urlset>` & `<sitemapindex>`) and **LLMs.txt** (`/llms.txt` & `/llms-full.txt`) strategies with recursive URL discovery, path filtering, rate-limited reader extraction, and full UI/CLI configuration.

### Story 7.1: XML Sitemap Strategy & Domain Types
**ID:** `7-1-xml-sitemap-ingestion-strategy`
**Description:** Implement `SitemapIngestionStrategy` in `packages/adapters/src/ingestion/sitemap-strategy.ts` supporting standard XML sitemaps and recursive sitemap indexes, path/glob filtering (e.g. `/blog/*`), and parallel reader-mode text extraction with concurrency control. Extend `DataSource` and `schema.sql` to support `'sitemap'` type.
**Acceptance Criteria:**
- **Given** a data source with type `sitemap` and URI (e.g. `https://example.com/sitemap.xml` or `https://example.com/sitemap-index.xml`)
- **When** `IngestionService.syncSource(id)` is triggered
- **Then** all nested sitemaps are resolved and canonical URLs extracted.
- **And** web pages are fetched in reader mode with clean text and SHA-256 hashes generated for each document.
- **And** incremental delta sync tracks ingested URLs to prevent re-fetching unchanged pages.

### Story 7.2: LLMs.txt & Markdown Catalog Strategy
**ID:** `7-2-llms-txt-ingestion-strategy`
**Description:** Implement `LlmsTxtIngestionStrategy` in `packages/adapters/src/ingestion/llms-txt-strategy.ts` supporting `/llms.txt` and `/llms-full.txt` catalogs, extracting canonical URLs, topic categories, and fetching article contents. Extend `DataSource` and `schema.sql` to support `'llms-txt'` type.
**Acceptance Criteria:**
- **Given** a data source with type `llms-txt` and URI (e.g. `https://example.com/llms-full.txt`)
- **When** `IngestionService.syncSource(id)` is triggered
- **Then** Markdown link definitions and topic headers are parsed into cataloged items.
- **And** articles are fetched, cleaned, and stored with their section topics as tags.

### Story 7.3: CLI Subcommand & Interactive Wizard Support
**ID:** `7-3-cli-sitemap-support`
**Description:** Update CLI commands (`flashcard-master source add`) and interactive setup wizard (`flashcard-master init`) to allow selecting `sitemap` and `llms-txt` types with optional URL path filtering.
**Acceptance Criteria:**
- **Given** user runs `flashcard-master source add "Tech Sitemap" sitemap "https://example.com/sitemap.xml"`
- **When** the source is created
- **Then** the record is stored in SQLite and can be synced via `flashcard-master sync <id>`.
- **And** `flashcard-master init` interactive wizard presents `sitemap` and `llms-txt` in the source type menu.

### Story 7.4: Svelte 5 Web UI Integration & E2E Validation
**ID:** `7-4-web-ui-sitemap-integration`
**Description:** Add `sitemap` and `llms-txt` options with visual type badges in `AddSourceModal.svelte`, `SourcesView.svelte`, and `GenerateStudio.svelte`. Verify end-to-end batch ingestion and card generation with automated test suites.
**Acceptance Criteria:**
- **Given** user opens "+ Add Ingestion Source" modal in Web UI
- **When** selecting "XML Sitemap" or "LLMs.txt Catalog"
- **Then** appropriate placeholder hints and fields appear.
- **And** newly created sources display `sitemap` / `llms-txt` badges and trigger live sync with progress feedback.
- **And** all unit and integration tests across all workspaces pass with 100% success.

---

## Epic 8: LLM Prompt Tuning, Adaptive Backfilling, PDF Export & Explorer Bulk Operations

**Goal:** Elevate generation reliability on local LLMs, guarantee card production targets per chunk, capture rich material provenance metadata, enable printable PDF downloads, and empower users with bulk curation actions in Question Explorer.

### Story 8.1: Prompt Tuning & Emphatic Copy-Paste Verbatim Directives
**ID:** `8-1-prompt-tuning-and-verbatim-directives`
**Description:** Refine `PromptBuilder` generation instructions with strict copy-paste directives ("CRITICAL: Copy and paste an EXACT, word-for-word sentence directly from the provided text into 'sourceQuote'. Do NOT paraphrase, edit, or summarize any words in 'sourceQuote'") and concrete few-shot JSON formatting to minimize grounding rejections on local LLMs.
**Acceptance Criteria:**
- **Given** any LLM provider invocation (Ollama, Gemini, OpenAI, Claude)
- **When** the system prompt is assembled
- **Then** unambiguous copy-paste verbatim rules are injected with strict schema constraints.
- **And** local models produce exact matching substrings without quote paraphrasing.

### Story 8.2: Adaptive Generation Backfill Loop
**ID:** `8-2-adaptive-backfill-generation-loop`
**Description:** Enhance `CardGenerationService` with intelligent oversampling (requesting `targetCount + 2` candidate cards) and a retry backfill pass to guarantee that the configured target card count per chunk (e.g. 4 cards) is consistently met even if individual ungrounded drafts fail validation.
**Acceptance Criteria:**
- **Given** a generation request for `targetCountPerChunk = 4`
- **When** 1 or 2 initial candidate drafts fail grounding verification
- **Then** the service uses oversampled candidates or executes a targeted backfill prompt to fulfill the 4-card quota.
- **And** the total returned valid cards reaches the requested target count whenever sufficient chunk content exists.

### Story 8.3: Rich Document Provenance & Material Reference
**ID:** `8-3-material-source-provenance-references`
**Description:** Ensure full source provenance metadata (Document Title, Origin URL, Section Tag, Source Type) is captured on generated cards, displayed prominently in Question Explorer and Card Editor Drawer, and included in study exports.
**Acceptance Criteria:**
- **Given** generated flashcards in SQLite
- **When** viewed in Question Explorer or the slide-over Editor Drawer
- **Then** the source document title and origin link are rendered cleanly next to the verbatim quote.
- **And** exports (Markdown, HTML study sheet, Anki) include material provenance callouts.

### Story 8.4: Printable PDF Export Support & Alias Routing
**ID:** `8-4-printable-pdf-export-support`
**Description:** Register `pdf` format alias in `ExporterRegistry` routing to the print-optimized HTML study guide exporter (`HtmlStudyGuideExporter`) with `@media print` layout and proper `Content-Disposition` headers so requesting `/api/export?format=pdf` works seamlessly without errors.
**Acceptance Criteria:**
- **Given** user triggers export with `format=pdf` (via CLI `flashcard-master export -f pdf` or UI Export Center)
- **When** the request is processed
- **Then** the backend serves the printable study sheet with appropriate headers and print styling instead of returning an "Unsupported export format" error.

### Story 8.5: Question Explorer Bulk Deletion & Multi-Selection
**ID:** `8-5-explorer-bulk-delete-operations`
**Description:** Add multi-card selection checkboxes, a "Select All" toggle, a live selected counter, and a bulk-delete endpoint (`POST /api/cards/bulk-delete` and `deleteCardsBulk(ids)`) with confirmation dialog in `QuestionExplorer.svelte`.
**Acceptance Criteria:**
- **Given** the Question Explorer view
- **When** user selects one or more cards using checkboxes or "Select All"
- **Then** a floating/top action bar displays the count of selected cards and a "🗑️ Delete Selected (N)" button.
- **And** clicking delete shows a confirmation modal, calls `POST /api/cards/bulk-delete`, removes the cards from SQLite, and updates the UI instantly.

---

## Epic 9: Configurable Question Depth, Granularity & Context Chunk Sizing

**Goal:** Allow users to choose between atomic quick-recall flashcards, comprehensive deep-dive explanations, and scenario-based architectural case studies, while providing configurable document chunk sizing (up to full-article mode) for macro-level concept synthesis.

### Story 9.1: Question Depth & Granularity Prompt Engine
**ID:** `9-1-question-depth-and-granularity-prompts`
**Description:** Extend `PromptBuilder` and domain models with selectable `depthMode` (`atomic`, `deep-dive`, `scenario`), dynamically adjusting active recall formatting, depth directives, and answer structure while strictly preserving verbatim quote grounding.
**Acceptance Criteria:**
- **Given** a generation request with `depthMode = 'deep-dive'`
- **When** the generation prompt is built
- **Then** the prompt instructs the LLM to formulate comprehensive multi-step explanations, trade-offs, and architectural mechanisms rather than 1-sentence definitions.
- **And** `depthMode = 'scenario'` instructs the LLM to generate applied situation/troubleshooting problems.
- **And** verbatim quote grounding rules remain strictly enforced across all depth modes.

### Story 9.2: Configurable Document Context Chunk Sizing & Full Document Scope
**ID:** `9-2-configurable-chunk-sizing-and-full-doc`
**Description:** Enhance `TextChunker` and `CardGenerationService` to accept configurable chunk multipliers (`1x` 2,000 chars, `2x` 4,000 chars, `3x` 6,000 chars, `5x` 10,000 chars, or `full` unchunked document mode) allowing macro-level cross-section synthesis for long articles.
**Acceptance Criteria:**
- **Given** a document of 8,000 characters
- **When** `chunkMultiplier` is set to `2x` or `full`
- **Then** `TextChunker` creates fewer, larger macro-chunks (or a single whole-document chunk).
- **And** `CardGenerationService` generates cohesive flashcards spanning cross-section concepts.

### Story 9.3: Backend REST API & CLI Support for Depth & Chunk Multipliers
**ID:** `9-3-api-and-cli-depth-controls`
**Description:** Update `POST /api/generate` in `server.ts` and `flashcard-master generate` CLI command to accept `depthMode` and `chunkMultiplier` parameters with validation and default fallbacks.
**Acceptance Criteria:**
- **Given** `POST /api/generate` with `{ depthMode: "deep-dive", chunkMultiplier: 2 }`
- **When** invoked
- **Then** the server generates cards using the calibrated depth and chunk multiplier.
- **And** `flashcard-master generate --depth deep-dive --chunk-multiplier 2` works from the terminal.

### Story 9.4: Svelte 5 Generate Studio UI Controls & E2E Validation
**ID:** `9-4-generate-studio-depth-and-scope-ui`
**Description:** Add interactive "Question Depth & Granularity" radio cards and "Document Context Scope" buttons in `GenerateStudio.svelte`. Verify end-to-end generation across models and ensure full test suite passes.
**Acceptance Criteria:**
- **Given** the Generate Studio page in Web UI
- **When** user selects "Deep Dive" or "Scenario" and adjusts context multiplier
- **Then** generation synthesizes in-depth, multi-faceted flashcards with verbatim grounding.
- **And** all unit, integration, and E2E tests across all workspaces pass 100% green.

---

## Epic 10: Data Sources Dashboard & Document Catalog Inspector

**Goal:** Transform the Sources Manager into a full-featured Data Sources Dashboard and Document Catalog Inspector, allowing users to drill into any source, inspect all ingested articles/documents, view word counts, preview extracted text, and selectively generate flashcards from specific documents.

### Story 10.1: Persistent Discovered Document Storage & Repository
**ID:** `10-1-document-storage-and-sync-persistence`
**Description:** Create a dedicated `documents` table in SQLite schema migrations and implement `DocumentRepository` in `@flashcard-master/core`. Update `IngestionService.syncSource()` to automatically upsert discovered articles/documents with title, URL, clean text, word count, and content hash during sync cycles.
**Acceptance Criteria:**
- **Given** an ingestion source being synced (RSS, Sitemap, Web, LLMs.txt, Local)
- **When** `IngestionService.syncSource(sourceId)` executes
- **Then** each extracted clean document is persisted into the `documents` SQLite table.
- **And** `DocumentRepository` provides `listBySourceId(sourceId)`, `getById(id)`, `search(query)`, and `getDocumentCount(sourceId)`.

### Story 10.2: Document Catalog REST APIs & Clean Text Preview
**ID:** `10-2-document-catalog-rest-apis`
**Description:** Implement backend REST endpoints in `packages/web/src/server.ts` to inspect documents (`GET /api/sources/:id/documents`, `GET /api/documents/:id`), fetch document counts, and support document-scoped card generation (`POST /api/generate` with `documentIds?: string[]`).
**Acceptance Criteria:**
- **Given** a client querying source documents
- **When** `GET /api/sources/:id/documents` is requested
- **Then** the server returns the array of discovered documents with metadata (title, URL, word count, discovery timestamp, generated card count).
- **And** `GET /api/documents/:id` returns the full clean text content for inspection.

### Story 10.3: Svelte 5 Data Sources Dashboard & Document Inspector Panel
**ID:** `10-3-sources-dashboard-and-inspector-ui`
**Description:** Enhance `SourcesView.svelte` and create `SourceDocumentInspector.svelte` (or interactive slide-over drawer) displaying real-time metrics per data source (total documents discovered, total cards produced, last sync timestamp) and an interactive searchable document table.
**Acceptance Criteria:**
- **Given** the Sources Manager view in Web UI
- **When** the user clicks "Inspect Documents 📖" on any data source card
- **Then** a document inspector modal/drawer opens displaying all discovered articles, search filter, word counts, and direct links to original source URLs.

### Story 10.4: Document Clean Text Preview Drawer & Targeted Single-Article Card Generation
**ID:** `10-4-document-text-preview-and-targeted-generation`
**Description:** Add a clean text preview modal in the Document Inspector allowing users to inspect extracted article text, and add a "⚡ Generate Cards from this Article" action button that routes to Generate Studio or triggers targeted generation for the selected document.
**Acceptance Criteria:**
- **Given** an article in the Document Inspector
- **When** the user clicks "Preview Text"
- **Then** a formatted reader drawer shows the extracted clean text and word count.
- **And** clicking "Synthesize Flashcards" triggers targeted card generation exclusively for that document.

### Story 10.5: CLI Document Inspection Subcommand & Test Suite Verification
**ID:** `10-5-cli-document-inspection-and-verification`
**Description:** Add CLI subcommand `flashcard-master source docs <source-id>` to list all cached articles from the terminal, and write comprehensive automated test suites for repository, API, and CLI inspection.
**Acceptance Criteria:**
- **Given** terminal user running `flashcard-master source docs <source-id>`
- **When** the command executes
- **Then** a formatted table of discovered articles, URLs, word counts, and sync timestamps is printed.
- **And** all unit, integration, and UI tests pass with 100% success.

---

## Epic 11: Hierarchical Document Selection & Precision Generation Studio Tuning

**Goal:** Deliver a unified hybrid generation workflow where users can select individual discovered articles directly inside Generate Studio (via lazy-loaded accordions, search, and text previews), configure comprehensive generation settings from both Generate Studio and the Document Inspector via shared components, and navigate bi-directionally with deep-link state preservation.

### Story 11.1: Shared Generation Configuration & Document Preview Components
**ID:** `11-1-shared-generation-config-and-preview-components`
**Description:** Extract `<GenerationConfigFields.svelte>` (encapsulating Provider, Model, Persona, Difficulty, Depth Mode, Chunk Sizing Multiplier, Target Deck, Card Limit, and Grounding toggle) and `<DocumentPreviewModal.svelte>` into reusable Svelte 5 components with `localStorage` preferences persistence.
**Acceptance Criteria:**
- **Given** any view requiring AI configuration or document reading
- **When** `<GenerationConfigFields>` or `<DocumentPreviewModal>` is rendered
- **Then** all generation parameters and text inspection features function consistently.
- **And** user adjustments to provider/model/persona/depth persist in `localStorage`.

### Story 11.2: Document Inspector In-Context Configuration Modal
**ID:** `11-2-document-inspector-configure-and-generate-modal`
**Description:** Upgrade `SourceDocumentInspector.svelte` so clicking "⚡ Generate Cards" or synthesizing from the preview modal opens a full "Synthesize Flashcards" configuration dialog powered by `GenerationConfigFields`, allowing complete calibration (Model, Persona, Depth Mode, Chunk Multiplier, Deck) before generating.
**Acceptance Criteria:**
- **Given** an article in the Document Inspector
- **When** user clicks "⚡ Generate Cards"
- **Then** a focused modal opens with full generation controls pre-populated with user preferences.
- **And** clicking "⚡ Start AI Generation" executes `POST /api/generate` with the selected parameters and updates the document's card count in real time.

### Story 11.3: Hierarchical Scope Selector with Lazy-Loaded Accordions & Search
**ID:** `11-3-hierarchical-scope-selector-with-lazy-loading-and-preview`
**Description:** Replace the flat source checkbox list in `GenerateStudio.svelte` with a collapsible hierarchical scope tree. Support lazy-loading discovered documents when a source accordion is opened, in-accordion search filtering, tri-state selection logic (All / Some / None), and inline `👁️ Preview` triggers.
**Acceptance Criteria:**
- **Given** the Generate Studio Scope Selector
- **When** user expands a data source accordion
- **Then** discovered documents are lazy-fetched from `GET /api/sources/:id/documents` and rendered in a scrollable list with search filter.
- **And** user can select specific documents, updating the master source tri-state checkbox and active scope summary pill.
- **And** clicking `👁️ Preview` opens the clean text reader modal without navigating away.

### Story 11.4: Bi-Directional Deep-Linking & Unsynced Source Quick-Sync
**ID:** `11-4-deep-link-url-parameters-and-bi-directional-flow`
**Description:** Add URL query parameter support in `GenerateStudio.svelte` (`?docId=<id>` and `?sourceId=<id>`) to auto-expand and pre-select targeted documents when deep-linking from Sources View. Provide an inline "⚡ Sync Now" trigger in Generate Studio for unsynced sources with 0 documents.
**Acceptance Criteria:**
- **Given** user navigates to `/generate?docId=<id>` (or clicks "Open in Studio ↗" from the Document Inspector)
- **When** Generate Studio mounts
- **Then** the parent source accordion is expanded and the target document is pre-checked and highlighted.
- **And** expanding an unsynced source with 0 documents displays an inline "⚡ Sync Now" button that triggers ingestion immediately.

### Story 11.5: End-to-End Verification & Automated Regression Tests
**ID:** `11-5-e2e-verification-and-regression-tests`
**Description:** Add comprehensive unit, server, and component integration tests verifying hierarchical scope payloads, targeted document synthesis, deep-link parameter parsing, and full build validation.
**Acceptance Criteria:**
- **Given** the full Flashcard Master test suite
- **When** `npm test` and `npm run build` are executed
- **Then** 100% of test suites across `core`, `adapters`, `cli`, and `web` pass with zero failures.

---

## Epic 12: Multi-URL Web Ingestion, Document Pruning & Knowledge Base Exporter

**Goal:** Empower users to ingest batches of web URLs under curated web sources via an interactive URL manager with bulk paste, prune unwanted/noisy documents with guaranteed flashcard preservation, and export compiled clean document knowledge bases to Markdown, HTML, Plain Text, and JSON in Merged (with clickable Table of Contents and Citations) or Split ZIP formats.

### Story 12.1: Multi-URL Storage & Concurrent WebReader Ingestion Engine
**ID:** `12-1-multi-url-storage-and-concurrent-web-reader-engine`
**Description:** Update `WebReaderStrategy` and domain models to support `data_sources.uri` containing a JSON array of URLs (with single-URL backward compatibility). Implement bounded concurrent fetching (pool of 3–5) with isolated error handling and delta hashing per URL.
**Acceptance Criteria:**
- **Given** a `web` data source with multiple URLs in `uri` (JSON array or single string)
- **When** `WebReaderStrategy.fetch(source)` is executed
- **Then** all valid URLs are ingested in parallel (concurrency limit 3–5) and extracted into clean text documents.
- **And** network or HTTP errors on one URL do not abort other URLs in the batch.
- **And** unit tests verify single and multi-URL decoding, concurrency limits, and error isolation.

### Story 12.2: Interactive Dynamic URL List Manager in UI (Add & Edit Source)
**ID:** `12-2-interactive-url-list-manager-ui`
**Description:** Build `<UrlListManager.svelte>` component and integrate it into `AddSourceModal.svelte` and Source Edit view. Support single-URL entry (`Enter` / button), smart multiline/comma-separated bulk paste parsing, per-item delete (`✕`), duplicate warnings, and URL count badge.
**Acceptance Criteria:**
- **Given** the Add Source Modal with source type "web"
- **When** the user types or pastes multiple URLs (e.g. 5 lines of URLs)
- **Then** the URLs are automatically parsed, validated (`http`/`https`), and displayed as interactive badge/chips.
- **And** user can remove individual URLs or clear the list before saving.
- **And** existing web sources can be edited to add or remove URLs.

### Story 12.3: Document Repository Deletion & Safe Flashcard Preservation
**ID:** `12-3-document-deletion-and-safe-flashcard-preservation`
**Description:** Add `delete(id)` and `deleteBulk(ids)` methods in `DocumentRepository`, along with server routes `DELETE /api/documents/:id` and `POST /api/documents/bulk-delete`. Ensure foreign key handling and queries safely preserve all associated flashcards without cascading card deletions.
**Acceptance Criteria:**
- **Given** a document with 10 generated flashcards
- **When** `DELETE /api/documents/:id` or `POST /api/documents/bulk-delete` is called
- **Then** the document record is permanently removed from the `documents` table.
- **And** all 10 flashcards remain intact in `flashcards` table with their original `question`, `answer`, `source_quote`, `document_title`, and `target_deck`.
- **And** unit tests verify repository delete, bulk delete, and flashcard retention.

### Story 12.4: Document Inspector Bulk Selection & Management UI
**ID:** `12-4-document-inspector-bulk-selection-and-deletion-ui`
**Description:** Upgrade `SourceDocumentInspector.svelte` with row-level selection checkboxes, master "Select All" / "Invert Selection" / "Select Unused (0 cards)" controls, selected counter badge, single-row delete (`🗑️`), and a "Delete Selected" bulk button with confirmation modal.
**Acceptance Criteria:**
- **Given** the Document Inspector open for a source
- **When** user checks one or multiple documents
- **Then** a bulk action bar appears displaying `Selected: N documents` and `[ 🗑️ Delete Selected ]`.
- **And** clicking "Delete Selected" shows a confirmation prompt and removes the selected documents from the table upon confirmation.
- **And** card count metrics and document lists refresh immediately without page reload.

### Story 12.5: Document Knowledge Base Export Engine (`DocumentExportService`)
**ID:** `12-5-document-knowledge-base-export-engine`
**Description:** Implement `DocumentExportService` in `@flashcard-master/core` supporting Markdown, HTML, Plain Text, and JSON exports in both **Merged Single-File** mode (featuring an auto-generated clickable Table of Contents, header dividers, word counts, and origin citations) and **Split ZIP Archive** mode (using `jszip` with slugified filenames).
**Acceptance Criteria:**
- **Given** a list of clean documents and export options
- **When** `DocumentExportService.export(docs, { format, mode })` is invoked
- **Then** Merged Markdown/HTML outputs include a generated clickable Table of Contents and formatted document sections with source links.
- **And** Split mode returns a valid `.zip` buffer containing individual slugified document files.
- **And** unit tests verify all 4 formats in both merged and split modes.

### Story 12.6: Document Export UI Modal & Streaming Download Endpoints
**ID:** `12-6-document-export-ui-modal-and-streaming-endpoints`
**Description:** Add REST endpoints `POST /api/documents/export` (streaming file or zip downloads) and create `<DocumentExportModal.svelte>` in the web UI. Add "📤 Export Documents" buttons in `SourceDocumentInspector.svelte` (supporting All vs. Selected documents) and `DocumentPreviewModal.svelte` (single doc export).
**Acceptance Criteria:**
- **Given** user in Document Inspector or Document Preview Modal
- **When** user clicks "📤 Export Documents"
- **Then** a modal opens allowing selection of format (Markdown, HTML, Plain Text, JSON), packaging mode (Merged Master File vs. Split ZIP), and scope.
- **And** clicking "Download Export" streams the file or `.zip` archive directly to the browser with correct `Content-Disposition` and MIME headers.

### Story 12.7: Monorepo Verification & Automated Test Suites
**ID:** `12-7-monorepo-verification-and-automated-test-suites`
**Description:** Implement automated test suites covering multi-URL strategy fetching, document deletion routes, `DocumentExportService` formatting, and web client export interactions. Verify full build and test pass across all workspaces.
**Acceptance Criteria:**
- **Given** the complete monorepo
- **When** `npm test` and `npm run build` are run
- **Then** 100% of tests pass across `core`, `adapters`, `cli`, and `web`.

---

## Epic 13: EPUB Knowledge Base Publishing, Mixed Difficulty Synthesis & Workflow Usability Enhancements

**Goal:** Provide e-reader EPUB eBook publishing for knowledge bases, expand flashcard difficulty scaling with an adaptive 'mixed' tier, equip Question Explorer with dynamic instant-refresh capabilities, and streamline local file source ingestion with an interactive file chooser eliminating free-text path entry errors.

### Story 13.1: EPUB eBook Export Engine & Manifest Packaging
**ID:** `13-1-epub-ebook-export-engine`
**Description:** Extend `DocumentExportFormat` to include `'epub'` and implement standard EPUB 3.0 packaging in `DocumentExportService` using `JSZip`, including uncompressed mimetype, `META-INF/container.xml`, `OEBPS/content.opf` (metadata, manifest, spine), `OEBPS/nav.xhtml` & `OEBPS/toc.ncx` (chapter navigation), `OEBPS/styles.css`, and XHTML chapter documents with embedded media asset support.
**Acceptance Criteria:**
- **Given** a collection of clean documents and export format `'epub'`
- **When** `DocumentExportService.export(documents, { format: 'epub', ... })` is called
- **Then** a valid `.epub` buffer is generated structured as a compliant EPUB 3.0 container.
- **And** the package contains `mimetype` (`application/epub+zip` uncompressed STORE), `container.xml`, `content.opf`, `nav.xhtml`, `toc.ncx`, and valid XHTML chapter files for each document.
- **And** local media assets referenced in document bodies are packaged into `OEBPS/images/` and linked via relative paths.
- **And** unit tests verify container compliance, manifest integrity, and XHTML formatting.

### Story 13.2: EPUB Export UI Integration & Streaming Endpoints
**ID:** `13-2-epub-export-ui-and-endpoints`
**Description:** Update `POST /api/documents/export` to support `'epub'` format streaming with `application/epub+zip` MIME headers and `.epub` filename. Update `<DocumentExportModal.svelte>` to offer "📚 EPUB eBook (.epub)" as a selectable export format, alongside format descriptions and badge indicators.
**Acceptance Criteria:**
- **Given** the Document Export Modal in `SourceDocumentInspector` or `DocumentPreviewModal`
- **When** user selects "📚 EPUB eBook (.epub)" and clicks "Download Export"
- **Then** the browser downloads a valid `.epub` eBook with appropriate filename and MIME headers.
- **And** the downloaded EPUB opens cleanly in e-reader applications (Apple Books, Calibre, Kobo, Kindle Previewer).
- **And** integration tests verify the HTTP streaming endpoint and modal format options.

### Story 13.3: Mixed Target Difficulty Category & Adaptive Synthesis Pipeline
**ID:** `13-3-mixed-difficulty-flashcard-category-and-synthesis`
**Description:** Expand `DifficultyLevelSchema` and database CHECK constraint to include `'mixed'`. Update all LLM prompt adapters (OpenAI, Anthropic, Gemini, Ollama) so that when `difficulty: 'mixed'` is selected, the model is instructed to synthesize a balanced progression of beginner, intermediate, and expert cards across the source document, tagging each card appropriately. Update UI difficulty selectors in `GenerationConfigFields.svelte`, `CardEditorDrawer.svelte`, CLI options, and `QuestionExplorer.svelte` with `mixed` badge styling and filter chips.
**Acceptance Criteria:**
- **Given** flashcard generation initiated with `difficulty: 'mixed'`
- **When** the LLM synthesizes flashcards
- **Then** the prompt directs the LLM to create a balanced mix of beginner, intermediate, and expert questions.
- **And** the cards are saved with their generated difficulty level (or `mixed`) and validated by schema.
- **And** `QuestionExplorer` provides a "🌈 Mixed" filter chip and distinct badge presentation.
- **And** CLI `--difficulty` option validates and accepts `mixed`.
- **And** unit and integration tests verify prompt generation, response parsing, and database persistence with the updated CHECK constraint.

### Story 13.4: Question Explorer Real-Time Refresh Action
**ID:** `13-4-question-explorer-refresh-button`
**Description:** Add a dedicated "🔄 Refresh" button in `QuestionExplorer.svelte` toolbar. Clicking the button re-invokes `loadCards()` while preserving active filter state (`selectedDeck`, `selectedDifficulty`, `searchQuery`), displaying an animated spinning indicator and disabling the trigger while in-flight to prevent duplicate concurrent network requests.
**Acceptance Criteria:**
- **Given** user in Question Explorer with active filters applied
- **When** user clicks the "🔄 Refresh" button (or presses shortcut)
- **Then** the button shows an animated spinner and disables while fetching cards.
- **And** the latest card catalog is reloaded and filtered according to the existing active filters without page reload.
- **And** a transient toast notification confirms catalog refresh.
- **And** component verification tests confirm refresh behavior and loading states.

### Story 13.5: Interactive File Picker & Upload for Local Data Sources
**ID:** `13-5-interactive-local-file-picker-source`
**Description:** Implement `POST /api/sources/upload` in `packages/web/src/server.ts` to accept local file uploads (`.md`, `.markdown`, `.txt`) and save them into the application's local files directory. Upgrade `AddSourceModal.svelte` and `EditSourceModal.svelte` so that when `type === 'local'`, an interactive drag-and-drop file chooser replaces the mandatory free-text path input. Selecting or dropping a file uploads it, auto-populates the source name from filename, and sets the source URI to the resolved local file path, while providing an optional toggle for manual directory path entry.
**Acceptance Criteria:**
- **Given** the Add Source Modal with source type "Local"
- **When** user drags a Markdown/text file into the dropzone or selects it via the file browser
- **Then** the file is uploaded to the local server, and a badge displays the filename and size.
- **And** the source name is automatically filled if empty, and `uri` is set to the saved file path.
- **And** saving the source allows `LocalFileStrategy` to ingest the document seamlessly.
- **And** unit and integration tests verify upload route validation, file storage, and UI interactions.

### Story 13.6: Monorepo Verification & Automated Regression Test Suite
**ID:** `13-6-monorepo-verification-and-test-suite`
**Description:** Implement automated test suites covering EPUB generation, mixed difficulty prompt handling, Question Explorer refresh reactions, and local file upload ingestion. Verify full monorepo build and test suites pass with 100% success across all packages.
**Acceptance Criteria:**
- **Given** the complete monorepo
- **When** `npm test` and `npm run build` are executed
- **Then** 100% of tests pass across `core`, `adapters`, `cli`, and `web`.
- **And** zero regressions or lint errors exist.

---

## Epic 14: Global State Management, Background Worker Concurrency & Resilient UX Flow

**Goal:** Establish non-destructive cross-view navigation with decoupled Svelte 5 universal reactive stores, a high-performance multi-threaded background task queue with configurable concurrency limits and zero SQLite lock contention, persistent step-by-step logging sessions streamed via Server-Sent Events, an interactive Task Center slide-over drawer featuring Step Accordions and task cancellation, and hardened action triggers with anti-double-click protection and global toast notifications.

### Story 14.1: SQLite Job & Log Schema, Concurrency Manager & CLI Flags
**ID:** `14-1-job-queue-sqlite-schema-and-concurrency-manager`
**Description:** Implement database migrations for `jobs` and `job_logs` tables with appropriate indices in `packages/core/src/storage/`. Implement `SqliteJobRepository` and domain models `Job` and `JobLog`. Create `JobManager` in `packages/web/src/jobs/` to manage task queues with bounded concurrency pools (generation: 3, sync: 2, export: 2). Add CLI arguments (`--max-generation-workers`, `--max-sync-workers`, `--max-export-workers`) in `packages/cli` and `packages/web` server options.
**Acceptance Criteria:**
- **Given** the database initialization and migrations
- **When** the database opens
- **Then** `jobs` and `job_logs` tables are created with proper indices and foreign keys.
- **And** `JobRepository` provides atomic methods to insert jobs, update progress, append step logs, and query active/past tasks.
- **And** `JobManager` enforces concurrency limits per pool, queueing overflow tasks in FIFO order.
- **And** CLI arguments parse `--max-generation-workers`, `--max-sync-workers`, `--max-export-workers` and pass them to WebServer options.
- **And** unit tests verify repository persistence and queue concurrency scheduling.

### Story 14.2: Worker Thread Engine & Task Execution Pipeline
**ID:** `14-2-worker-thread-engine-and-task-pipeline`
**Description:** Implement Node.js `worker_threads` for heavy background tasks (`generation.worker.ts`, `sync.worker.ts`, and `export.worker.ts`) with a robust IPC messaging protocol. Worker threads execute LLM card synthesis, source scraping, and file exports, sending back progress updates, structured step logs, and result payloads (`COMMIT_CARDS`, `COMPLETE`). The main thread acts as the sole SQLite custodian, committing generated cards and sync states atomically to eliminate `SQLITE_BUSY` contention. Support user task cancellation (`worker.terminate()` and status transition to `cancelled`).
**Acceptance Criteria:**
- **Given** an enqueued background job
- **When** `JobManager` dispatches a task to a worker thread
- **Then** the worker thread runs the task without blocking the main event loop.
- **And** the worker thread does NOT open direct writable SQLite connections; all persistence is executed by the main thread via IPC messages.
- **And** individual step failures do not crash the entire batch (fault-tolerant partial success).
- **And** requesting task cancellation terminates the worker thread and commits any completed items.
- **And** integration tests verify worker thread execution, IPC communication, and graceful error handling.

### Story 14.3: Real-Time Server-Sent Events (SSE) Streaming Endpoints & Step-by-Step Logging
**ID:** `14-3-real-time-sse-streaming-and-logging-endpoints`
**Description:** Implement Server-Sent Events (SSE) route `GET /api/jobs/stream` broadcasting real-time job status transitions (`queued`, `running`, `progress`, `completed`, `failed`, `cancelled`). Implement `GET /api/jobs/:id/logs/stream` for live step-by-step log streaming. Implement `GET /api/jobs` (list active and past jobs with optional status filter), `GET /api/jobs/:id` (full details with logs), `POST /api/jobs/:id/cancel`, and `DELETE /api/jobs/history` ("Clear History" action with automatic 7-day or 100-job pruning). Update `/api/generate`, `/api/sync`, and `/api/export` to enqueue jobs asynchronously and return `{ success: true, jobId }` in < 50ms.
**Acceptance Criteria:**
- **Given** a client triggering `/api/generate`, `/api/sync`, or export
- **When** the request arrives
- **Then** the endpoint enqueues the job and responds with `{ success: true, jobId }` in < 50 milliseconds.
- **And** connected SSE clients receive live `job_progress`, `job_log`, and `job_status` events.
- **And** `GET /api/jobs/:id/logs/stream` streams discrete step logs as they are recorded.
- **And** `POST /api/jobs/:id/cancel` aborts the running job and notifies subscribers.
- **And** `DELETE /api/jobs/history` purges completed jobs according to retention policy.
- **And** integration tests verify SSE streams, endpoint response times, and history deletion.

### Story 14.4: Svelte 5 Global Reactive Stores & LocalStorage Preference Retention
**ID:** `14-4-svelte-global-stores-and-preference-retention`
**Description:** Implement decoupled Svelte 5 shared state modules in `packages/web/client/src/stores/`: `generateStore.svelte.ts` (selected documents/sources, model, persona, difficulty, limits, draft results), `sourcesStore.svelte.ts` (expanded source IDs, filter query), `explorerStore.svelte.ts` (search, active deck/difficulty chips, selection), and `taskStore.svelte.ts` (connects to SSE stream, tracks active jobs, active job count, active job logs). Refactor views (`GenerateStudio.svelte`, `SourcesView.svelte`, `QuestionExplorer.svelte`) to consume and update these stores so tab switching never resets user input or in-flight progress. Synchronize user settings (provider, model, persona, difficulty, target deck) to `localStorage`.
**Acceptance Criteria:**
- **Given** user entering selections and configuration across views
- **When** user navigates between Dashboard, Sources, Generate, Cards, and Export
- **Then** 100% of user inputs, document selections, filters, and drafts remain intact.
- **And** user settings persist across browser refreshes via `localStorage`.
- **And** `taskStore` maintains active job states received from the SSE stream.
- **And** unit tests verify store reactivity and state preservation across component mount/unmount lifecycles.

### Story 14.5: Task Center Slide-Over Drawer with Step Accordion UI
**ID:** `14-5-task-center-drawer-and-step-accordion-ui`
**Description:** Create `<TaskCenterDrawer.svelte>` and `<StepAccordion.svelte>` components in `packages/web/client/src/components/`. Add a persistent task status badge in `<Navigation.svelte>` (e.g. `[⚡ Tasks (2)]` with an animated pulse/spin when active). The drawer features two tabs: "Active Tasks" and "History". Active tasks display live progress bars, elapsed duration, and a "Cancel" button. Each task contains an interactive **Step Accordion** displaying timestamped steps (Step 1 ✓, Step 2 ⟳, Step 3 ⏳) with expandable log message details and badge indicators (`info`, `warn`, `error`, `success`). The History tab displays past jobs and provides a "Clear History" button.
**Acceptance Criteria:**
- **Given** background tasks running in the application
- **When** user inspects the navigation bar or clicks the Tasks button
- **Then** a live badge displays the count of active jobs with active animation.
- **And** clicking the button opens the slide-over Task Center drawer.
- **And** the Step Accordion renders discrete execution steps with timestamps, durations, and level badges.
- **And** expanding a step displays detailed log outputs and diagnostics.
- **And** clicking "Cancel" halts execution and updates task status to cancelled.
- **And** "Clear History" purges finished jobs from the drawer and backend.
- **And** component tests verify accordion interactions, cancel actions, and live updates.

### Story 14.6: Action Hardening, Double-Click Prevention & Resilient Navigation Sync
**ID:** `14-6-action-hardening-and-resilient-navigation-sync`
**Description:** Harden all action trigger buttons across the application (Generate Cards in `GenerateStudio`, Sync All in `SourcesView`/`DashboardView`, Export buttons in `ExportCenter`/modals). On click, the button immediately disables, enters a loading state with spinner, and locks conflicting inputs to prevent double-clicks. Once the job is queued, the button resets or indicates background processing. Implement global toast alerts (`toastStore.svelte.ts` and `<ToastContainer.svelte>`) notifying users when background jobs complete or encounter errors. Update `App.svelte` to implement full two-way URL and browser history sync (`window.history.pushState` and `popstate` event listener), allowing browser back/forward buttons to navigate between tabs seamlessly.
**Acceptance Criteria:**
- **Given** action triggers across the UI
- **When** user clicks "Start AI Generation", "Sync All", or "Export"
- **Then** the trigger button immediately enters a disabled loading state, preventing double-clicks.
- **And** a toast alert confirms that the task has been queued with a link to open the Task Center.
- **And** task completion or failure triggers a global toast alert across whatever tab is currently active.
- **And** browser back/forward buttons navigate between application tabs smoothly without page refresh.
- **And** E2E tests verify button disabling, toast alerts, and history navigation.

### Story 14.7: Monorepo Verification & Automated End-to-End Test Suite
**ID:** `14-7-monorepo-verification-and-e2e-test-suite`
**Description:** Implement comprehensive end-to-end and integration test suites covering the entire multi-threaded background task pipeline, SQLite lock avoidance under concurrent load, SSE streaming, Svelte 5 store persistence, Task Center interactions, and URL navigation. Execute full monorepo build, linting, typechecking, and tests.
**Acceptance Criteria:**
- **Given** the complete monorepo
- **When** `npm test` and `npm run build` are executed
- **Then** 100% of tests pass across `core`, `adapters`, `cli`, and `web`.
- **And** concurrency stress tests verify that multiple simultaneous generation and export tasks adhere to pool limits and commit without `SQLITE_BUSY` errors.
- **And** `npm run lint` and `npm run typecheck` pass with zero errors.

---

## Epic 15: Centralized Secrets & Integrations Dashboard & Notion Data Source Ingestion

**Goal:** Establish a secure, centralized Secrets & Settings management architecture in SQLite with environment variable fallbacks, masked UI credential display, and live "Test Connection" validation for Notion and all LLM providers (OpenAI, Anthropic, Gemini, Ollama); automatically inject stored credentials into card generation workflows and background workers to eliminate manual key re-entry; and implement a full-featured Notion Ingestion Strategy via `@notionhq/client` supporting both Databases and Pages, delta synchronization via `last_edited_time`, configurable child subpage recursion, and automatic localization of expiring AWS S3 image assets via `MediaService`.

### Story 15.1: SQLite Settings Repository, Fallback Chain & Secrets REST API
**ID:** `15-1-sqlite-settings-repository-and-secrets-api`
**Description:** Implement database migrations for the `app_settings` table (`key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at TEXT NOT NULL`) in `packages/core/src/storage/`. Implement the `SettingsRepository` port interface and `SqliteSettingsRepository` class with atomic upsert, retrieval, deletion, and listing methods. Implement `SettingsService` in `packages/core/src/services/` enforcing the hierarchical fallback chain: `SqliteSettingsRepository.get(key) ?? process.env[ENV_VAR] ?? null` (where saved UI keys take precedence over environment variables). In `packages/web/src/server.ts`, expose REST endpoints:
- `GET /api/settings/keys`: Returns provider configuration states (`openai`, `anthropic`, `gemini`, `ollama`, `notion`) with masked previews (e.g. `sk-...4a12`, `secret_...9a2f`), `isConfigured: boolean`, and source origin (`database` vs `environment`), strictly never leaking raw keys in JSON responses.
- `POST /api/settings/keys`: Upserts raw secrets for a specified provider (`{ provider: string, key: string, endpoint?: string }`) into SQLite.
- `DELETE /api/settings/keys/:provider`: Removes stored secrets from SQLite, resetting the provider to environment fallback or unconfigured state.
**Acceptance Criteria:**
- **Given** an initialized SQLite database
- **When** the server starts or migrations run
- **Then** the `app_settings` table is created with `key` primary key and timestamps.
- **And** `SqliteSettingsRepository` provides atomic CRUD operations for settings keys.
- **And** `SettingsService.getSecret(provider)` checks SQLite first and falls back to environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NOTION_API_KEY`, `OLLAMA_HOST`).
- **And** `GET /api/settings/keys` responds with masked key previews (`sk-...xxxx`, `secret_...xxxx`), never returning plain-text secret strings.
- **And** `POST /api/settings/keys` validates inputs, trims whitespace, and persists raw credentials into SQLite with updated timestamps.
- **And** `DELETE /api/settings/keys/:provider` purges the secret from the database.
- **And** unit and integration tests verify repository persistence, fallback resolution, masking logic, and REST routes.

### Story 15.2: Live Provider Credential Verification Endpoints
**ID:** `15-2-live-provider-credential-verification-endpoints`
**Description:** Implement the live verification endpoint `POST /api/settings/keys/test` in `packages/web/src/server.ts` allowing on-demand connectivity checks for configured providers (`notion`, `openai`, `anthropic`, `gemini`, `ollama`). Each provider has an isolated verification handler:
- `notion`: Uses `@notionhq/client` to execute `notion.users.me()`, verifying token validity and retrieving the connected bot name and workspace context.
- `openai`: Calls `models.list()` or sends a minimal 1-token prompt via `OpenAIAdapter`, confirming API key validity and active account standing.
- `anthropic`: Sends a minimal validation probe via `AnthropicAdapter` to verify key authorization.
- `gemini`: Pings Gemini model discovery via `GeminiAdapter` to verify API key validity.
- `ollama`: Fetches `/api/tags` on the configured baseUrl to confirm reachability and retrieve installed local model names.
All tests enforce a strict 3-second timeout and return `{ success: boolean, message: string, details?: any }` with descriptive error reporting on authorization, network, or rate-limit failures.
**Acceptance Criteria:**
- **Given** a request to `POST /api/settings/keys/test` with `{ provider: string, key?: string, endpoint?: string }`
- **When** the provider credentials are valid
- **Then** the endpoint returns `{ success: true, message: string, details: any }` in < 3 seconds.
- **And** for Notion, the response confirms bot name and workspace association (e.g. "Connected: Bot 'Flashcard Master'").
- **And** for Ollama, the response lists installed models found on the instance.
- **And** when credentials are invalid or unreachable, it returns `{ success: false, message: string }` without crashing the server.
- **And** unit and integration tests verify mock and real provider validation handlers and error handling.

### Story 15.3: Integrations & Secrets UI Dashboard (`SettingsView`)
**ID:** `15-3-integrations-and-secrets-ui-dashboard`
**Description:** Implement `SettingsView.svelte` in `packages/web/client/src/views/` and `settingsStore.svelte.ts` in `packages/web/client/src/stores/`. Add a persistent navigation item **⚙️ Settings** in `<Navigation.svelte>` with two-way browser history and URL sync (`?tab=settings`). The view organizes integrations into structured sections:
1. **Data Source Connections**:
   - **Notion**: Internal Integration Secret input (`secret_...` / `ntn_...`), connection status badge (`🟢 Connected` / `⚪ Not Configured`), "Test Connection" button with spinner, and helper text explaining how to create an integration and share pages.
2. **AI / LLM Providers**:
   - Provider cards for **OpenAI**, **Anthropic**, **Google Gemini**, and **Ollama**.
   - Password-masked inputs with an interactive reveal/hide toggle (`👁️`), default model selection, custom endpoint override (for Ollama/OpenAI-compatible endpoints), Save, Clear, and **"Test Connection"** buttons.
   - Live test status banner rendering success details (`✓ Connected! 5 models available`) or error alerts.
**Acceptance Criteria:**
- **Given** the local web dashboard
- **When** the user clicks "Settings" in the main navigation or accesses `?tab=settings`
- **Then** `SettingsView` renders with provider cards for Notion and LLMs.
- **And** `settingsStore` loads masked keys and configuration statuses from `GET /api/settings/keys`.
- **And** entering a secret and clicking "Save" calls `POST /api/settings/keys`, updates masked state, and displays a success toast.
- **And** clicking "Test Connection" triggers `POST /api/settings/keys/test`, shows an inline spinner, and displays live diagnostic results.
- **And** clicking "Clear" calls `DELETE /api/settings/keys/:provider` and resets the card status.
- **And** component and UI integration tests verify tab navigation, form submissions, masking toggles, and test pings.

### Story 15.4: Automatic Credential Injection in Generation Studio & Workers
**ID:** `15-4-automatic-credential-injection-in-generation-studio-and-workers`
**Description:** Refactor `GenerateStudio.svelte`, `DocumentInspector` Configure & Generate modal, and backend worker threads to automatically consume stored API keys from the centralized Settings store. When a user selects an AI provider in Generate Studio:
- If a key is stored in Settings, the API key input is marked optional and displays a badge: `Using saved API key [sk-...4a12] ✓ (Settings)` with a quick link to open Settings.
- Users retain the option to provide a one-time key override in the form.
- In `packages/web/src/workers/task-worker.ts`, update `executeGeneration`: when `payload.apiKey` is not provided, query `SettingsService.getSecret(payload.provider)` to obtain the stored key, throwing a descriptive error only if no key exists in either the database or environment variables.
- Remove redundant API key prompts across the application.
**Acceptance Criteria:**
- **Given** an LLM provider key saved in Settings
- **When** the user opens Generate Studio or the Document Inspector Generate modal
- **Then** the interface reflects that the saved API key is active without requiring manual input.
- **And** submitting card generation without typing a key successfully uses the stored secret from `SettingsService`.
- **And** providing a manual key in the form overrides the saved key for that specific generation run.
- **And** background worker threads resolve the stored secret on the main thread and pass it to the worker task.
- **And** integration tests verify generation runs succeed with stored keys and handle missing keys with clear errors.

### Story 15.5: Notion Ingestion Strategy (`NotionStrategy`)
**ID:** `15-5-notion-ingestion-strategy`
**Description:** Install `@notionhq/client` in `packages/adapters`. Implement `NotionStrategy` implementing `IngestionStrategy` (`type = 'notion'`) in `packages/adapters/src/ingestion/notion-strategy.ts`. The strategy accepts Notion URLs (`https://www.notion.so/...`) or raw 32-character UUIDs, extracting the canonical ID. During synchronization:
- Uses `SettingsService.getSecret("notion")` (or source-level token) to initialize the Notion client.
- Calls Notion API to determine whether the target ID is a **Database** or a **Page**.
- **Database Ingestion**:
  - Queries rows with incremental delta filter: `filter: { timestamp: "last_edited_time", last_edited_time: { after: lastSyncedAt } }`.
  - Maps row Title property to document title, and multi-select/select tags to document tags.
  - Recursively fetches block children for each page row and converts blocks to Markdown.
- **Page Ingestion**:
  - Fetches page metadata and recursively retrieves all block children.
  - Converts blocks to clean Markdown (H1-H3, paragraphs, numbered/bulleted lists, quotes, callouts, code blocks with languages, and simple tables).
  - Checks for subpage recursion: if `recursive=true` is set on the source URI (`?recursive=true`), queries child pages (`child_page` blocks) up to max-depth 3, creating individual `DiscoveredDocument` records for each subpage.
- **S3 Presigned Media Localization**:
  - Intercepts all `image` blocks (`block.type === 'image'`).
  - Downloads the AWS S3 image immediately via `MediaService.downloadAndSave(url, originUrl)` before the 60-minute expiration.
  - Replaces S3 signed URLs with persistent local `/api/media/<id>` image links in the generated Markdown.
**Acceptance Criteria:**
- **Given** a registered Notion data source (Database or Page)
- **When** `NotionStrategy.fetch()` is executed
- **Then** the strategy extracts the canonical ID and auto-detects Database vs Page.
- **And** database sync queries rows incrementally using `last_edited_time` and creates a `RawDocument` per row.
- **And** page sync extracts clean Markdown from Notion block trees including headings, code blocks, lists, and tables.
- **And** when `recursive=true`, nested child pages are crawled and emitted as discrete documents with parent provenance.
- **And** all Notion S3 images are downloaded to `.flashcard-master/media/` and localized to `/api/media/<id>`.
- **And** unit and integration tests with mocked Notion API responses verify database queries, block-to-markdown conversion, subpage crawling, and image localization.

### Story 15.6: Interactive Notion Source UI & Monorepo Verification
**ID:** `15-6-interactive-notion-source-ui-and-monorepo-verification`
**Description:** Update `packages/core/src/domain/models.ts` to add `'notion'` to `DataSourceTypeSchema`. Update database migrations to update `data_sources` CHECK constraint. Update `AddSourceModal.svelte` and `EditSourceModal.svelte` to include the **Notion** source type:
- When "Notion" is selected, the modal verifies whether the Notion token is configured, displaying a green check badge (`Notion Token Active`) or an alert with a clickable link to navigate to Settings.
- Provides an input for Notion URL or ID with real-time validation and helper tooltips.
- Provides a checkbox: `[x] Include subpages as separate documents` (appending `?recursive=true` to the URI).
- Register `NotionStrategy` in `StrategyRegistry`.
- Implement end-to-end integration tests covering Notion source creation, database sync, page sync with subpage discovery, settings key management, and monorepo regression checks (`npm test`, `npm run build`).
**Acceptance Criteria:**
- **Given** the Add Source modal in the Web UI
- **When** user selects source type "Notion"
- **Then** the UI displays token status, Notion URL input, and the subpage recursion checkbox.
- **And** submitting the form persists the Notion data source in SQLite.
- **And** clicking "Sync" triggers `NotionStrategy` via background worker, ingesting documents and downloading media assets.
- **And** Generate Studio can synthesize grounded flashcards from the ingested Notion documents.
- **And** 100% of monorepo tests pass across `core`, `adapters`, `cli`, and `web`.
- **And** `npm run lint` and `npm run typecheck` pass with zero errors.

---

## Epic 16: Deterministic Structured LLM Responses via Provider-Native Dialects

**Goal:** Replace fragile regex-based parsing, markdown fence stripping, and quote sanitizers with deterministic provider-native structured outputs across all supported LLM providers (Gemini, OpenAI, Anthropic, Ollama); establish a single source of truth Zod schema in `@flashcard-master/core` that polymorphically compiles into native provider dialects with embedded prompt directives; expand the flashcard domain model with `keywords: string[]` and `sourceLocator: string` with SQLite non-destructive migrations; stream validated cards progressively via SSE into Task Center while gracefully preserving partial results upon token cutoffs; and completely deprecate legacy string repair heuristics across the monorepo.

### Story 16.1: Enriched Flashcard Schema & SQLite Migration
**ID:** `16-1-enriched-flashcard-schema-and-sqlite-migration`
**Description:** Update `packages/core/src/domain/models.ts` and `CardGenerationDraftSchema` to include `keywords: string[]` (2 to 5 atomic semantic keywords with `.describe()` annotation) and `sourceLocator: string` (exact document locator coordinate/URI beyond citation fragment). Update `Flashcard` domain entity and `CardRepository` with SQLite database migrations:
- Add non-destructive column migrations: `ALTER TABLE cards ADD COLUMN keywords TEXT DEFAULT '[]'; ALTER TABLE cards ADD COLUMN source_locator TEXT DEFAULT '';`.
- Update repository serialization to persist `keywords` as JSON string array and parse on read with fallback to empty array `[]`.
- Update repository mapping to read `source_locator` with fallback to empty string `""`.
- Update `CardRepository` unit tests to verify creation, retrieval, and updates with new fields and ensure existing database records without these fields load without regressions.
**Acceptance Criteria:**
- **Given** an updated core domain model
- **When** `CardGenerationDraftSchema.parse()` is invoked
- **Then** it validates `keywords` as a non-empty array of strings and `sourceLocator` as a non-empty trimmed string.
- **And** running SQLite migrations adds `keywords` and `source_locator` columns without failing if columns already exist.
- **And** querying historical card records returns empty arrays `[]` for keywords and empty string `""` for sourceLocator without runtime exceptions.
- **And** persisting new cards preserves full keyword lists and source locator coordinates.
- **And** unit tests in `packages/core` verify schema validation, repository CRUD, and migration backward compatibility.

### Story 16.2: Central Zod-to-Provider Dialect Compiler
**ID:** `16-2-central-zod-to-provider-dialect-compiler`
**Description:** Implement `DialectCompiler` in `packages/core/src/llm/dialect-compiler.ts` (or shared adapter layer) that accepts any Zod object schema and polymorphically compiles it into provider-specific structured output formats:
- **Google Gemini:** Compiles Zod schema into Google GenAI `Schema` (`type: SchemaType.OBJECT`, property types, descriptions from `.describe()`).
- **OpenAI:** Compiles Zod schema into strict `json_schema` with `additionalProperties: false`, all fields in `required`, and optional fields represented as nullable unions.
- **Anthropic:** Wraps schema in tool definition `{ name: "emit_flashcards", description: string, input_schema: JsonSchema }` for forced tool execution.
- **Ollama:** Compiles Zod schema into standard JSON Schema for the `format` option.
- Schema `.describe()` annotations are automatically extracted to serve as model prompt directives.
**Acceptance Criteria:**
- **Given** `CardGenerationDraftSchema`
- **When** passed to `DialectCompiler.toGeminiSchema()`
- **Then** it returns a valid Google GenAI Schema object with correct `SchemaType` mappings and descriptions.
- **And** `DialectCompiler.toOpenAISchema()` returns a valid JSON Schema with `additionalProperties: false` and strict validation properties.
- **And** `DialectCompiler.toAnthropicTool()` returns a valid tool definition schema configured for forced tool execution.
- **And** `DialectCompiler.toOllamaSchema()` returns a valid JSON Schema object.
- **And** unit tests verify compiler output against all 4 provider specifications.

### Story 16.3: Provider Adapters Native Structured Output Migration
**ID:** `16-3-provider-adapters-native-structured-output-migration`
**Description:** Refactor all 4 LLM provider adapters in `packages/adapters/src/llm/` to use compiled dialect schemas and parse typed response objects directly without regex parsing:
- **GeminiAdapter (`gemini-adapter.ts`):** Pass `responseSchema` and `responseMimeType: "application/json"` in `generationConfig`. Parse `JSON.parse(response.text)` directly with `z.array(CardGenerationDraftSchema)`.
- **OpenAIAdapter (`openai-adapter.ts`):** Pass `response_format: { type: "json_schema", json_schema: { name: "flashcards", strict: true, schema: compiledSchema } }`. Parse content directly with Zod schema.
- **AnthropicAdapter (`anthropic-adapter.ts`):** Send tool definition with `tool_choice: { type: "tool", name: "emit_flashcards" }`. Extract cards directly from `tool_use.input.cards`.
- **OllamaAdapter (`ollama-adapter.ts`):** Pass `format: compiledSchema`. Parse response content directly with Zod schema.
- Remove all prompt-level instructions pleading for JSON formatting in English text.
**Acceptance Criteria:**
- **Given** card generation requests sent to Gemini, OpenAI, Anthropic, or Ollama
- **When** the provider responds
- **Then** the adapter parses strongly-typed `CardGenerationDraft[]` directly from the provider response payload.
- **And** no regex searching, fence stripping, or quote escaping heuristics are invoked.
- **And** generated cards contain `keywords` and `sourceLocator` matching the schema.
- **And** unit tests with mocked provider responses verify successful object extraction for each adapter.

### Story 16.4: Progressive SSE Streaming & Token Limit Retention
**ID:** `16-4-progressive-sse-streaming-and-token-limit-retention`
**Description:** Update card generation workers in `packages/web/src/workers/task-worker.ts` and SSE endpoints in `packages/web/src/server.ts` to support progressive card-by-card emission and graceful token limit handling:
- Emit `card_created` SSE events progressively into Task Center as each validated card is generated.
- When an LLM provider stream terminates due to output token limits (`finish_reason === 'length'` or `finish_reason === 'max_tokens'`), catch the event:
  - Harvest and commit all fully validated flashcards generated prior to the cutoff into SQLite.
  - Set job status to `COMPLETED_WITH_WARNINGS`.
  - Emit an SSE warning event (`job_warning: "Generation completed with partial results: output token limit reached. All completed cards were saved."`).
  - Render a clear amber warning badge and banner in the Task Center UI drawer and Generation Studio.
**Acceptance Criteria:**
- **Given** a long document generation job
- **When** cards are being generated by the worker thread
- **Then** the Web UI Task Center receives live SSE events displaying cards incrementally as they are created.
- **And** when an LLM hits the max output token limit mid-generation, all cards produced prior to truncation are committed to SQLite.
- **And** the Task Center drawer displays a warning badge indicating partial generation due to token limits.
- **And** no `LLMResponseParsingError` is thrown when token limits are reached.
- **And** integration tests verify progressive SSE emission and token cutoff retention.

### Story 16.5: Legacy Sanitizer Deprecation & Monorepo Test Suite
**ID:** `16-5-legacy-sanitizer-deprecation-and-monorepo-test-suite`
**Description:** Remove legacy heuristic parsing routines from `packages/adapters/src/llm/types.ts`:
- Delete `cleanJsonString()`, `isClosingQuote()`, and `sanitizeJsonString()`.
- Deprecate multi-hop syntax repair retry logic.
- Update `packages/adapters/test/llm-adapters.test.ts` to remove regex/sanitization unit tests and add robust tests for native structured outputs, schema error handling, and provider fallback behavior.
- Run complete monorepo verification: `npm run lint`, `npm run typecheck`, and `npm test` across all workspaces (`core`, `adapters`, `web`, `cli`).
**Acceptance Criteria:**
- **Given** the `packages/adapters` codebase
- **When** inspecting `packages/adapters/src/llm/types.ts`
- **Then** zero regex string cleaners, markdown fence strippers, or quote heuristics exist.
- **And** all adapters rely exclusively on native provider schema enforcement.
- **And** `npm test` passes across all monorepo packages.
- **And** `npm run lint` and `npm run typecheck` execute with zero errors or warnings.

## Epic 17: Rich Document Ingestion (PDF/Word), Media-Aware EPUB Publishing & Dashboard Persistence

**Goal:** Transform Flashcard Master into a rich, resilient document learning workstation by enabling local PDF and DOCX ingestion with user-configurable chunking into Document Catalog subdocuments, bundling external images into offline-ready EPUB eBooks (fixing Milan's .NET Weekly export), and guaranteeing zero data loss or selection resets upon browser reloads.

### Story 17.1: Database Path Unification & LocalStorage State Persistence
**ID:** `17-1-database-path-unification-and-localstorage-state-persistence`
**Description:** Unify the default SQLite database path to `~/.flashcard-master/data.sqlite` across all monorepo packages (`core`, `adapters`, `cli`, `web`). Persist generator selections, source filters, and active tab in `localStorage` so browser reloads restore state without data loss.
**Acceptance Criteria:**
- **Given** the CLI, Web server, and background workers
- **When** initializing database connections without explicit overrides
- **Then** all services connect to `~/.flashcard-master/data.sqlite` with WAL mode enabled.
- **And** when a user reloads the browser tab in Generate Studio or Dashboard, previously selected documents, source filters, and active view tabs are restored from `localStorage`.

### Story 17.2: Pure-JS PDF and DOCX Parsing Adapters
**ID:** `17-2-pure-js-pdf-and-docx-parsing-adapters`
**Description:** Implement pure-JS parsing adapters in `@flashcard-master/adapters` for `.pdf` (using `unpdf` or `pdf-parse`) and `.docx` (using `mammoth`) without native binary dependencies. Convert Word headings and tables to clean Markdown, and detect scanned image-only PDFs early with clear validation errors.
**Acceptance Criteria:**
- **Given** valid `.pdf` and `.docx` files
- **When** processed by the parsing adapters
- **Then** clean text and Markdown tables are extracted into `CleanTextDocument` records.
- **And** legacy pre-2007 `.doc` files are rejected with an explicit error.
- **And** image-only scanned PDFs with zero selectable text fail fast with a friendly validation warning indicating OCR is unsupported.

### Story 17.3: Configurable Document Slicing Engine & Catalog Integration
**ID:** `17-3-configurable-document-slicing-engine-and-catalog-integration`
**Description:** Implement the dual-slicing engine supporting semantic outline splitting and page-budget window chunking. Insert subdocument rows with page boundaries into the SQLite `documents` table and propagate coordinates to flashcard `sourceLocator`.
**Acceptance Criteria:**
- **Given** a multi-page PDF or Word document
- **When** ingested with a selected slicing strategy (Semantic Outline or Page-Budget window)
- **Then** distinct subdocument records are persisted to SQLite with hierarchical titles and page bounds (`startPage`, `endPage`).
- **And** flashcards generated from subdocuments have formatted `sourceLocator` references (e.g. `Calculus.pdf - Page 14, Section 2.1`).

### Story 17.4: Remote Media Localization & Packaging for EPUB Exports
**ID:** `17-4-remote-media-localization-and-packaging-for-epub-exports`
**Description:** Extend `DocumentExportService` and `MediaService` to scan external `http(s)://` image URLs in document text (e.g. Milan's .NET Weekly RSS). Download, cache, and bundle remote images into `OEBPS/images/` and rewrite chapter XHTML image tags for offline-ready EPUBs.
**Acceptance Criteria:**
- **Given** documents containing remote image URLs in clean text
- **When** exported to EPUB 3.0
- **Then** the exporter fetches images via `MediaService`, stores them in `OEBPS/images/`, and registers them in `content.opf`.
- **And** chapter XHTML files reference local relative image paths, rendering illustrations properly in offline e-readers.

### Story 17.5: Decoupled Async Background Worker Ingestion Pipeline
**ID:** `17-5-decoupled-async-background-worker-ingestion-pipeline`
**Description:** Decouple file upload from extraction with fast <50ms disk ACK, streaming page-by-page progress events via SSE to Task Center. Enforce worker heap limits, cancellation, and execution timeouts to prevent Node.js event-loop freezes and OOM crashes.
**Acceptance Criteria:**
- **Given** a user uploading large documents (e.g. 50+ pages)
- **When** the upload request is received
- **Then** the HTTP endpoint writes the raw file to disk and responds in <50ms with an ingestion job ID.
- **And** the background task worker extracts pages incrementally, streaming progress to the UI Task Center without blocking the server.

### Story 17.6: UI & CLI Slicing Controls & Monorepo Test Suite
**ID:** `17-6-ui-and-cli-slicing-controls-and-monorepo-test-suite`
**Description:** Update `AddSourceModal.svelte`, `SourceDocumentInspector.svelte`, and CLI `sources add` command with slicing configuration and subdocument displays. Implement end-to-end integration tests verifying PDF/Word ingestion, EPUB image packaging, and state retention across all packages.
**Acceptance Criteria:**
- **Given** the Web UI and CLI
- **When** adding a local PDF or DOCX file
- **Then** the user can configure slicing mode and chunk thresholds.
- **And** the Document Inspector renders the subdocument hierarchy with page badges and word counts.
- **And** the full monorepo test suite passes (`npm test`, `npm run lint`, `npm run typecheck`).

---

## Epic 18: Knowledge-First Data Sources, EPUB Ingestion & Publishing, and Unified UI Settings Studio

**Goal:** Transform Flashcard Master into a truly content-first learning workstation by decoupling flashcard decks from data sources (designating Generate Studio as the single canonical source of truth for deck routing with smart autocomplete), centralizing all application parameters and environment overrides into an interactive UI Settings Studio (including AnkiConnect configuration, live testing, and AI defaults), introducing pure-JS EPUB eBook ingestion with automatic chapter slicing and media localization, and publishing curated flashcard decks as interactive EPUB 3.0 study guide eBooks for e-readers.

### Story 18.1: Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio
**ID:** `18-1-decouple-decks-from-data-sources-and-centralize-deck-selection`
**Description:** Decouple flashcard decks from data sources by making `data_sources.target_deck` optional and deprecated in SQLite schema and repository layers. Remove "Target Deck" input fields from `AddSourceModal.svelte` and `EditSourceModal.svelte`, and remove deck badges from `SourcesView.svelte`. Make `GenerateStudio.svelte` and Document Inspector the single source of truth where the destination deck is specified, enhanced with an auto-suggesting deck selector dropdown populated from `cardRepo.listDecks()` alongside custom new deck entry.
**Acceptance Criteria:**
- **Given** the Add Source modal in the Web UI
- **When** the user adds a new data source (local file, RSS, Web Reader, Notion, or sitemap)
- **Then** no Target Deck field is displayed or required, and the source persists successfully.
- **And** no deck badges are displayed on the data source cards in Sources View or Dashboard.
- **And** Generate Studio provides a deck selector that autocompletes from existing cards in SQLite while supporting new deck names.
- **And** generated cards are saved to SQLite with the target deck chosen in Generate Studio.

### Story 18.2: Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)
**ID:** `18-2-centralized-system-settings-and-integrations-studio`
**Description:** Build a unified System Settings management architecture in `@flashcard-master/core` and the Web UI Settings panel backed by the SQLite `app_settings` key-value table. Implement the strict hierarchical fallback chain (`SQLite app_settings -> process.env fallback -> hardcoded default`). Expose REST API endpoints to read, write, and test configurations. In `SettingsView.svelte`, construct dedicated, intuitive sections for Anki Desktop Integration (endpoint URL, optional API key token, connection timeout, live connection tester), AI Generation Defaults (default provider, model, persona, difficulty, card count, grounding toggle), Worker Pool & Task Processing (concurrency limits, task timeout), Document Ingestion & Slicing Defaults (slicing mode, page budget), and EPUB Publishing Metadata (default author, publisher).
**Acceptance Criteria:**
- **Given** the Settings View in the Web UI
- **When** navigating to the Settings page
- **Then** the user sees sections for AI Providers, AI Defaults, Anki Desktop, Worker Processing, and Logging.
- **And** user can input a custom AnkiConnect endpoint URL, click "Test Connection", and receive live health feedback.
- **And** newly opened Generate Studio sessions automatically hydrate with the configured AI generation defaults.
- **And** background task workers immediately respect updated worker concurrency limits.

### Story 18.3: Local EPUB Ingestion Strategy & Chapter Slicing Engine
**ID:** `18-3-local-epub-ingestion-strategy-and-chapter-slicing-engine`
**Description:** Implement a pure-JavaScript `EpubParser` in `@flashcard-master/adapters` utilizing libraries already bundled in the monorepo (`jszip`, `fast-xml-parser`, `jsdom`). Ingest EPUB 2 and EPUB 3 publications by parsing container manifests, reading spine order, and TOC navigation (`nav.xhtml` & `toc.ncx`). Extract chapters in reading order, convert XHTML to clean GitHub-Flavored Markdown, extract embedded images into `MediaService`, and integrate with the Document Slicing Engine to register discrete subdocuments in the SQLite `documents` catalog with chapter titles, page/chapter coordinates, and word counts.
**Acceptance Criteria:**
- **Given** a valid DRM-free `.epub` file
- **When** uploaded via the Add Source modal or CLI
- **Then** the file uploads in <50ms and queues an asynchronous ingestion task in Task Center.
- **And** the worker thread extracts chapters in proper spine order, converts XHTML to clean Markdown, preserves embedded illustrations, and registers subdocuments in the Document Catalog.
- **And** flashcards generated from the EPUB source include exact chapter titles in `sourceLocator`.

### Story 18.4: Flashcard Deck EPUB Study Guide Exporter
**ID:** `18-4-flashcard-deck-epub-study-guide-exporter`
**Description:** Implement `EpubFlashcardExporter` in `@flashcard-master/adapters` conforming to `ExporterPort`. Synthesize flashcard decks into a standards-compliant EPUB 3.0 study guide eBook with e-reader friendly typography, interactive HTML5 collapsible reveal cards (`<details><summary>Q: ...</summary><div>A: ...</div></details>`), Table of Contents grouped by Deck and Difficulty, rich metadata tags, verbatim quotes, and source locator references. Expose in `ExportCenter.svelte` with a 1-click download button and CLI `export --format epub`.
**Acceptance Criteria:**
- **Given** curated flashcards in the database
- **When** the user clicks "Download EPUB" in Export Center
- **Then** the browser downloads a valid `.epub` file named after the selected deck (or `all-decks-flashcards.epub`).
- **And** the EPUB package conforms strictly to EPUB 3.0 standards (STORE uncompressed `mimetype` at byte offset 0, valid OPF and NAV).
- **And** opening the file in e-readers (Kindle, Kobo, Apple Books, Calibre) presents an interactive study guide with reveal toggles, difficulty tags, and citations.

### Story 18.5: Monorepo Integration & End-to-End Verification
**ID:** `18-5-monorepo-integration-and-end-to-end-verification`
**Description:** Implement comprehensive integration and regression test coverage across all monorepo packages (`core`, `adapters`, `web`, `cli`). Verify data source deck decoupling, settings persistence and live Anki testing, EPUB file ingestion, chapter slicing, flashcard EPUB exporting, and monorepo build gates.
**Acceptance Criteria:**
- **Given** the monorepo test suite
- **When** executing `npm test`
- **Then** 100% of tests pass across `core`, `adapters`, `web`, and `cli`.
- **And** `npm run lint` and `npm run typecheck` execute with zero errors or warnings.

---

## Epic 19: Deck Lifecycle Management, Partial Exports, and UI Performance Hardening

**Goal:** Empower users with granular control over their flashcard knowledge base by introducing deck lifecycle operations (cloning decks, automatic batch splitting, and selective card movement), partial and time-scoped export capabilities (date-range filtering, random subsampling, card limit budgets), asynchronous background subdocument synthesis with real-time Task Center feedback, an interactive tag selector for data sources, and performance/layout hardening across the application (Question Explorer infinite scrolling and responsive text overflow protection).

### Story 19.1: Question Explorer Infinite Scroll & Backend Pagination
**ID:** `19-1-question-explorer-infinite-scroll-and-lazy-loading`
**Description:** Upgrade the Question Explorer from loading all flashcards into memory at once to scalable backend pagination and client-side infinite scrolling. Extend `FlashcardRepository.list` and `GET /api/cards` with `limit`, `offset`, and total matching count metadata. In `QuestionExplorer.svelte`, implement an intersection observer to lazily fetch and append batches of 25–50 cards as the user scrolls, retaining active filters (deck, difficulty, search query) seamlessly across pagination pages and preserving card selection states.
**Acceptance Criteria:**
- `GET /api/cards?limit=25&offset=0` returns paginated card slices and total count metadata.
- Question Explorer renders the initial page of cards swiftly without lagging on large card collections (e.g. 1,000+ cards).
- Scrolling toward the bottom automatically fetches and appends the next batch without flickering or loss of scroll position.
- Changing search filters, deck chips, or difficulty tiers resets the cursor and fetches the first filtered page.
- Bulk selections (`Select All Filtered`) correctly track and operate across paginated datasets.

### Story 19.2: Deck Operations: Clone, Batch Split & Selective Card Moving
**ID:** `19-2-deck-operations-clone-split-and-selective-card-moving`
**Description:** Implement comprehensive deck management capabilities in `@flashcard-master/core` and the Web UI. Support (1) **Clone Deck**: duplicates an entire deck under a new name with fresh UUIDs and preserved metadata; (2) **Automatic Batch Splitting**: divides a large deck into equal-sized sub-decks with a configurable card batch size (e.g., 25 cards per sub-deck named `Deck - Part 1`, `Deck - Part 2`); and (3) **Selective Card Movement**: allows users to select specific cards in Question Explorer and move them to an existing or newly created deck via a batch action dropdown. Expose REST endpoints `POST /api/decks/clone`, `POST /api/decks/split`, and `POST /api/decks/move-cards`.
**Acceptance Criteria:**
- User can click "Clone Deck" in Question Explorer or Export Center to create a duplicate deck under a specified name.
- User can click "Split Deck" to specify a batch size (e.g. 20 cards) and automatically divide the deck into numbered sub-decks.
- In Question Explorer, selecting cards reveals a "Move to Deck" bulk action allowing instant reassignment to another deck.
- SQLite transactions guarantee atomic deck modifications with zero card loss or citation corruption.

### Story 19.3: Partial, Date-Filtered & Randomized Export Engine
**ID:** `19-3-partial-date-filtered-and-randomized-export-engine`
**Description:** Enhance `ExportService`, exporter implementations, and `ExportCenter.svelte` with advanced export scoping. Support exporting cards by: (1) **Generation Date Range**: preset filters ("Last 24 Hours", "Last 7 Days", "Last 30 Days", "Custom Range") filtering by `created_at`; (2) **Random Subsampling & Shuffling**: export a random subset of $N$ cards in randomized order for practice sessions; and (3) **Card Count Limit / Budget**: specify a partial export limit (e.g., export top $N$ cards from a deck). Update CLI `export` with flags `--after`, `--before`, `--limit`, and `--shuffle`.
**Acceptance Criteria:**
- Export Center UI provides a "Time & Scope Filter" accordion allowing date range selection, partial count limit, and random shuffle toggle.
- Exporting with "Last 7 Days" filters cards whose `createdAt` falls within the specified range across all export formats (`apkg`, `epub`, `markdown`, `html`, `csv`, `tsv`).
- Exporting with "Random Sample" of size $N$ randomly samples $N$ cards from the filtered deck in shuffled order.
- CLI commands `flashcard-master export --after 2026-10-01 --limit 50 --shuffle` execute correctly.

### Story 19.4: Interactive Tag Selector for Data Sources
**ID:** `19-4-interactive-tag-selector-for-data-sources`
**Description:** Replace the comma-separated text input for tags in `AddSourceModal.svelte` and `EditSourceModal.svelte` with a modern, interactive tag pill component. Query distinct tags already present in the SQLite database (`GET /api/sources/tags`) to provide an autocomplete suggestion dropdown. Allow users to click suggestions to add tags, press Enter to create custom tags, and click `✕` on pills to remove tags. Enforce tag normalization (trimmed, lowercased, deduplicated).
**Acceptance Criteria:**
- Adding or editing a data source displays interactive tag pills instead of a plain comma-separated text box.
- Focusing the tag input displays an auto-suggest list of existing tags across sources in SQLite.
- Typing a new tag and pressing Enter adds a new pill tag.
- Clicking the `✕` on any pill immediately removes the tag.
- Tags persist cleanly to SQLite as JSON arrays without whitespace issues or duplicates.

### Story 19.5: Asynchronous Subdocument Generation via Task Center
**ID:** `19-5-asynchronous-subdocument-generation-via-task-center`
**Description:** Resolve the subdocument generation failure in `SourceDocumentInspector.svelte` and unify all document-level synthesis into the asynchronous background worker queue. When clicking "⚡ Generate" from the Document Inspector or Document Preview modal: (1) validate document existence and settings; (2) dispatch an asynchronous job to `JobManager` (`POST /api/generate` with `async: true` / non-blocking); (3) immediately open the Task Center drawer with active progress streaming and SSE event logs; and (4) reactively update document card count badges upon job completion.
**Acceptance Criteria:**
- Clicking "⚡ Generate" on any subdocument in `SourceDocumentInspector.svelte` immediately enqueues a background task in `JobManager`.
- The Task Center drawer opens with live step progress, token counts, and streaming logs.
- The UI does not freeze or block during LLM synthesis.
- Upon job completion, document card count badges in the inspector refresh automatically without requiring a full page reload.

### Story 19.6: Monorepo Responsive Layout & Text Overflow Hardening
**ID:** `19-6-monorepo-responsive-layout-and-overflow-hardening`
**Description:** Fix text loss, text truncation, and viewport resize bugs across all major UI surfaces. Ensure graceful text wrapping, markdown code-block overflow scrolling, and resilient responsive flex/grid layouts in: (1) **Question Explorer card grid**: fix card text overflow, prevent clipping of long questions/answers/quotes, and support smooth expansion; (2) **Document Inspector & Preview modal**: add horizontal scroll containers for wide code blocks and responsive modal width; (3) **Slide-Over Drawers** (`CardEditorDrawer`, `TaskCenterDrawer`): fix viewport width clipping and drawer resizing on medium/small viewports; (4) **Generate Studio**: fix horizontal overflow on the source/subdocument tree hierarchy. Add automated regression tests across packages.
**Acceptance Criteria:**
- Extremely long questions, answers, and verbatim quotes in Question Explorer wrap cleanly without clipping or text loss.
- Preformatted code blocks and tables in the Document Preview modal scroll horizontally without expanding the modal beyond viewport width.
- Slide-over drawers scale smoothly on window resize without causing horizontal viewport scrollbars on the main dashboard.
- Full monorepo test suite passes (`npm test`, `npm run typecheck`, `npm run build`).

### Story 19.7: Subdocument Explorer & Reader Redesign
**ID:** `19-7-subdocument-explorer-and-reader-redesign`
**Description:** Revamp `SourceDocumentInspector.svelte` to make navigating, reading, and reviewing large catalogs of subdocuments (from EPUB books, PDF slicing, and web crawls) effortless. Replace the tall, vertically stacked document cards and cramped 680px drawer with:
1. **Compact Data Row / Table View**: Render subdocuments in scannable, compact rows with dedicated columns for selection checkbox, document title, page/chapter badge, word count, flashcard count badge, and a horizontal inline actions bar (`👁️ Preview`, `📤 Export`, `⚡ Generate`, `🗑️ Delete`).
2. **Expandable / Full-Width Drawer Layout**: Support dynamic width expansion (e.g., standard drawer with a 1-click toggle to expand to wide or full-screen modal mode) so users have generous room to inspect documents on any display size.
3. **Smooth Scrolling & Scanability**: Improve layout hierarchy, sticky header controls, and responsive row states so reviewing 50+ chapters or sliced articles is fast and seamless.
**Acceptance Criteria:**
- Subdocuments in `SourceDocumentInspector.svelte` are displayed in a clean, compact row/table format instead of tall vertical cards.
- Document action buttons (`Preview`, `Export`, `Generate`, `Delete`) are arranged horizontally without taking excessive vertical space.
- The inspector provides an expand/collapse width toggle (e.g., normal drawer vs wide/fullscreen view) allowing users to expand the workspace on demand.
- Document title, metadata badges (page bounds, word counts, card counts), and action buttons remain fully aligned and readable without truncation or horizontal spill.
- Multi-selection and bulk actions (export selected, delete selected) function smoothly with the compact row layout.

---

## Epic 20: Open-Source Foundations, Community Documentation & Cross-Platform Desktop Distribution

**Goal:** Solidify Flashcard Master as a production-grade, community-ready, and independently distributed open-source learning application. Establish legal copyleft protection against proprietary SaaS exploitation via AGPL-3.0 with sponsorship channels; provide a published online documentation hub (User Guide, architecture, GitHub Pages); deliver friendly contextual onboarding and non-technical setup UX for AI providers, AnkiConnect, and Notion; implement reusable cross-platform GitHub issue and PR automation in TypeScript with an in-repo workflow skill; institute community contribution standards (CONTRIBUTING.md, templates, Code of Conduct); and package the application into standalone, signed desktop releases for Windows, macOS, and Linux using Electron and automated GitHub Actions.

### Story 20.1: Model Documentation Audit & In-Repo LLM Model Advisor Skill
**ID:** `20-1-model-documentation-audit-and-model-advisor-skill`
**Description:** Audit all repository documentation and UI descriptions to ensure they strictly feature modern, cutting-edge default models (Gemini: `gemini-3.6-flash`, Anthropic: `claude-haiku-4-5-20251001`, OpenAI: `gpt-4o-mini`, Ollama: `phi4-mini`) and purge all mentions of legacy models (e.g., `gemini-1.5-pro`). Design and implement a dedicated repository agent skill (`.agent/skills/model-advisor/`) that evaluates user criteria (cost/efficiency budget, offline privacy, deep synthesis) to recommend the optimal provider and model configuration for any flashcard generation scenario.
**Acceptance Criteria:**
- `README.md`, `docs/settings-configuration.md`, and UI provider descriptions are audited and updated with zero references to legacy or superseded models.
- The 4 core supported providers remain strictly Gemini, Anthropic, OpenAI, and Ollama.
- `.agent/skills/model-advisor/SKILL.md` is implemented with clear decision trees, token pricing formulas, and recommended model presets.
- Invoking the skill provides grounded recommendations matching user constraints (e.g. 100% offline local vs high-throughput bulk synthesis).

### Story 20.2: AGPL-3.0 Licensing & Community Sponsorship Integration
**ID:** `20-2-agpl-licensing-and-community-sponsorship-integration`
**Description:** Formally license Flashcard Master under the GNU Affero General Public License v3 (AGPL-3.0) to safeguard the project against proprietary closed-source SaaS clones over network services while keeping it 100% free for individual users, researchers, and community collaborators. Add the official root `LICENSE` file, configure `"license": "AGPL-3.0"` in `package.json`, and establish community sponsorship channels via `.github/FUNDING.yml` (GitHub Sponsors, Buy Me a Coffee) with links in the README and docs footer.
**Acceptance Criteria:**
- Root `LICENSE` contains the complete official GNU Affero General Public License v3.0 text.
- Root `package.json` specifies `"license": "AGPL-3.0"`.
- `.github/FUNDING.yml` is created with GitHub Sponsors and Buy Me a Coffee identifiers.
- `README.md` includes the official license badge, copyleft summary, and community support/sponsorship section.

### Story 20.3: Public Documentation Hub & GitHub Pages CI/CD Pipeline
**ID:** `20-3-public-documentation-hub-and-github-pages-pipeline`
**Description:** Build a comprehensive, user-friendly documentation hub published publicly to GitHub Pages. Author a structured User Guide in `docs/user-guide/` covering: (1) 3-minute Quickstart, (2) Ingestion Playbook (Web, RSS, Notion, EPUB/PDF chapter slicing), (3) Flashcard Synthesis & Prompt Tuning (difficulty, depth modes, personas), (4) Study & Export Workflows (AnkiConnect live sync, Kindle/Kobo EPUBs, printable PDF study sheets), and (5) Troubleshooting & FAQ. Distill BMad architectural output into public developer documentation (`docs/ARCHITECTURE.md`). Configure a static documentation generator (VitePress or Starlight) with an automated GitHub Actions CI/CD workflow that deploys to GitHub Pages upon pushes to `main`. Add direct in-app links in the navigation header to the published site.
**Acceptance Criteria:**
- Complete User Guide is authored under `docs/user-guide/` with clear, non-technical instructions and diagrams.
- `docs/ARCHITECTURE.md` is updated to reflect all monorepo capabilities across Epics 1–19.
- Static documentation site builds cleanly and deploys automatically to GitHub Pages via `.github/workflows/deploy-docs.yml`.
- Web UI and Desktop navigation headers contain a "📖 Documentation" link opening the hosted docs site.

### Story 20.4: Contextual Setup UX & Human-Centric Onboarding
**ID:** `20-4-contextual-setup-ux-and-human-centric-onboarding`
**Description:** De-technicalize the application setup experience across the Web UI and Desktop app. Preserve standard developer labels for LLM providers (`API Key`, `Base URL`) while adding lightweight contextual tooltips and 1-click console links (`Get API Key`). Implement an interactive 3-step Notion permissions walkthrough modal/card highlighting the crucial step of inviting the integration to target pages via the `•••` menu, accompanied by an actionable page access diagnostic. Implement a Desktop Anki setup card with live status badging (`🟢 Anki Ready` / `⚪ Anki Not Running`), 1-click copy for add-on code `2055492159`, and friendly connection error diagnosis. Replace technical slicing terms with human-readable choices (`Split by Chapters & Outline`, `Split by Page Blocks`, `Keep as Single Document`). Add a welcoming first-run onboarding empty state when no sources or keys exist.
**Acceptance Criteria:**
- LLM provider cards in `SettingsView.svelte` feature direct links to developer consoles and contextual tooltips explaining key generation and billing.
- Notion setup displays an illustrated 3-step walkthrough with explicit guidance on sharing pages with the integration, and verifies page permissions on test.
- AnkiConnect card displays live connection detection with 1-click add-on installation instructions and friendly error messages when desktop Anki is closed.
- Document slicing controls in ingestion modals use clear, human-readable labels and descriptions.
- Dashboard renders a welcoming onboarding card on first run guiding users through setup.

### Story 20.5: Cross-Platform GitHub Issue & PR Automation Engine
**ID:** `20-5-cross-platform-github-automation-engine`
**Description:** Replace obsolete hardcoded issue scripts with a unified, cross-platform TypeScript/Node.js automation script (`scripts/github-workflow.ts`) invocable via `npm run gh:issues` and `npm run gh:pr`. Support batch creation of GitHub issues for any epic (creating the master Epic issue and individual Story issues with standard labels `epic` and `story`). Support automated PR creation from the active branch, extracting story title, description, and acceptance criteria from story artifacts and automatically appending `Closes #<id>` linking. Implement a dedicated in-repo agent skill (`.agent/skills/github-workflow/`) to drive this workflow autonomously.
**Acceptance Criteria:**
- `scripts/github-workflow.ts` executes natively on Windows, macOS, and Linux without shell-specific dependencies.
- `npm run gh:issues -- --epic <number>` creates master Epic and child Story issues with standard labels via GitHub CLI (`gh`).
- `npm run gh:pr` parses the current branch, formats a conventional commit PR title, populates the PR body with the story spec, and links the issue.
- `.agent/skills/github-workflow/SKILL.md` provides complete agent instructions for automated issue tracking and PR generation.

### Story 20.6: Open-Source Contribution Standards & Community Health
**ID:** `20-6-open-source-contribution-standards-and-community-health`
**Description:** Establish professional open-source contribution guidelines and community health standards. Revamp `CONTRIBUTING.md` with a clean Hexagonal Architecture primer, step-by-step local setup, git branch naming conventions (`feat/...`, `fix/...`), Conventional Commits requirements, and strict pre-PR verification gates (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`). Add standard GitHub templates: `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, and `.github/PULL_REQUEST_TEMPLATE.md`. Implement Contributor Covenant v2.1 in `CODE_OF_CONDUCT.md` and responsible security disclosure guidelines in `SECURITY.md`.
**Acceptance Criteria:**
- `CONTRIBUTING.md` provides an exhaustive guide covering monorepo structure, test commands, and pull request checklist.
- GitHub issue templates for bug reports and feature requests render cleanly in GitHub's New Issue chooser.
- `PULL_REQUEST_TEMPLATE.md` automatically populates new PRs with verification checklists and issue linkage.
- `CODE_OF_CONDUCT.md` and `SECURITY.md` are present in the repository root.

### Story 20.7: Electron Desktop Packaging & Multi-OS Release Pipeline
**ID:** `20-7-electron-desktop-packaging-and-multi-os-release-pipeline`
**Description:** Package Flashcard Master into a standalone cross-platform desktop application using Electron and `electron-builder`. Wrap `@flashcard-master/web` (in-process Node.js server, Svelte 5 frontend, and native C++ `better-sqlite3` bindings) with zero backend rewrites. Store SQLite data automatically in the OS user data directory (`app.getPath('userData')`). Implement custom dark slate window framing and system tray minimize support. Build an automated GitHub Actions CI/CD release workflow (`.github/workflows/release-desktop.yml`) that triggers on release git tag push to build, package, sign, and publish installers for Windows (`.exe` NSIS installer and portable), macOS (`.dmg` Universal/arm64), and Linux (`.AppImage` and `.deb`) with assets attached to GitHub Releases.
**Acceptance Criteria:**
- Electron desktop wrapper initializes local server, connects to native SQLite database in OS user-data directory, and loads the Svelte client seamlessly.
- Application builds cleanly with `electron-builder` with working native `better-sqlite3` bindings.
- Native window supports dark theme, responsive resizing, and system tray minimize/restore.
- GitHub Actions release pipeline builds and attaches Windows, macOS, and Linux binaries to GitHub Releases on tag push.
















