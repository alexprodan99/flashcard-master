---
title: 'Raw Document Storage & Format-Preserving Extraction'
type: 'feature'
created: '2026-09-06'
status: 'done'
baseline_commit: '0648f62'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ingestion strategies currently execute destructive whitespace collapsing (`.replace(/\s+/g, " ")`) and indiscriminate tag stripping, destroying line breaks, markdown headings, code fences, and paragraphs across ingested documents (including native Markdown and local text files). Furthermore, SQLite only persists flattened `text_content` while discarding the original `rawContent` payload.

**Approach:** Add `raw_content TEXT` column (with backward-compatible automatic migration) to the SQLite `documents` table, update `IngestionService` to persist `rawContent`, and update `extractCleanText()` across ingestion strategies to preserve natural line breaks, paragraphs, headers, and code fences.

## Boundaries & Constraints

**Always:**
- Preserve natural line breaks, indentation, and markdown headers (`#`, `##`, `*`, ```` ````) in `text_content`.
- Store the untouched original payloads (`rawContent`) in the `raw_content` database column.
- Provide an automatic, idempotent SQLite migration in `db.ts` to add `raw_content` if missing so existing databases upgrade seamlessly without data loss.
- Ensure `DiscoveredDocument` and `CleanTextDocument` domain models in `@flashcard-master/core` support optional `rawContent?: string`.
- Maintain 100% test pass rate across all monorepo workspaces (`core`, `adapters`, `cli`, `web`).

**Never:**
- Never squash newlines and paragraphs into single spaces (`replace(/\s+/g, " ")`) on documents.
- Never break flashcard generation or grounding verification (ensure GroundingGuard quote verification continues to function seamlessly with multi-line formatted text).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ingest Markdown / Text File | Multi-line Markdown file with `# Header`, paragraphs `\n\n`, and `- item` | `text_content` preserves exact headers, paragraphs, and lists. `raw_content` stores full original string. | Trims excessive trailing blank lines |
| Ingest Web Article HTML | Web page with `<p>`, `<h2>`, `<pre><code>` | `raw_content` stores raw HTML / article content. `text_content` preserves paragraph breaks and headings without flattening into 1 line. | Safe fallback if HTML is empty |
| Existing Database Upgrade | SQLite database created with previous schema | `ALTER TABLE documents ADD COLUMN raw_content TEXT` runs idempotently without error or data loss | Catches "duplicate column" error cleanly |
| Card Generation & Grounding | Multi-line document with formatted text | LLM receives formatted document with headers and line breaks; GroundingGuard verifies verbatim quotes correctly. | Discards ungrounded cards as usual |
| Document Export | Export to Markdown or HTML | Exported document renders proper paragraphs and line breaks instead of single-line wall of text. | Clean rendering |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Add `rawContent?: string` to `DiscoveredDocument` and `CleanTextDocument`.
- `packages/core/src/storage/db.ts` -- Update `SCHEMA_SQL` to include `raw_content TEXT` in `documents` table and add idempotent migration logic.
- `packages/core/src/storage/document-repository.ts` -- Update `upsert`, `upsertBatch`, `mapRowToDocument` to handle `raw_content`.
- `packages/core/src/services/ingestion-service.ts` -- Pass `raw.rawContent` to `docRepo.upsertBatch()`.
- `packages/adapters/src/ingestion/local-file-strategy.ts` -- Preserve natural line breaks, markdown structure, and code blocks in `extractCleanText()`.
- `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Preserve paragraph breaks and headings in `extractCleanText()`.
- `packages/adapters/src/ingestion/rss-strategy.ts` -- Preserve paragraph breaks in `extractCleanText()`.
- `packages/adapters/src/ingestion/sitemap-strategy.ts` -- Preserve paragraph breaks and headings in `extractCleanText()`.
- `packages/adapters/src/ingestion/llms-txt-strategy.ts` -- Preserve markdown structure and line breaks in `extractCleanText()`.
- `packages/core/test/document-repository.test.ts` -- Unit tests for `raw_content` storage and retrieval.
- `packages/adapters/test/local-file-strategy.test.ts` -- Unit tests verifying format-preserving extraction.
- `packages/adapters/test/web-reader-strategy.test.ts` -- Unit tests verifying line breaks and headings preservation.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Add `rawContent?: string` property to `DiscoveredDocument` and `CleanTextDocument` models.
- [x] `packages/core/src/storage/db.ts` -- Update `SCHEMA_SQL` table definition and add auto-migration for `raw_content` column on initialization.
- [x] `packages/core/src/storage/document-repository.ts` -- Update insert/update statements and row mappings to persist and retrieve `raw_content`.
- [x] `packages/core/src/services/ingestion-service.ts` -- Supply `raw.rawContent` when assembling documents for batch persistence.
- [x] `packages/adapters/src/ingestion/local-file-strategy.ts` -- Refactor `extractCleanText()` to preserve markdown headers, paragraphs, and code fences.
- [x] `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Refactor `extractCleanText()` to convert block elements (`<p>`, `<h1>`-`<h6>`, `<pre>`, `<li>`) to line breaks and markdown syntax rather than flattening to spaces.
- [x] `packages/adapters/src/ingestion/rss-strategy.ts` & `sitemap-strategy.ts` & `llms-txt-strategy.ts` -- Refactor `extractCleanText()` to maintain paragraph breaks and markdown structure.
- [x] `packages/core/test/document-repository.test.ts` -- Test `raw_content` persistence, retrieval, and batch upsert.
- [x] `packages/adapters/test/local-file-strategy.test.ts` & `web-reader-strategy.test.ts` -- Test format-preserving extraction.

