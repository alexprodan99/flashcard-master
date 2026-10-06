---
title: 'Story 17.2: Pure-JS PDF and DOCX Parsing Adapters'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '512235300814b92e0de73cf9f69a521d1d79dd1d'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-rich-document-ingestion-and-exports/SPEC.md'
  - '_bmad-output/specs/spec-rich-document-ingestion-and-exports/brownfield.md'
  - '_bmad-output/implementation-artifacts/epic-17-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Flashcard Master's local file strategy only accepts plain `.md`, `.markdown`, and `.txt` files. Users cannot ingest `.pdf` textbooks, research papers, or `.docx` lecture notes, while attempting to process scanned PDFs with no text or ancient `.doc` files crashes or causes confusion.

**Approach:** Implement zero-native-dependency parsing adapters in `@flashcard-master/adapters` using `mammoth` (for `.docx` to Markdown headings and tables) and `unpdf` (for `.pdf` page extraction and metadata), reject legacy binary `.doc` files upfront, and detect zero-text scanned PDFs early with clear actionable warnings.

## Boundaries & Constraints

**Always:**
- Use pure-JS/TypeScript npm packages (`mammoth` for DOCX, `unpdf` for PDF). Zero native C++ binaries, Poppler, Python, or LibreOffice toolchains.
- Reject ancient binary `.doc` files (pre-2007) with an explicit error explaining only modern `.docx` is supported.
- Detect scanned zero-text PDFs early: if character count across pages is near zero, throw/return a clear validation error indicating OCR is unsupported.
- Convert Word tables into GitHub Flavored Markdown (GFM) tables in `htmlToCleanText`.
- Deduplicate recurring running headers, footers, and page numbers in PDF text.
- Integrate `.pdf` and `.docx` into `LocalFileStrategy` file and directory traversal.

**Ask First:**
- If a PDF parser encounters password-protected or heavily encrypted documents.

**Never:**
- Never bundle OCR engines (Tesseract, OpenCV) or heavy system dependencies.
- Never crash on malformed, corrupted, or zero-byte PDF/Word files.
- Never discard table structures by flattening them into unformatted text strings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Modern DOCX ingestion | Valid `.docx` file with headings & tables | Returns `RawDocument` with clean Markdown headings and GFM tables | Logs error if corrupt |
| Standard PDF ingestion | Valid multi-page `.pdf` with text | Returns `RawDocument` with clean text, page markers, and reading order | Logs error if corrupt |
| Scanned image-only PDF | `.pdf` with 10 pages but 0 extractable characters | Fails early with validation message: "Scanned image PDF has no selectable text layer" | Emits clean warning, skips document |
| Legacy binary DOC | File with `.doc` extension or OLE magic bytes | Rejects immediately: "Legacy binary .doc is not supported. Please convert to .docx or .pdf" | Descriptive error message |
| Corrupt / zero-byte file | Empty or truncated `.pdf` / `.docx` file | Returns empty array or null document without throwing unhandled exceptions | Caught and logged safely |
| Folder traversal with mixed files | Folder containing `.md`, `.pdf`, `.docx`, and `.png` | Ingests `.md`, `.pdf`, and `.docx`; ignores `.png` | Safe skipping of non-supported files |

</frozen-after-approval>

## Code Map

