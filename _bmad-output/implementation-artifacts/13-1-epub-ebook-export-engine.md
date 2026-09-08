---
title: 'EPUB eBook Export Engine & Manifest Packaging'
type: 'feature'
created: '2026-09-07'
status: 'done'
baseline_commit: 'b4c42ba59ea335977b1200dd5df08b5dde97f3f8'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-13-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users can currently export clean knowledge base documents as Markdown, HTML, Plain Text, and JSON, but cannot compile their curated knowledge base into a standardized `.epub` eBook readable on e-readers (Kindle, Kobo, Apple Books, Calibre) with proper chapters, embedded images, and offline navigation.

**Approach:** Extend `DocumentExportFormat` in `@flashcard-master/core` to include `'epub'` and implement an EPUB 3.0 packaging engine in `DocumentExportService` using `JSZip`. The engine generates the standard uncompressed `mimetype` container, `META-INF/container.xml`, `OEBPS/content.opf` (metadata, manifest, spine), `OEBPS/nav.xhtml` (EPUB 3 navigation document) & `OEBPS/toc.ncx` (EPUB 2 backward compatibility), `OEBPS/styles.css` (clean e-reader typography), and chapter XHTML files with embedded local media assets.

## Boundaries & Constraints

**Always:**
- Ensure the first file in the EPUB zip archive is `mimetype` with content `application/epub+zip` stored with zero compression (`STORE` / compression: "STORE").
- Enforce strict XHTML syntax in chapter files (self-closing `<hr />`, `<br />`, `<img />`, XML-escaped entities).
- Include Dublin Core metadata in `content.opf`: unique `dc:identifier` (UUID), `dc:title`, `dc:language`, and `dc:date`.
- Embed local media assets referenced via `/api/media/<hash>.<ext>` into `OEBPS/images/<hash>.<ext>` using `MediaService` and update references in chapter XHTML to relative paths.
- Generate both `nav.xhtml` (EPUB 3 standard) and `toc.ncx` (EPUB 2 legacy fallback) for universal reader compatibility.

**Ask First:**
- Introducing external binary dependencies (e.g. `calibre`, `ebook-convert`, or `pandoc`).

**Never:**
- Never produce compressed `mimetype` entries, which invalidates EPUB container compliance.
- Never crash the export if an individual embedded image fails to read; fall back to preserving the image placeholder or alt text gracefully.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Compilation | 5 documents, default options | Valid `.epub` buffer containing 5 chapters, TOC, styles, and cover metadata | Throws descriptive error if documents empty |
| Embedded Media | Documents with `/api/media/<hash>.webp` | Images packaged in `OEBPS/images/`, manifest items added, paths rewritten to `images/<hash>.webp` | Corrupt images skipped, valid text exported |
| Special Characters in Titles | Titles with `&`, `<`, `>`, `"`, `'` | Escaped XML entities in `content.opf`, `nav.xhtml`, and chapter headers | No XML parse exceptions in e-readers |
| Empty / No Content Document | Document with empty `textContent` | Generates valid XHTML chapter with "*(No content available)*" placeholder | Graceful placeholder |
| Kindle / Calibre Compatibility | Standard EPUB 3.0 reader test | Passes EPUB validation check, chapters navigate sequentially | Compliant spine order |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Domain contracts: extend `DocumentExportFormat` to include `'epub'`.
- `packages/adapters/src/export/document-export-service.ts` -- EPUB packaging engine: `exportEpub`, XHTML generation, container XML, OPF manifest builder, and media asset bundler.
- `packages/adapters/test/document-export-service.test.ts` -- Unit tests verifying EPUB zip structure, `mimetype` uncompressed placement, `content.opf` manifest completeness, and XHTML compliance.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Add `'epub'` to `DocumentExportFormat` type union (`"markdown" | "html" | "txt" | "json" | "epub"`).
- [x] `packages/adapters/src/export/document-export-service.ts` -- Add `exportEpub(docs: DiscoveredDocument[], opts: ...)` method utilizing `JSZip`.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Construct compliant `mimetype` (uncompressed STORE) as first zip entry.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Build `META-INF/container.xml` pointing to `OEBPS/content.opf`.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Build `OEBPS/content.opf` with Dublin Core metadata, manifest items (XHTML, CSS, images), and spine order.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Build `OEBPS/nav.xhtml` and `OEBPS/toc.ncx` for chapter navigation.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Build `OEBPS/styles.css` with clean, high-readability typography for E-Ink and mobile displays.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Convert document markdown/text into valid XML-compliant XHTML chapter files (`chapter_1.xhtml`, etc.).
- [x] `packages/adapters/src/export/document-export-service.ts` -- Localize `/api/media/` image references into `OEBPS/images/` using `MediaService.readMedia()`.
- [x] `packages/adapters/test/document-export-service.test.ts` -- Add unit tests asserting valid EPUB zip container, entry order, uncompressed mimetype, and manifest items.

**Acceptance Criteria:**
- Given a list of discovered documents and export format `'epub'`
- When `DocumentExportService.export(docs, { format: 'epub', sourceName: 'TypeScript Guide' })` is executed
- Then the returned result contains `mimeType: "application/epub+zip"` and filename `typescript-guide-knowledge-base.epub`.
- And reading the buffer with `JSZip` confirms the first entry is `mimetype` stored with compression method `STORE`.
- And the archive contains `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/nav.xhtml`, and XHTML chapter files for each document.

## Spec Change Log

_None._

## Design Notes

### EPUB Container Layout
```text
mimetype (stored uncompressed, application/epub+zip)
META-INF/
  container.xml
OEBPS/
  content.opf
  nav.xhtml
  toc.ncx
  styles.css
  chapter_1.xhtml
  chapter_2.xhtml
  images/
    <hash>.webp
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: all adapter unit tests pass including EPUB exporter test suite.
- `npm test` -- expected: 100% of monorepo tests pass.

## Suggested Review Order

1. Type declaration in `packages/core/src/domain/models.ts`
2. EPUB exporter logic in `packages/adapters/src/export/document-export-service.ts`
3. Automated test coverage in `packages/adapters/test/document-export-service.test.ts`