**Acceptance Criteria:**
- Given a local Markdown or text document with headers and paragraphs, when ingested, then `text_content` in SQLite retains exact line breaks, headers, and code fences, and `raw_content` stores the full original payload.
- Given an HTML article from web/RSS/sitemap, when ingested, then `raw_content` stores the original HTML/response and `text_content` contains readable multi-line text with preserved paragraph breaks.
- Given existing flashcard generation and grounding workflows, when executed against formatted documents, then generation completes successfully with verified verbatim quotes.

## Verification

**Commands:**
- `npm test` -- expected: All unit and integration tests across core, adapters, web, and cli pass with 100% success rate.
- `npm run build` -- expected: Clean TypeScript compilation across all workspaces with 0 errors.

## Suggested Review Order

**Database & Domain Models**

- Domain model interface and zod schema support for rawContent
  [`models.ts:28`](../../packages/core/src/domain/models.ts#L28)

- Schema update and idempotent column migration for existing SQLite databases
  [`db.ts:31`](../../packages/core/src/storage/db.ts#L31)

- Document persistence, mapping, and batch upsert statements
  [`document-repository.ts:25`](../../packages/core/src/storage/document-repository.ts#L25)

**Ingestion & Format-Preserving Cleaners**

- Pass-through of rawContent to document batch persistence during sync
  [`ingestion-service.ts:90`](../../packages/core/src/services/ingestion-service.ts#L90)

- Tree-recursive DOM-to-Markdown converter preserving headers, code blocks, and lists
  [`html-cleaner.ts:42`](../../packages/adapters/src/utils/html-cleaner.ts#L42)

- Local file strategy preserving native Markdown, code fences, and paragraphs
  [`local-file-strategy.ts:98`](../../packages/adapters/src/ingestion/local-file-strategy.ts#L98)

- Web reader strategy converting article HTML to structured Markdown with rawContent
  [`web-reader-strategy.ts:184`](../../packages/adapters/src/ingestion/web-reader-strategy.ts#L184)

- Sitemaps, RSS feeds, and llms.txt extraction using HTML/Markdown cleaners
  [`sitemap-strategy.ts:192`](../../packages/adapters/src/ingestion/sitemap-strategy.ts#L192)

**Test Suites**

- HTML cleaner unit tests covering headers, pre/code blocks, lists, and entity decoding
  [`html-cleaner.test.ts:1`](../../packages/adapters/test/html-cleaner.test.ts#L1)

- Automatic database migration tests on legacy schema without raw_content
  [`db.test.ts:130`](../../packages/core/test/db.test.ts#L130)

- Repository unit tests for single and batch raw_content persistence and retrieval
  [`document-repository.test.ts:380`](../../packages/core/test/document-repository.test.ts#L380)
