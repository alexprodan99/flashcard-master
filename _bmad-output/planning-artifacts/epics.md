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
- **FR-201**: Atomic Front/Back Cards (Generate concise, atomic Front/Back Q&A flashcards following the Minimum Information Principle).
- **FR-202**: Mandatory Verbatim Citation Guard (Every card must include the exact source sentence/quote; reject ungrounded cards).
- **FR-203**: Configurable Difficulty Levels (Support `beginner`, `intermediate`, `expert` cognitive depth scaling).
- **FR-204**: Selectable Prompt Personas (Support `socratic-mentor`, `strict-examiner`, `executive-synthesizer` and custom prompts).
- **FR-205**: Auto-Commit to Database (Automatically persist generated flashcards directly to SQLite database with metadata).
- **FR-206**: Question Deduplication (Calculate text similarity / hash matching to filter out duplicate questions).
- **FR-301**: Native Anki Package (`.apkg`) (Generate valid `.apkg` packages with front/back templates, CSS styling, tags, and origin metadata).
- **FR-302**: AnkiConnect Live Sync (Push cards directly to running desktop Anki via HTTP API `http://localhost:8765`).
- **FR-303**: Delimited File Export (Export flashcards to standard Anki-compatible CSV and TSV formats).
- **FR-304**: Active-Recall Markdown (Export cards as Markdown files utilizing collapsible `<details><summary>Q</summary>A & Quote</details>`).
- **FR-305**: PDF Study Guide (Export cards into a structured, printable 2-column Q&A PDF study sheet with citation callouts).
- **FR-306**: Scoped Export Filtering (Filter exports by data source, tag, difficulty level, or creation date range).
- **FR-401**: Interactive CLI Setup Wizard (`flashcard-master config init` / `source add -i` with keyboard arrow navigation).
- **FR-402**: Scriptable CLI Subcommands (`source`, `sync`, `export`, `cards`, `config` for automated workflows).
- **FR-403**: Local Web UI Dashboard (`flashcard-master ui` serving web app on `localhost:3000`).
- **FR-404**: UI Sources Management (Add, edit, toggle, and trigger manual sync on data sources with live progress feedback).
- **FR-405**: UI Question Explorer & Editor (Searchable card database with keyword search, filter chips, and inline card editor drawer).
- **FR-406**: UI 1-Click Export Center (1-click downloads for `.apkg`, Markdown, PDF, and 1-click Push to running AnkiConnect).

### Non-Functional Requirements

- **NFR-101**: Performance & Latency (Reader-mode extraction < 3s for < 3,000 words; generation of 10 cards < 15s; database queries < 100ms).
- **NFR-201**: Privacy & Local-First Invariant (All configurations, source URLs, content caches, and generated cards reside exclusively in local SQLite).
- **NFR-202**: Zero Telemetry (No telemetry, tracking, or content transmitted externally except direct user-configured LLM API calls).
- **NFR-301**: Reliability & Fault Isolation (Network/parsing failures on an individual source do not crash the overall sync batch).
- **NFR-302**: Transactional Integrity (Database writes are atomic with SQLite WAL mode).
- **NFR-401**: Cross-Platform Compatibility (CLI and local Web UI operate consistently across Windows, macOS, and Linux).

### Additional Requirements (from Architecture)

- **ARCH-1**: Monorepo Scaffolding (Turborepo / npm workspaces with `packages/core`, `packages/adapters`, `packages/cli`, `packages/web`).
- **ARCH-2**: Ports & Adapters Isolation (Core domain imports zero external drivers or vendor SDKs; all I/O via ports).
- **ARCH-3**: Strategy Pattern Registry (`StrategyRegistry` managing `RssStrategy`, `WebReaderStrategy`, `LocalFileStrategy`).
- **ARCH-4**: Embedded SQLite Database Client (better-sqlite3 / sqlite3 with WAL mode and foreign key constraints).
- **ARCH-5**: Vendor-Neutral LLM Provider Adapters (OpenAI, Anthropic, Gemini, Ollama adapters implementing `LLMProviderPort`).
- **ARCH-6**: Multi-Target Exporter Adapters (`ApkgExporter`, `AnkiConnectAdapter`, `MarkdownExporter`, `PdfExporter`).

