---
title: 'Configurable Document Slicing Engine & Catalog Integration'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '3f19218b25b86d3cdac9a77dca685b52f7d42425'
review_loop_iteration: 1
context:
  - 'packages/core/src/storage/schema.sql'
  - 'packages/core/src/storage/db.ts'
  - 'packages/core/src/domain/models.ts'
  - 'packages/core/src/storage/document-repository.ts'
  - 'packages/core/src/services/card-generation-service.ts'
  - 'packages/core/src/services/ingestion-service.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Large ingested PDF and Word documents are currently stored as monolithic entries in the Document Catalog. Users cannot target specific chapters or sections in Generate Studio, and generated flashcards lack exact page and section coordinates in their citations.

**Approach:** Implement a pure-TypeScript `DocumentSlicingEngine` supporting Semantic Outline (headings) and Page-Budget window splitting with word-budget fallback. Add `start_page` and `end_page` columns to SQLite `documents` table and domain models, integrate slicing into `IngestionService`, and propagate exact coordinates (`Calculus.pdf - Page 14, Section 2.1`) into flashcard `sourceLocator`.

## Boundaries & Constraints

**Always:**
- Persist sliced subdocuments as discrete rows in the SQLite `documents` table linked to parent `source_id`.
- Ensure subdocuments produce unique URLs (e.g. `file:///path/to/doc.pdf#page=1-5` or `#section=Chapter-1`) to prevent violations of `idx_documents_source_url`.
- SQLite schema migrations in `packages/core/src/storage/db.ts` must be backwards-compatible (check `PRAGMA table_info(documents)` and add `start_page` and `end_page` integer columns if absent).
- Propagate `startPage` and `endPage` coordinates to generated flashcard `sourceLocator` references whenever cards are generated from subdocuments.
- If Semantic Outline mode finds zero headings in the text, fall back gracefully to Page Budget mode (if page markers exist) or word budget (if pageless).

**Ask First:**
- Modifying SQLite foreign keys or altering existing un-sliced document rows in production databases.

