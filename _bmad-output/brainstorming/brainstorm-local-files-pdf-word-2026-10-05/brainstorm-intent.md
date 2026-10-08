# Intent: Epic 17 — Rich Document Ingestion (PDF/Word), Media-Aware EPUB Publishing & Dashboard Persistence

## Document Metadata & Core Intent
- **Epic**: Epic 17 — Rich Document Ingestion, Media-Aware Document Exports & State Persistence
- **Target Areas**: 
  1. PDF (`.pdf`) and Word (`.docx`) Local File Ingestion & Configurable Dual-Splitting
  2. Remote Media Localization & Packaging for Document Exports (EPUB 3.0, HTML)
  3. Dashboard & Client State Persistence across Browser Reloads
- **Core Intent**: Transform Flashcard Master into a rich, resilient document learning system by enabling local PDF and DOCX ingestion with user-configurable chunking, bundling external images into offline-ready EPUBs (e.g., Milan's .NET Weekly), and guaranteeing zero data loss or selection resets upon browser reloads.
- **Delivery Strategy**: Complete Day-1 end-to-end implementation across UI, CLI, background workers, export adapters, and SQLite persistence.

---

## Pillar 1: Local PDF & Word Document Ingestion

### User Jobs & Scope
- **User Jobs**:
  - Ingest textbooks, research papers, course syllabi, lecture slides, and design docs in `.pdf` and `.docx` formats.
  - Slice large documents into targeted subdocuments (chapters, sections, or page blocks) to selectively generate flashcards from specific units.
  - Maintain exact page/section coordinates (`Page 14, Section 2.1`) in flashcard `sourceLocator` citations for instant verification.
- **Supported Formats**:
  - PDF (`.pdf`) via pure-JS parser (`unpdf` or `pdf-parse`).
  - Word (`.docx`) via `mammoth` (converting headings and tables to clean Markdown).
- **Explicit Exclusions**:
  - Ancient binary `.doc` (pre-2007) eliminated to preserve zero-binary portability.
  - Optical Character Recognition (OCR) eliminated; scanned image-only PDFs detected early with friendly validation warnings.
  - Embedded image/diagram extraction from PDFs/Word deferred to later versions.

### Slicing & Document Catalog Integration
- **Configurable Dual-Splitting Modes**:
  1. **Semantic Outline Splitting**: Slices via PDF bookmarks / TOC tree or Word `Heading 1` / `Heading 2` styles.
  2. **Page-Budget Window Chunking**: Slices into configurable page/word budget blocks (e.g., 5–10 pages) as an explicit choice or fallback when outlines are missing.
  3. **Full Document (Single Doc)**: Ingests the entire file as one catalog entry.
- **Document Catalog Persistence**:
  - Slices populate subdocument rows in SQLite `documents` table linked to parent source.
  - Hierarchical titles: `Parent Document > Chapter Name` or `Document [Pages X–Y]`.
  - Precise page boundaries (`startPage`, `endPage`) preserved for `sourceLocator` citation propagation.

### Performance & Heap Guards
- **Decoupled Async Parsing**: Fast HTTP upload ACK (< 50ms) to disk; heavy parsing runs in background task workers with progress streamed to the Task Center.
- **Heap Limits & OOM Protection**: Incremental page processing and timeout guards to prevent Node.js heap exhaustion.

---

## Pillar 2: Remote Media Localization & Packaging for Document Exports (EPUB / HTML)

### Problem Statement & Jobs
- **The Issue**: Remote images in RSS feeds (e.g. Milan Jovanović's .NET Weekly newsletter) and web articles are kept as external URLs (`![Diagram](https://...)`) in clean Markdown.
- When exported to EPUB 3.0, the exporter only looks for local `/api/media/...` paths. Because e-readers (Apple Books, Calibre, Kindle) run in strict offline sandboxes that reject external `https://` requests, all remote images appear broken or missing.

### Media Localization Architecture
- **Remote Media Scanning**: `DocumentExportService` scans documents for both local `/api/media/...` paths and external `http(s)://` image URLs.
- **Download & Deduplication**: During export packaging, `MediaService` fetches referenced external images (with caching, timeout, and size limits) and stores them in temporary/local media cache by content hash.
- **EPUB 3.0 Manifest & Local Rewriting**:
  - Bundles downloaded images into `OEBPS/images/<hash>.<ext>`.
  - Registers each image with proper MIME type in `content.opf`.
  - Rewrites chapter XHTML image tags from remote URLs to local relative paths (`images/<hash>.<ext>`).
- **Graceful Fallbacks**: If a remote image fails to download (network offline/404), retain descriptive alt text and clean placeholder rather than failing the export.

---

## Pillar 3: Persistent Storage & Dashboard State Retention across Browser Reloads

### Problem Statement & Jobs
- **The Issue**: Hitting browser refresh (F5) or reloading the dashboard can result in jarring data loss:
  1. Generator state (selected document IDs, selected sources, filter queries, active accordion panels) resets to empty because it is held only in ephemeral Svelte `$state`.
  2. Inconsistent database initialization paths (`~/.flashcard-master/flashcards.db` vs `~/.flashcard-master/data.sqlite` vs `:memory:` fallback) can cause confusion between CLI, server, and test runners.

### State Persistence Requirements
- **LocalStorage & Session Hydration**:
  - Persist active generator selections (`selectedDocIds`, `selectedSourceIds`, `expandedSources`) and active view tab to `localStorage`.
  - Hydrate store state immediately on component mount with smooth loading indicators.
- **Database Path & Schema Invariant**:
  - Enforce a single canonical default database path (`~/.flashcard-master/data.sqlite`) across `@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/web`, and `@flashcard-master/cli`.
  - Ensure WAL mode and checkpointing on write so data is instantly persistent and never held in volatile buffers across server restarts or UI reloads.
- **Dashboard Metrics Freshness**:
  - Dashboard overview preserves telemetry and source counts without flashing empty states on reload.

---

## Summary of Deliverables for Epic 17
1. **Adapters & Core**:
   - `packages/adapters/src/ingestion/local-file-strategy.ts`: Add `.pdf` and `.docx` parser handlers (`mammoth`, `unpdf`/`pdf-parse`).
   - Slicing engine: Semantic outline and page-budget chunking producing `DiscoveredDocument[]`.
   - `packages/adapters/src/export/document-export-service.ts`: Remote image discovery, fetching via `MediaService`, and packaging into `OEBPS/images/` for EPUB 3.0.
   - Database path unification to canonical `~/.flashcard-master/data.sqlite`.
2. **Web Server & Workers**:
   - Fast upload endpoint for `.pdf`/`.docx` with background ingestion task worker.
   - Progress events streamed via SSE to Task Center.
3. **Web Client UI**:
   - `AddSourceModal.svelte`: Accept `.pdf`, `.docx`, and show slicing strategy selector (Outline vs Budget with page-size input).
   - `SourceDocumentInspector.svelte`: Render subdocument hierarchy with page badges and word counts.
   - `generateStore.svelte.ts` & `DashboardView.svelte`: LocalStorage persistence for selected documents/sources and active state across browser reloads.
4. **CLI**:
   - `flashcard-master sources add` with `--slice-mode <outline|budget|none>` and `--chunk-size <pages>`.
