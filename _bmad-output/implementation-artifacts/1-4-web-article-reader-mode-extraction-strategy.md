---
title: 'Story 1.4: Web Article Reader-Mode Extraction Strategy'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '3952fc78141478c977abc0ab37987702bfca83e4'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/implementation-artifacts/1-3-rss-atom-feed-ingestion-strategy.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users need to generate flashcards from arbitrary web URLs (e.g. blog posts, technical articles, documentation). Raw HTML from web pages contains navigation headers, sidebars, advertisements, cookie notices, and footer clutter that degrades LLM flashcard generation quality.

**Approach:** Implement `WebReaderStrategy` in `packages/adapters/src/ingestion/web-reader-strategy.ts` conforming to `IngestionStrategy` (`type: "web"`), using `@mozilla/readability` and `jsdom` (or `linkedom`) to extract clean, boilerplate-free article content under 3s (NFR-101), compute SHA-256 `contentHash`, and provide fault-tolerant HTTP handling.

## Boundaries & Constraints

**Always:**
- Implement `IngestionStrategy` for `type: "web"`.
- Strip navigational elements, scripts, styles, advertisements, and footer boilerplate using Readability extraction.
- Extract article title, main text content, and URL origin.
- Normalize whitespace and calculate SHA-256 `contentHash` on clean text.
- Enforce timeout limits (< 10s default) to satisfy the sub-3s extraction performance expectation (NFR-101).
- Handle HTTP errors (404, 500, network timeouts) gracefully without throwing uncaught exceptions (NFR-301).

**Ask First:**
- Headless browser rendering (e.g. Puppeteer/Playwright) for JavaScript-heavy SPA pages if static HTTP fetch fails.

**Never:**
- Allow execution of `<script>` tags or remote JavaScript during HTML parsing.
- Block the ingestion pipeline on a single slow or dead URL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Blog Post | Web URL returning HTML with article tag | Extracts clean title & article body, discarding nav/ads | N/A |
| Cluttered Page | Web page with ads, modals, sidebars | Isolates central article content via Readability algorithm | N/A |
| Empty / Short Page | HTML without clear article structure | Extracts body text as fallback | N/A |
| HTTP 404 / 500 | Dead web URL | Returns empty array and logs warning | Catches HTTP error cleanly |
| Network Timeout | Slow / hanging web server | Aborts request after timeout and returns empty array | Catches abort error cleanly |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `RawDocument`, `CleanTextDocument`, `DataSource`
- `packages/core/src/ports/index.ts` -- `IngestionStrategy`
- `packages/adapters/package.json` -- Add `@mozilla/readability`, `jsdom`, `@types/jsdom`
- `packages/adapters/src/ingestion/web-reader-strategy.ts` -- `WebReaderStrategy` implementation
- `packages/adapters/src/index.ts` -- Export `WebReaderStrategy`
- `packages/adapters/test/web-reader-strategy.test.ts` -- Unit and integration tests with HTML fixtures

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/package.json` -- Add `@mozilla/readability`, `jsdom`, `@types/jsdom` dependencies
- [x] `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Implement `WebReaderStrategy` with Readability parsing and clean text extraction
- [x] `packages/adapters/src/index.ts` -- Export `WebReaderStrategy`
- [x] `packages/adapters/test/web-reader-strategy.test.ts` -- Unit tests verifying article extraction, boilerplate removal, fallback extraction, and timeout handling

**Acceptance Criteria:**
- **Given** a data source with type "web" and an article URL
- **When** `WebReaderStrategy.fetch(source)` is executed
- **Then** the page is fetched and parsed into a `RawDocument` containing clean article HTML and title.
- **Given** a `RawDocument` from a web article
- **When** `WebReaderStrategy.extractCleanText(rawDoc)` is called
- **Then** boilerplate-free clean text and SHA-256 `contentHash` are returned.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All web reader and RSS tests pass.
- `npm run build` -- expected: All packages compile without TypeScript errors.



## Suggested Review Order

**Web Reader Ingestion Strategy**

- Mozilla Readability + JSDOM article extraction and HTML cleaning
  [packages/adapters/src/ingestion/web-reader-strategy.ts#L20](../../packages/adapters/src/ingestion/web-reader-strategy.ts#L20)

- Web reader test suite covering article parsing, ad/nav stripping, and fallback
  [packages/adapters/test/web-reader-strategy.test.ts#L1](../../packages/adapters/test/web-reader-strategy.test.ts#L1)

**Adapters Barrel Export**

- Adapters export entry point
  [packages/adapters/src/index.ts#L1](../../packages/adapters/src/index.ts#L1)


### Review Findings

- [x] [Review][Patch] Safely parse article.publishedTime using safeIsoDate to prevent RangeError [packages/adapters/src/ingestion/web-reader-strategy.ts:74]

