# Epic 13 Context: EPUB Knowledge Base Publishing, Mixed Difficulty Synthesis & Workflow Usability Enhancements

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide e-reader EPUB eBook publishing for knowledge bases, expand flashcard difficulty scaling with an adaptive 'mixed' tier, equip Question Explorer with dynamic instant-refresh capabilities, and streamline local file source ingestion with an interactive file chooser eliminating free-text path entry errors.

## Stories

- Story 13.1: EPUB eBook Export Engine & Manifest Packaging (`13-1-epub-ebook-export-engine`)
- Story 13.2: EPUB Export UI Integration & Streaming Endpoints (`13-2-epub-export-ui-and-endpoints`)
- Story 13.3: Mixed Target Difficulty Category & Adaptive Synthesis Pipeline (`13-3-mixed-difficulty-flashcard-category-and-synthesis`)
- Story 13.4: Question Explorer Real-Time Refresh Action (`13-4-question-explorer-refresh-button`)
- Story 13.5: Interactive File Picker & Upload for Local Data Sources (`13-5-interactive-local-file-picker-source`)
- Story 13.6: Monorepo Verification & Automated Regression Test Suite (`13-6-monorepo-verification-and-test-suite`)

## Requirements & Constraints

- **EPUB 3.0 Compliance:** Generated `.epub` files must adhere to EPUB 3.0 packaging specifications: uncompressed `mimetype` (`application/epub+zip` as first entry with STORE), `META-INF/container.xml`, `OEBPS/content.opf` (manifest of all items, spine reading order, Dublin Core metadata), `OEBPS/nav.xhtml` (EPUB 3 nav) & `OEBPS/toc.ncx` (EPUB 2 backward compatibility), `OEBPS/styles.css`, and valid XHTML chapter files per document.
- **Embedded Local Media in EPUB:** Document images stored via `MediaService` must be packed into `OEBPS/images/` with correct image MIME types and referenced via relative URIs in chapter XHTML.
- **Mixed Difficulty Invariant:** `DifficultyLevel` in domain models and SQLite schema must allow `'mixed'`. When `mixed` is targeted in generation, LLM prompts instruct the model to produce an adaptive progression of beginner, intermediate, and expert cards across the document.
- **Instant Reactive Refresh:** `QuestionExplorer.svelte` must provide a 1-click refresh action that invokes `loadCards()`, preserves user-selected deck, difficulty filter, and search text, animates a spinning indicator, and prevents duplicate requests.
- **Local File Source Picker:** `AddSourceModal.svelte` and `EditSourceModal.svelte` must provide an interactive file dropzone and file chooser when `type === 'local'`. Files are uploaded via `POST /api/sources/upload`, stored in local app storage, source name auto-populated, and `uri` set automatically. Manual path input is retained as an advanced toggle.

## Technical Decisions

- **AD-14 (EPUB 3.0 Exporter):** Implemented in `DocumentExportService` using `JSZip` without heavy binary external tools, outputting streaming buffers with `application/epub+zip`.
- **AD-15 (Mixed Difficulty Schema & Prompts):** Extended `DifficultyLevelSchema` to include `'mixed'`, SQLite schema updated with `CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed'))`, and dynamic LLM prompt adaptations across all 4 adapters.
- **AD-16 (Question Explorer Refresh):** Reactive state trigger in Svelte 5 runes avoiding page reload.
- **AD-17 (Local Source Upload Handler):** WebServer endpoint `POST /api/sources/upload` and drag-and-drop file component.

## UX & Interaction Patterns

- **`<DocumentExportModal.svelte>`:** Added format radio option "📚 EPUB eBook (.epub)" with description "Standardized eBook format for Kindle, Apple Books, Kobo, and e-readers."
- **`<GenerationConfigFields.svelte>`:** Added "🌈 Mixed (Adaptive Progression)" to difficulty dropdown.
- **`QuestionExplorer.svelte`:** Refresh button `[ 🔄 Refresh ]` positioned in filter toolbar; difficulty chip `[ 🌈 Mixed ]` and purple/gradient difficulty badge.
- **`AddSourceModal.svelte`:** File chooser zone with Drag & Drop, file size/name badge, auto-title generation, and toggle for manual folder paths.

## Cross-Story Dependencies

- Story 13.1 establishes the core EPUB packaging engine before Story 13.2 attaches the web endpoints and export modal UI.
- Story 13.3 updates the schema and adapters for mixed difficulty before UI filters use it.
- Story 13.4 adds Question Explorer refresh independently.
- Story 13.5 provides server upload and UI file chooser.
- Story 13.6 verifies the full suite across all monorepo workspaces.