- `packages/adapters/package.json` -- Add `mammoth` and `unpdf` to dependencies.
- `packages/adapters/src/ingestion/docx-parser.ts` -- New parser module extracting structured Markdown text and tables from DOCX buffers.
- `packages/adapters/src/ingestion/pdf-parser.ts` -- New parser module extracting page-aware text, detecting zero-text scanned PDFs, and stripping running headers/footers.
- `packages/adapters/src/utils/html-cleaner.ts` -- Enhance `walkDom` to convert `<table>`, `<tr>`, `<th>`, `<td>` elements into valid Markdown tables.
- `packages/adapters/src/ingestion/local-file-strategy.ts` -- Update file extension filters and glob patterns to include `.pdf` and `.docx`, delegating to `PdfParser` and `DocxParser`.
- `packages/adapters/src/index.ts` -- Export new parser classes and error types.
- `packages/adapters/test/document-parsers.test.ts` -- Unit tests verifying DOCX, PDF, table conversion, legacy `.doc` rejection, and scanned zero-text PDF validation.

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/package.json` -- Install `mammoth` and `unpdf`.
- [x] `packages/adapters/src/utils/html-cleaner.ts` -- Add GFM table conversion in `walkDom`.
- [x] `packages/adapters/src/ingestion/docx-parser.ts` -- Create `DocxParser` converting DOCX to Markdown and rejecting legacy `.doc`.
- [x] `packages/adapters/src/ingestion/pdf-parser.ts` -- Create `PdfParser` extracting text page-by-page with zero-text scanned validation.
- [x] `packages/adapters/src/ingestion/local-file-strategy.ts` -- Integrate `.pdf` and `.docx` into `LocalFileStrategy`.
- [x] `packages/adapters/src/index.ts` -- Export new parsing utilities.
- [x] `packages/adapters/test/document-parsers.test.ts` -- Add comprehensive test suite covering all I/O scenarios.

**Acceptance Criteria:**
- Given a valid `.docx` file with headings and tables, when parsed, it outputs clean Markdown with `#` headers and `| col |` tables.
- Given a valid text-based `.pdf`, when parsed, it extracts clean text and page count metadata.
- Given a scanned `.pdf` with zero selectable text, it throws or returns a specific validation error indicating OCR is not supported.
- Given a `.doc` file, it is explicitly rejected with instructions to use `.docx` or `.pdf`.
- Given a directory with mixed `.md`, `.pdf`, and `.docx` files, `LocalFileStrategy` discovers and parses all three formats.

## Design Notes

```ts
// Table conversion in walkDom (html-cleaner.ts)
case "table": {
  // Extract headers and rows into GFM markdown table
}

// Scanned PDF detection heuristic (pdf-parser.ts)
if (totalPages > 0 && totalAlphaChars < 20 * totalPages) {
  throw new ScannedDocumentError("Document contains scanned images with no selectable text layer. OCR is not supported.");
}
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: all adapter tests pass including new DOCX and PDF parser tests.
- `npm run typecheck` -- expected: clean TypeScript compilation with zero errors across monorepo.

## Suggested Review Order

**Document Parsing Adapters**

- Entry point: converts DOCX buffers/files to Markdown headings and tables, rejecting legacy `.doc`
  [`docx-parser.ts:34`](../../packages/adapters/src/ingestion/docx-parser.ts#L34)

- Page-aware PDF parsing with Unicode scanned detection and header/footer deduplication
  [`pdf-parser.ts:26`](../../packages/adapters/src/ingestion/pdf-parser.ts#L26)

**HTML Cleaning & Table Transformation**

- Converts HTML tables into GitHub Flavored Markdown tables
  [`html-cleaner.ts:197`](../../packages/adapters/src/utils/html-cleaner.ts#L197)

- Opt-in inline Markdown formatting preserving bold, italic, and links for documents
  [`html-cleaner.ts:116`](../../packages/adapters/src/utils/html-cleaner.ts#L116)

**Ingestion Strategy Integration**

- Local file strategy discovering `.docx` and `.pdf` with single-file and directory error isolation
  [`local-file-strategy.ts:27`](../../packages/adapters/src/ingestion/local-file-strategy.ts#L27)

**Supporting Tests & Types**

- Comprehensive test suite covering DOCX, PDF, tables, scanned error rejection, and Cyrillic
  [`document-parsers.test.ts:21`](../../packages/adapters/test/document-parsers.test.ts#L21)

- Binary test fixture generators for PDF streams, multi-page PDFs, and DOCX ZIP packages
  [`fixtures-helper.ts:3`](../../packages/adapters/test/fixtures-helper.ts#L3)

- Ambient TypeScript definitions for mammoth library
  [`mammoth.d.ts:1`](../../packages/adapters/src/types/mammoth.d.ts#L1)
