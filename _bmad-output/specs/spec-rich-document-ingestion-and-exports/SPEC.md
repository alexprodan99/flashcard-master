---
id: SPEC-rich-document-ingestion-and-exports
companions:
  - architecture-diagrams.md
  - brownfield.md
sources:
  - ../../brainstorming/brainstorm-local-files-pdf-word-2026-10-05/brainstorm-intent.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Rich Document Ingestion (PDF/Word), Media-Aware EPUB Publishing & Dashboard Persistence

## Why

Users study from dense, real-world source materials—textbooks, slide decks, syllabi, and technical newsletters—that exist as PDFs, Word documents, or image-rich web articles. Today, Flashcard Master only ingests plain text or Markdown files, completely ignores remote images in exported EPUB eBooks (rendering them broken in offline e-readers), and resets active UI generator selections and dashboard telemetry on browser reloads. Solving these gaps transforms the platform into an end-to-end document learning workstation where users can ingest complex documents, slice them into focused study chapters with exact page citations, export fully self-contained eBooks with embedded media, and work without fearing data loss on page refresh.

## Capabilities

- **CAP-1**
  - **intent:** User or system can ingest local `.pdf` documents and extract clean reading-order text and structured tables into the document catalog.
  - **success:** Ingesting a valid PDF generates `CleanTextDocument` records containing extracted text and Markdown tables, with character-to-page counts verified against zero-text thresholds.

- **CAP-2**
  - **intent:** User or system can ingest local `.docx` documents and convert document sections, headings, and tables into structured Markdown text.
  - **success:** Ingesting a `.docx` file extracts clean text while mapping Word heading styles (`Heading 1`, `Heading 2`) to Markdown headings and converting tables to GitHub Flavored Markdown (GFM) tables.

- **CAP-3**
  - **intent:** User can configure document slicing during ingestion to decompose large PDF and Word documents into targeted subdocuments via either semantic outlines or fixed page/word budgets.
  - **success:** Slicing a multi-page document populates the SQLite `documents` table with discrete subdocument records carrying distinct titles, word counts, and page boundaries (`startPage`, `endPage`), each individually selectable in Generate Studio.

- **CAP-4**
  - **intent:** System propagates exact subdocument page coordinates and section markers into generated flashcard citations.
  - **success:** Flashcards generated from sliced subdocuments contain verifiable `sourceLocator` references (e.g., `Textbook.pdf - Page 14, Section 2.1`) matching the source excerpt.

- **CAP-5**
  - **intent:** System executes heavy document parsing and slicing asynchronously in background workers, decoupling file uploads from CPU-intensive extraction.
  - **success:** File upload endpoints acknowledge file receipt to local disk in under 50ms without blocking the HTTP event loop; background task workers parse pages incrementally, stream progress events via SSE to the Task Center, and enforce heap and timeout limits to prevent server OOM crashes.

- **CAP-6**
  - **intent:** System detects image-only or scanned PDFs lacking extractable text layers early and issues clear validation warnings.
  - **success:** Ingesting a scanned PDF with zero selectable text immediately aborts extraction, records a failed/warning task state, and informs the user that OCR is not supported.

- **CAP-7**
  - **intent:** System discovers external image URLs within document text, downloads and caches them locally, and packages them into self-contained EPUB 3.0 eBooks.
  - **success:** Exporting documents containing remote images (e.g., RSS feeds like Milan's .NET Weekly) fetches remote image binaries, bundles them into `OEBPS/images/`, registers them with proper MIME types in `content.opf`, and rewrites chapter XHTML `img` sources to relative local paths.

- **CAP-8**
  - **intent:** Web client and server preserve active generator selections, filters, and database writes across page reloads and restarts.
  - **success:** Triggering a browser reload (F5) on the dashboard or Generate Studio restores active document selections, source filters, and views from `localStorage`, while all backend services connect to the unified database path `~/.flashcard-master/data.sqlite`.

## Constraints

- **Pure-JS parsing engines:** Document parsing must use pure-JavaScript/TypeScript npm packages (`unpdf`/`pdf-parse` for PDF, `mammoth` for DOCX); no native C++ binaries, Python runtimes, Poppler, or LibreOffice installations may be required.
- **Strict format boundary:** Only `.pdf` and `.docx` are supported for rich document ingestion; legacy pre-2007 binary `.doc` format is explicitly rejected at upload.
- **Zero OCR:** No optical character recognition tooling or dependencies will be bundled; image-only documents must fail fast with actionable guidance.
- **Asynchronous ingestion boundary:** File upload endpoints must write raw files to disk and return immediately; parsing must never execute synchronously within the HTTP request thread.
- **Canonical database path:** All packages (`@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/cli`, `@flashcard-master/web`) must use `~/.flashcard-master/data.sqlite` with SQLite WAL mode enabled.

## Non-goals

- OCR processing for scanned PDFs or paper document photos.
- Ingestion of legacy binary Microsoft Word `.doc` files (pre-Office 2007).
- Embedded diagram, chart, or image extraction from PDF/Word documents for flashcard media generation.
- Interactive in-browser PDF annotation or WYSIWYG highlight extraction.

## Success signal

A user can upload a 100-page `.pdf` textbook and a `.docx` syllabus, configure a 10-page slicing strategy, see individual chapters appear in the Document Inspector with accurate page counts, generate flashcards with verifiable `Page X` citations, export an RSS newsletter collection containing remote images into an offline-ready EPUB with working illustrations, and refresh their browser tab without losing their active studio selections.
