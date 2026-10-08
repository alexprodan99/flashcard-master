# Epic 17 Context: Rich Document Ingestion (PDF/Word), Media-Aware EPUB Publishing & Dashboard Persistence

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Transform Flashcard Master into a rich, resilient document learning workstation by enabling local PDF and DOCX ingestion with user-configurable chunking into Document Catalog subdocuments, bundling external images into offline-ready EPUB eBooks (fixing Milan's .NET Weekly export), and guaranteeing zero data loss or selection resets upon browser reloads.

## Stories

- Story 17.1: Database Path Unification & LocalStorage State Persistence
- Story 17.2: Pure-JS PDF and DOCX Parsing Adapters
- Story 17.3: Configurable Document Slicing Engine & Catalog Integration
- Story 17.4: Remote Media Localization & Packaging for EPUB Exports
- Story 17.5: Decoupled Async Background Worker Ingestion Pipeline
- Story 17.6: UI & CLI Slicing Controls & Monorepo Test Suite

## Requirements & Constraints

- **Pure-JS Parsing Engines:** PDF and DOCX parsing must use pure-JavaScript/TypeScript npm packages (`unpdf`/`pdf-parse` for PDF, `mammoth` for DOCX); no native C++ binaries, Python runtimes, Poppler, or LibreOffice.
- **Strict Format Boundaries:** Only `.pdf` and modern `.docx` are supported; legacy pre-2007 binary `.doc` format is explicitly rejected at upload.
- **Zero OCR:** Scanned image-only PDFs lacking extractable text layers must be detected early with fast, actionable validation warnings.
- **Decoupled Asynchronous Processing:** File uploads write to disk in <50ms; extraction runs in background task workers with heap limits, timeouts, and SSE progress streaming to Task Center.
- **Dual Slicing Engine:** Supports Semantic Outline Splitting (via Word headings or PDF bookmarks) and Page-Budget Window Chunking (e.g. 5–10 pages).
- **Exact Citation Coordinates:** Subdocument page boundaries (`startPage`, `endPage`) propagate into generated flashcard `sourceLocator` references (e.g. `Calculus.pdf - Page 14, Section 2.1`).
- **Remote Image Bundling in EPUB:** Discover external `http(s)://` images in document text, download via `MediaService`, bundle into `OEBPS/images/`, register in `content.opf`, and rewrite chapter XHTML to local relative paths.
- **Database & State Persistence:** Unify canonical SQLite database path to `~/.flashcard-master/data.sqlite` across all packages, with WAL mode and `localStorage` state hydration in Generate Studio and Dashboard.

## Technical Decisions

- **Adapters Ingestion Pipeline:** Extend `LocalFileStrategy` to handle `.pdf` and `.docx`, delegating to pure-JS modules converting text and tables directly to GitHub Flavored Markdown (GFM).
- **Document Catalog Representation:** Sliced chunks are inserted as discrete rows in the SQLite `documents` table linked to parent `source_id`, with titles like `Book.pdf - Chapter 1 (pp. 1-15)`.
- **Media Localization:** `DocumentExportService.exportEpub` scans text content for both `/api/media/` and remote URLs, fetching remote images into a local cache before packaging.
- **Client State Hydration:** `generateStore.svelte.ts` persists `selectedDocIds`, `selectedSourceIds`, `expandedSources`, and `sourceFilterQuery` to `localStorage` under `fc_generation_settings`.
- **Database Unification:** Eliminate divergent `flashcards.db` path in `packages/cli/src/app.ts` in favor of canonical `~/.flashcard-master/data.sqlite`.

## UX & Interaction Patterns

- **`AddSourceModal.svelte`:** Update file upload dropzone to accept `.pdf` and `.docx`, presenting a slicing mode selector (Semantic Outline vs. Page Budget) with configurable page-budget thresholds.
- **`SourceDocumentInspector.svelte`:** Render hierarchical subdocument trees under parent source files with page-range badges and word counts.
- **`GenerateStudio.svelte`:** Allow granular selection of specific subdocuments/chapters for targeted card generation.
- **`DashboardView.svelte`:** Hydrate telemetry and source counts without visual layout shift or empty-state flashing on reload.

## Cross-Story Dependencies

- **Story 17.1** establishes the persistent database path and `localStorage` hydration foundation.
- **Story 17.2** implements pure-JS parsing libraries utilized by the slicing engine (17.3) and worker tasks (17.5).
- **Story 17.3** establishes subdocument catalog rows and `sourceLocator` propagation consumed by the UI (17.6).
- **Story 17.4** operates independently within `DocumentExportService` and `MediaService` for EPUB publishing.
- **Story 17.5** wires parsing and slicing into the async Task Center worker pool.
- **Story 17.6** provides the complete UI controls, CLI flags, and monorepo integration test suite.
