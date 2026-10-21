---
title: 'Story 18.3: Local EPUB Ingestion Strategy & Chapter Slicing Engine'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: 'a14b21796193dc20a3cfc7cae830c86c520bb439'
context:
  - '_bmad-output/implementation-artifacts/epic-18-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users possessing electronic books, textbooks, and technical publications formatted as `.epub` files cannot ingest them as learning materials. Flashcard Master currently only supports `.md`, `.markdown`, `.txt`, `.pdf`, and `.docx` local files. Attempting to upload an `.epub` file throws an "Unsupported file type" error, forcing users to convert books via third-party tools before importing.

**Approach:** Implement a pure-JavaScript `EpubParser` in `@flashcard-master/adapters` utilizing libraries already bundled in the monorepo (`jszip`, `fast-xml-parser`, `jsdom`). Ingest EPUB 2 and EPUB 3 publications by:
1. Reading `META-INF/container.xml` to locate the OPF package document.
2. Parsing `<metadata>` (book title, author, language), `<manifest>` (item list), and `<spine>` (chronological reading order).
3. Traversing Table of Contents structures (`nav.xhtml` navigation document for EPUB 3, `toc.ncx` for EPUB 2) to identify chapter titles, section boundaries, and hierarchy.
4. Extracting and converting XHTML chapters into clean GitHub-Flavored Markdown.
5. Extracting embedded images into `MediaService` (content-addressed hash store) so subdocuments retain offline illustrations.
6. Integrating with the Document Slicing Engine to register discrete subdocuments in the SQLite `documents` catalog with chapter titles, page/chapter coordinates, and word counts, propagating into flashcard `sourceLocator` references.
7. Updating `LocalFileStrategy`, `server.ts`, and `AddSourceModal.svelte` to allow `.epub` file uploads and directory globbing.

## Boundaries & Constraints

**Always:**
- Use pure-JavaScript / TypeScript npm libraries already installed in the monorepo (`jszip`, `fast-xml-parser`, `jsdom`); no native C/C++ binaries, Python scripts, Calibre, or Pandoc.
- Support both EPUB 3.0 (`<nav epub:type="toc">`) and legacy EPUB 2.0 (`toc.ncx`) Table of Contents structures.
- Respect the spine reading order (`<spine><itemref idref="..."/></spine>`) to prevent scrambled chapter sequences.
- Extract embedded images referenced in XHTML chapters and store them in `MediaService` so they render properly in markdown previews.
- Ensure chapter titles propagate cleanly into subdocument `title` and flashcard `sourceLocator` (e.g. `Designing_Data_Intensive_Applications.epub - Chapter 5: Replication`).
- Support both single `.epub` file uploads and recursive directory scanning (`**/*.epub`).

**Never:**
- Never block the Node.js event loop during large EPUB extraction; parsing must execute in async background worker tasks with SSE progress streaming to Task Center.
- Never fail catastrophically if an EPUB contains DRM-encrypted items; detect encryption early via `META-INF/encryption.xml` and throw a clear, actionable validation error (`"Encrypted or DRM-protected EPUBs are not supported. Please provide a DRM-free publication."`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Valid EPUB 3.0 file | Upload `Guide.epub` with 12 chapters and `nav.xhtml` | Ingests 12 subdocuments into Document Catalog with chapter titles and word counts | Streams progress 1/12..12/12 via SSE |
| Legacy EPUB 2.0 file | Upload `Classic.epub` with `toc.ncx` | Reads NCX `<navMap>`, extracts chapters in spine order | Falls back smoothly to NCX |
| DRM / Encrypted EPUB | EPUB contains `META-INF/encryption.xml` | Fails fast with friendly validation error | Explicit error message explaining DRM is unsupported |
| EPUB without explicit TOC | OPF has spine items but no TOC file | Treats each spine item as a sequential chapter (e.g. "Section 1", "Section 2") | Graceful fallback naming |
| Embedded images | Chapter contains `<img src="../images/fig1.png">` | Image is extracted to `MediaService`, rewritten to relative hash path | Skips broken image references safely |

</frozen-after-approval>

## Code Map

- `packages/adapters/src/ingestion/epub-parser.ts` -- Implement pure-JS EPUB extraction (container, manifest, spine, TOC, XHTML to Markdown, images).
- `packages/adapters/src/ingestion/local-file-strategy.ts` -- Add `.epub` to file extension checks and fast-glob pattern `**/*.{md,markdown,txt,pdf,docx,epub}`.
- `packages/adapters/src/index.ts` -- Export `EpubParser`.
- `packages/web/src/server.ts` -- Update `/api/sources/upload` and file validation to accept `.epub` files and MIME type `application/epub+zip`.
- `packages/web/src/workers/task-worker.ts` -- Support EPUB extraction in background ingestion worker thread.
- `packages/web/client/src/components/AddSourceModal.svelte` and `EditSourceModal.svelte` -- Add `.epub` to dropzone `accept` string and UI helper text.
- `packages/cli/src/cli.ts` -- Allow `.epub` file path in CLI `sources add`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/ingestion/epub-parser.ts` -- Build pure-JS EPUB 2 & EPUB 3 parser extracting spine items, TOC hierarchy, and media assets.
- [x] `packages/adapters/src/ingestion/local-file-strategy.ts` -- Wire `EpubParser` into `LocalFileStrategy` for files and directory scanning.
- [x] `packages/web/src/server.ts` -- Accept `.epub` uploads and register MIME types.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` & `EditSourceModal.svelte` -- Update file picker and drag-and-drop dropzone.
- [x] `packages/adapters/test/epub-parser.test.ts` -- Write unit tests with mock EPUB containers verifying spine ordering, TOC parsing, and image extraction.

**Acceptance Criteria:**
- **Given** a valid DRM-free `.epub` file,
  - **When** uploaded via the Add Source modal or CLI,
  - **Then** the file uploads in <50ms and queues an ingestion task in Task Center.
- **Given** the background ingestion task running in a worker thread,
  - **When** parsing the EPUB file,
  - **Then** it extracts chapters in proper spine order, converts XHTML to clean Markdown, preserves embedded illustrations, and registers subdocuments in the Document Catalog.
- **Given** the Document Inspector,
  - **When** expanding the ingested EPUB source,
  - **Then** all chapters appear with titles and word counts, ready for targeted flashcard generation.
- **Given** flashcards generated from the EPUB source,
  - **When** inspecting card provenance,
  - **Then** the `sourceLocator` reflects the exact chapter title (e.g. `Book.epub - Chapter 2: Foundations`).