**Never:**
- Never drop or truncate the `documents` table during migration.
- Never break existing non-paginated web, RSS, notion, or sitemap document ingestion.
- Never add external native binary or Python dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page Budget PDF Slicing | 12-page PDF text with `<!-- page: N -->` markers, `pagesPerChunk: 5` | 3 subdocuments: Pages 1–5 (`startPage: 1, endPage: 5`), Pages 6–10 (`startPage: 6, endPage: 10`), Pages 11–12 (`startPage: 11, endPage: 12`) | N/A |
| Semantic Outline Splitting | Markdown/Docx with `# Heading 1` and `## Heading 2` sections | Subdocuments for each heading with titles `Parent - Section Name` and page ranges if markers present | If section < `minChunkWords`, merge with adjacent section |
| Outline Mode without Headings | Document text with page markers but no headings | Gracefully falls back to Page Budget mode (using `pagesPerChunk`) | Log warning, generate valid page-budget chunks |
| Pageless Text Slicing | Plain text document with no page markers, `mode: 'budget'` | Splits by word budget (`wordsPerChunk`, default 1500 words) with title `Parent - Part N` | N/A |
| Full Document Mode | `mode: 'none'` or default unconfigured | Single subdocument with `startPage: 1, endPage: totalPages` if page markers exist | N/A |
| SourceLocator Coordinate Propagation | Subdocument `Calculus.pdf` with `startPage: 14, endPage: 14`, LLM draft locator `Section 2.1` | Card `sourceLocator`: `Calculus.pdf - Page 14, Section 2.1` | If draft locator empty: `Calculus.pdf - Page 14` |
| Multi-Page Coordinate Propagation | Subdocument `Physics.pdf` with `startPage: 20, endPage: 25`, LLM draft locator `Section 3.4` | Card `sourceLocator`: `Physics.pdf - Pages 20-25, Section 3.4` | If draft locator already contains document title, avoid duplicate prefix |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/schema.sql` -- Schema definition; add `start_page INTEGER DEFAULT NULL` and `end_page INTEGER DEFAULT NULL` to `documents` table.
- `packages/core/src/storage/db.ts` (lines 27-38, lines 417-425) -- Update `SCHEMA_SQL` and `runMigrations` to add `start_page` and `end_page` columns if missing.
- `packages/core/src/domain/models.ts` (lines 105-127) -- Add `startPage` and `endPage` optional nullable numbers to `CleanTextDocument`, `DiscoveredDocumentSchema`, and `DiscoveredDocument`.
- `packages/core/src/storage/document-repository.ts` (lines 14-27, 60-82, 106-161) -- Map and persist `start_page` and `end_page` in `mapRowToDocument`, `upsert`, and `upsertBatch`.
- `packages/core/src/ports/index.ts` (lines 3-7) -- Add `slicing?: DocumentSlicingOptions` to `IngestionOptions`.
- `packages/core/src/services/document-slicing-engine.ts` (NEW) -- Implement `DocumentSlicingEngine`, `DocumentSliceInput`, `DocumentSlicingOptions`, `SlicingMode`, and `SlicedSubdocument`.
- `packages/core/src/services/card-generation-service.ts` (lines 115-131) -- Add `formatCardSourceLocator` helper to propagate document title and page coordinates into `sourceLocator`.
- `packages/core/src/services/ingestion-service.ts` (lines 20-26, lines 91-120) -- Inject `DocumentSlicingEngine` and slice documents when `options?.slicing` is configured before `docRepo.upsertBatch()`.
- `packages/core/src/index.ts` -- Export `DocumentSlicingEngine` and slicing types.
- `packages/web/src/workers/task-types.ts` (lines 18-24) -- Add `startPage?: number | null; endPage?: number | null;` to document objects in `GenerationTaskPayload`.
- `packages/web/src/workers/task-worker.ts` (lines 171-178) -- Pass `startPage` and `endPage` from payload into `CleanTextDocument`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/schema.sql` & `packages/core/src/storage/db.ts` -- Add `start_page` and `end_page` columns and automated SQLite migrations -- Enables persisting page boundaries.
- [x] `packages/core/src/domain/models.ts` -- Update `DiscoveredDocumentSchema` and `CleanTextDocument` with `startPage` and `endPage` -- Types domain models for subdocuments.
- [x] `packages/core/src/storage/document-repository.ts` -- Persist and query `start_page` and `end_page` in `upsert`, `upsertBatch`, and `mapRowToDocument` -- Saves and hydrates page boundaries in SQLite.
- [x] `packages/core/src/services/document-slicing-engine.ts` -- Implement `DocumentSlicingEngine` supporting `outline`, `budget`, and `none` modes with page marker parsing -- Core slicing algorithm.
- [x] `packages/core/src/services/card-generation-service.ts` -- Implement `formatCardSourceLocator` and propagate coordinates into card drafts -- Satisfies CAP-4 grounded citations.
- [x] `packages/core/src/services/ingestion-service.ts` -- Wire slicing engine into `syncSource` batch catalog insertion -- Populates subdocument rows during sync.
- [x] `packages/web/src/workers/task-types.ts` & `task-worker.ts` -- Propagate `startPage` and `endPage` in worker task payloads -- Preserves coordinates through background worker execution.
- [x] `packages/core/test/document-slicing-engine.test.ts` -- Unit tests for `DocumentSlicingEngine` covering outline, budget, fallbacks, and page markers.
- [x] `packages/core/test/document-repository.test.ts` & `card-generation-service.test.ts` -- Tests verifying `startPage`/`endPage` persistence and `sourceLocator` propagation.

**Acceptance Criteria:**
- Given a multi-page PDF text with `<!-- page: N -->` markers, when sliced with `mode: 'budget'` and `pagesPerChunk: 5`, then distinct subdocuments with accurate `startPage`, `endPage`, titles, and unique URLs are produced.
- Given a document with Markdown headings (`#`, `##`), when sliced with `mode: 'outline'`, then subdocuments for each section are produced with hierarchical titles.
- Given an outline document without headings, when sliced with `mode: 'outline'`, then it falls back gracefully to budget slicing without throwing an error.
- Given a subdocument with `startPage: 14, endPage: 14`, when flashcards are generated, then generated card `sourceLocator` starts with or includes `DocumentTitle - Page 14`.
- Given an existing SQLite database without `start_page` columns, when initialized via `createDatabaseClient`, then migrations add `start_page` and `end_page` without data loss.

## Spec Change Log

## Design Notes

### Page Marker Detection & Parsing
`PdfParser` injects `<!-- page: N -->` markers at page transitions. The slicing engine parses these markers using `/<!--\s*page:\s*(\d+)\s*-->/gi` to compute exact page spans:
- `startPage`: first marker found in slice
- `endPage`: last marker found in slice (or equal to `startPage` if single page)
- Word count is computed with page comments stripped to ensure clean metrics.

