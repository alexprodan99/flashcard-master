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
- **FR-406**: UI 1-Click Export & Anki Center (1-click downloads for `.apkg`, Markdown, PDF, and 1-click Push to running AnkiConnect).

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
- **FR-406**: Epic 4 - UI 1-Click Export & Anki Center

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

## Epic 9: Data Sources Dashboard & Document Catalog Inspector

**Goal:** Transform the Sources Manager into a full-featured Data Sources Dashboard and Document Catalog Inspector, allowing users to drill into any source, inspect all ingested articles/documents, view word counts, preview extracted text, and selectively generate flashcards from specific documents.

### Story 9.1: Persistent Discovered Document Storage & Repository
**ID:** `9-1-document-storage-and-sync-persistence`
**Description:** Create a dedicated `documents` table in SQLite schema migrations and implement `DocumentRepository` in `@flashcard-master/core`. Update `IngestionService.syncSource()` to automatically upsert discovered articles/documents with title, URL, clean text, word count, and content hash during sync cycles.
**Acceptance Criteria:**
- **Given** an ingestion source being synced (RSS, Sitemap, Web, LLMs.txt, Local)
- **When** `IngestionService.syncSource(sourceId)` executes
- **Then** each extracted clean document is persisted into the `documents` SQLite table.
- **And** `DocumentRepository` provides `listBySourceId(sourceId)`, `getById(id)`, `search(query)`, and `getDocumentCount(sourceId)`.

### Story 9.2: Document Catalog REST APIs & Clean Text Preview
**ID:** `9-2-document-catalog-rest-apis`
**Description:** Implement backend REST endpoints in `packages/web/src/server.ts` to inspect documents (`GET /api/sources/:id/documents`, `GET /api/documents/:id`), fetch document counts, and support document-scoped card generation (`POST /api/generate` with `documentIds?: string[]`).
**Acceptance Criteria:**
- **Given** a client querying source documents
- **When** `GET /api/sources/:id/documents` is requested
- **Then** the server returns the array of discovered documents with metadata (title, URL, word count, discovery timestamp, generated card count).
- **And** `GET /api/documents/:id` returns the full clean text content for inspection.

### Story 9.3: Svelte 5 Data Sources Dashboard & Document Inspector Panel
**ID:** `9-3-sources-dashboard-and-inspector-ui`
**Description:** Enhance `SourcesView.svelte` and create `SourceDocumentInspector.svelte` (or interactive slide-over drawer) displaying real-time metrics per data source (total documents discovered, total cards produced, last sync timestamp) and an interactive searchable document table.
**Acceptance Criteria:**
- **Given** the Sources Manager view in Web UI
- **When** the user clicks "Inspect Documents 📖" on any data source card
- **Then** a document inspector modal/drawer opens displaying all discovered articles, search filter, word counts, and direct links to original source URLs.

### Story 9.4: Document Clean Text Preview Drawer & Targeted Single-Article Card Generation
**ID:** `9-4-document-text-preview-and-targeted-generation`
**Description:** Add a clean text preview modal in the Document Inspector allowing users to inspect extracted article text, and add a "⚡ Generate Cards from this Article" action button that routes to Generate Studio or triggers targeted generation for the selected document.
**Acceptance Criteria:**
- **Given** an article in the Document Inspector
- **When** the user clicks "Preview Text"
- **Then** a formatted reader drawer shows the extracted clean text and word count.
- **And** clicking "Synthesize Flashcards" triggers targeted card generation exclusively for that document.

### Story 9.5: CLI Document Inspection Subcommand & Test Suite Verification
**ID:** `9-5-cli-document-inspection-and-verification`
**Description:** Add CLI subcommand `flashcard-master source docs <source-id>` to list all cached articles from the terminal, and write comprehensive automated test suites for repository, API, and CLI inspection.
**Acceptance Criteria:**
- **Given** terminal user running `flashcard-master source docs <source-id>`
- **When** the command executes
- **Then** a formatted table of discovered articles, URLs, word counts, and sync timestamps is printed.
- **And** all unit, integration, and UI tests pass with 100% success.








