# Epic 18 Context: Knowledge-First Data Sources, EPUB Ingestion & Publishing, and Unified UI Settings Studio

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Transform Flashcard Master into a truly content-first learning environment by decoupling flashcard decks from data sources (designating Generate Studio as the single source of truth for deck routing), centralizing all application settings and environment overrides in an interactive UI Settings Studio (including AnkiConnect configuration and AI defaults), introducing pure-JS EPUB eBook ingestion with automatic chapter slicing and media localization, and publishing curated flashcard decks as interactive EPUB 3.0 study guide eBooks for e-readers.

## Stories

- Story 18.1: Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio
- Story 18.2: Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)
- Story 18.3: Local EPUB Ingestion Strategy & Chapter Slicing Engine
- Story 18.4: Flashcard Deck EPUB Study Guide Exporter
- Story 18.5: Monorepo Integration & End-to-End Verification

## Requirements & Constraints

- **Content vs. Output Boundary:** Data sources represent immutable knowledge repositories (books, articles, feeds, notes), not target flashcard decks. A user must be able to generate multiple distinct decks from the same data source over time.
- **Backward Compatibility:** Existing flashcards in SQLite retain their `target_deck` column untouched. Legacy data source records with `target_deck` remain readable, but `target_deck` is optional on source creation and removed from source UI modals.
- **Centralized Settings Hierarchy:** All application configurations adhere to the strict precedence chain: `SQLite app_settings -> process.env fallback -> Hardcoded Default`. UI adjustments immediately take effect across the web server, background workers, and client stores.
- **Zero Native Binaries for EPUB:** EPUB parsing and exporting must use pure-JavaScript libraries (`jszip`, `fast-xml-parser`, `jsdom`) already bundled in `@flashcard-master/adapters`. No Python, Calibre, Pandoc, or native C++ dependencies.
- **Hierarchical Chapter Slicing:** Ingested EPUBs parse container manifests, spine reading order, and TOC navigation (`nav.xhtml` / `toc.ncx`) into discrete Document Catalog subdocuments with chapter page coordinates and word counts.
- **Embedded Media Extraction:** EPUB illustrations and diagrams are extracted and cached in `MediaService` (content-addressed hash store) so subdocuments retain offline illustrations.
- **EPUB 3.0 Standard Compliance for Flashcards:** Flashcard EPUB exports must be valid EPUB 3.0 packages with uncompressed `mimetype` at byte offset 0 (STORE method), responsive e-reader CSS, Table of Contents grouped by Deck or Difficulty, and interactive collapsible reveal cards.
- **AnkiConnect Health & Live Testing:** Settings panel provides live connection verification to AnkiConnect with custom endpoint URL, timeout, and optional API key tokens.

## Technical Decisions

- **Schema Evolution:** Make `target_deck` optional in `packages/core/src/storage/source-repository.ts` and `schema.sql`. Existing database rows keep their values without destructive table rewrites.
- **Deck Selector in Studio:** Expand `GenerateStudio.svelte` and `GenerationConfigFields.svelte` with a smart deck selector that queries existing decks (`GET /api/cards/decks`) for autocomplete while allowing new deck creation.
- **General Settings Entity:** Model `GeneralSettings` in `packages/core/src/domain/models.ts` covering AnkiConnect URL/token, default AI provider/model/persona/difficulty/count, worker pool concurrency, task timeouts, and slicing defaults.
- **EPUB Ingestion Strategy:** Implement `EpubParser` in `packages/adapters/src/ingestion/epub-parser.ts`, invoked by `LocalFileStrategy` when encountering `.epub` files or directories.
- **Flashcard EPUB Exporter:** Implement `EpubFlashcardExporter` in `packages/adapters/src/export/epub-flashcard-exporter.ts`, registered under format `epub` in `ExporterRegistry` for flashcards.
- **Asynchronous Processing:** Large EPUB parsing and flashcard eBook compilation execute inside Task Center worker threads with SSE progress events to prevent blocking the event loop.

## UX & Interaction Patterns

- **`AddSourceModal.svelte` & `EditSourceModal.svelte`:** Remove "Target Deck" input field completely. Add `.epub` to file dropzone and accepted file types.
- **`SourcesView.svelte`:** Remove deck badge from source cards, focusing on source type, document counts, and sync status.
- **`GenerateStudio.svelte`:** Feature destination deck selection prominently with auto-suggest dropdown of existing decks.
- **`SettingsView.svelte`:** Multi-section layout:
  - *AI Providers & Secrets* (Existing keys & endpoints)
  - *AI Generation Defaults* (Default provider, model, persona, difficulty, card count, grounding)
  - *Anki Desktop Integration* (Endpoint URL, API key, Test Connection button)
  - *Worker & Ingestion Defaults* (Concurrency limits, timeout, default slicing strategy)
  - *Logging & Diagnostics* (Verbose toggle, log level)
- **`ExportCenter.svelte`:** Add "EPUB Study Guide eBook" card in Curated Flashcard Exports with format badge `.EPUB` and download action.

## Cross-Story Dependencies

- **Story 18.1** decouples decks from sources and establishes the Generate Studio deck selector.
- **Story 18.2** provides the centralized settings schema and endpoints used by AnkiConnect (18.2), Workers (18.3, 18.4), and Generation Studio.
- **Story 18.3** implements EPUB ingestion, yielding clean subdocuments in the Document Catalog.
- **Story 18.4** implements flashcard deck EPUB publishing, independent of ingestion.
- **Story 18.5** integrates all components and runs full monorepo verification.