### Deterministic Subdocument URLs & IDs
To satisfy the unique index `idx_documents_source_url(source_id, url)`, subdocuments append fragment coordinates:
- Semantic Outline: `${originUrl}#section=${encodeURIComponent(sectionTitle)}&page=${startPage || 1}`
- Page Budget: `${originUrl}#page=${startPage}-${endPage}`
- Subdocument IDs: `sha256(${sourceId}:${subdoc.url || subdoc.title}).slice(0, 32)`

### Citation Grounding (CAP-4)
```ts
export function formatCardSourceLocator(
  docTitle: string,
  startPage?: number | null,
  endPage?: number | null,
  draftLocator?: string
): string {
  const cleanTitle = (docTitle || "Document").trim();
  const cleanDraft = (draftLocator || "").trim();
  let pagePart = "";
  if (typeof startPage === "number" && startPage > 0) {
    pagePart = typeof endPage === "number" && endPage > startPage
      ? `Pages ${startPage}-${endPage}`
      : `Page ${startPage}`;
  }
  if (!cleanDraft) {
    return pagePart ? `${cleanTitle} - ${pagePart}` : cleanTitle;
  }
  if (cleanDraft.startsWith(cleanTitle)) {
    return cleanDraft;
  }
  if (pagePart && !cleanDraft.toLowerCase().includes("page")) {
    return `${cleanTitle} - ${pagePart}, ${cleanDraft}`;
  }
  return `${cleanTitle} - ${cleanDraft}`;
}
```

## Verification

**Commands:**
- `pnpm --filter @flashcard-master/core test` -- expected: All unit tests pass, including new `document-slicing-engine.test.ts`.
- `pnpm --filter @flashcard-master/web test` -- expected: All worker and server tests pass.
- `pnpm test` -- expected: Full monorepo test suite passes without regressions.

## Suggested Review Order

**Core Slicing Engine**

- Primary entry point dispatching between semantic outline, page budget, and full document slicing modes:
  [`document-slicing-engine.ts:53`](../../packages/core/src/services/document-slicing-engine.ts#L53)

- Groups PDF page markers into window subdocuments with collision-proof URL fragments:
  [`document-slicing-engine.ts:122`](../../packages/core/src/services/document-slicing-engine.ts#L122)

- Parses CommonMark headings with page range tracking and min-chunk threshold merging:
  [`document-slicing-engine.ts:269`](../../packages/core/src/services/document-slicing-engine.ts#L269)

**Database Schema & Migrations**

- Adds start_page and end_page columns with automated non-destructive SQLite startup migration:
  [`db.ts:425`](../../packages/core/src/storage/db.ts#L425)

- Synchronizes schema.sql documents table definition, raw_content column, and unique URL index:
  [`schema.sql:24`](../../packages/core/src/storage/schema.sql#L24)

- Persists and hydrates integer-guarded startPage and endPage coordinates during document upserts:
  [`document-repository.ts:62`](../../packages/core/src/storage/document-repository.ts#L62)

**Ingestion & Catalog Integration**

- Slices ingested documents into discrete catalog rows with subdocument page coordinates:
  [`ingestion-service.ts:108`](../../packages/core/src/services/ingestion-service.ts#L108)

- Scans page markers during unconfigured or monolithic ingestion to record total page spans:
  [`ingestion-service.ts:130`](../../packages/core/src/services/ingestion-service.ts#L130)

**Flashcard Citation Grounding**

- Deduplicates title prefixes and formats grounded citations as docTitle - Page X, Section Y:
  [`card-generation-service.ts:20`](../../packages/core/src/services/card-generation-service.ts#L20)

- Propagates subdocument page boundaries directly into generated flashcard sourceLocator references:
  [`card-generation-service.ts:149`](../../packages/core/src/services/card-generation-service.ts#L149)

- Preserves generated sourceLocator citations when creating cards synchronously via web API:
  [`server.ts:2365`](../../packages/web/src/server.ts#L2365)

**Verification & Tests**

- Unit test suite for page budget, outline, pageless, fallback, and whitespace slicing:
  [`document-slicing-engine.test.ts:7`](../../packages/core/test/document-slicing-engine.test.ts#L7)

- Unit test suite verifying title deduplication and page citation grounding during generation:
  [`card-generation-service.test.ts:184`](../../packages/core/test/card-generation-service.test.ts#L184)

- Non-destructive SQLite migration test verifying column additions on legacy pre-existing databases:
  [`db.test.ts:32`](../../packages/core/test/db.test.ts#L32)