### UX Design Requirements (from DESIGN.md & EXPERIENCE.md)

- **UX-DR1**: Visual Design System & Tokens (Dark slate `#0f172a` primary theme, light theme, typography scale, 8pt spacing grid).
- **UX-DR2**: Flashcard Visual Anatomy (Front/back layout, status badges, and highlighted verbatim source quote callout block).
- **UX-DR3**: Sources Manager Interface (Table of active feeds/paths, status badges, and Add Source modal with type selector).
- **UX-DR4**: Question Explorer & Filter Bar (Real-time full-text search, source filter chips, difficulty badges, and card grid).
- **UX-DR5**: Inline Card Editor Slide-over Drawer (Edit question, answer, tags, and difficulty without navigating away).
- **UX-DR6**: 1-Click Export Center & Anki Badging (Real-time AnkiConnect status badge `🟢 Anki Ready` / `⚪ Anki Offline`, format selector).
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
- **FR-201**: Epic 2 - Atomic Front/Back Flashcard Generation
- **FR-202**: Epic 2 - Mandatory Verbatim Citation Guard
- **FR-203**: Epic 2 - Configurable Difficulty Levels
- **FR-204**: Epic 2 - Selectable & Customizable Prompt Personas
- **FR-205**: Epic 2 - Auto-Commit to Database
- **FR-206**: Epic 2 - Question Deduplication
- **FR-301**: Epic 3 - Native Anki Package (.apkg) Exporter
- **FR-302**: Epic 3 - Live Desktop AnkiConnect Integration
- **FR-303**: Epic 3 - Delimited File Export (CSV/TSV)
- **FR-304**: Epic 3 - Active-Recall Markdown Exporter
- **FR-305**: Epic 3 - Printable PDF Study Guide Exporter
- **FR-306**: Epic 3 - Scoped & Filtered Exporting
- **FR-401**: Epic 4 - Interactive CLI Setup Wizard
- **FR-402**: Epic 4 - Scriptable CLI Subcommands
- **FR-403**: Epic 4 - Local Web UI Dashboard Server
- **FR-404**: Epic 4 - UI Sources Management
- **FR-405**: Epic 4 - UI Question Database Explorer & Inline Editor
- **FR-406**: Epic 4 - UI 1-Click Export Center

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

**Goal:** Deliver the user-facing interfaces: an interactive terminal setup wizard and scriptable CLI subcommands, alongside a local visual Web UI dashboard with Sources Manager, Question Explorer, and 1-Click Export Center.

### Story 4.1: Interactive Terminal Setup Wizard & Scriptable CLI
As a command-line developer,  
I want an interactive terminal wizard and scriptable CLI subcommands,  
So that I can configure sources, trigger syncs, and export cards directly from my terminal.

**Acceptance Criteria:**
- **Given** the user runs lashcard-master config init
- **When** the interactive wizard opens
- **Then** arrow-key menus guide the user through provider selection, API keys, persona choices, and initial data sources.
- **And** CLI subcommands (source add, sync, xport, cards list) execute headlessly with exit codes.

### Story 4.2: Local Web UI Dashboard Server & Design System Foundation
As a user,  
I want a local web dashboard served by lashcard-master ui,  
So that I have a beautiful visual interface for managing my knowledge base.

**Acceptance Criteria:**
- **Given** the user runs lashcard-master ui
- **When** the local Fastify/Vite server starts on http://localhost:3000
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

### Story 4.6: 1-Click Export Center & AnkiConnect Badging
As a user,  
I want a dedicated Export Center in the Web UI with live AnkiConnect detection,  
So that I can push cards to Anki or download .apkg, Markdown, and PDF files with one click.

**Acceptance Criteria:**
- **Given** the user opens the Export Center
- **When** desktop Anki is running on the machine
- **Then** the UI shows a 🟢 Anki Ready badge and enables the 1-click "Push to Anki" button.
- **And** 1-click download buttons generate and stream .apkg, Markdown, and PDF files directly to the browser.



