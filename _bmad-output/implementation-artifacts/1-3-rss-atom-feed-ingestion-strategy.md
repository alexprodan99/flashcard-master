---
title: 'Story 1.3: RSS & Atom Feed Ingestion Strategy'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '6c428b04122190afc919aaa048e71be1c9942b43'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/implementation-artifacts/1-2-data-source-registry-ingestion-strategy-interface.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `flashcard-master` needs to ingest articles and newsletter posts from RSS and Atom XML feeds (e.g. Substack, HackerNews, personal blogs), extracting clean text and unique item identifiers for downstream Q&A generation.

**Approach:** Implement `RssIngestionStrategy` in `packages/adapters/src/ingestion/rss-strategy.ts` using `rss-parser` (or XML parser) and HTML-to-text cleaner, with resilient error handling (NFR-301) and full test coverage.

## Boundaries & Constraints

**Always:**
- Implement the `IngestionStrategy` port interface from `@flashcard-master/core`.
- Support both RSS 2.0 (`<item>`) and Atom 1.0 (`<entry>`) XML formats.
- Extract `title`, `rawContent` (preferring full content tags over short snippets), `publishedAt`, and unique `guid`.
- Convert HTML content into clean, readable text with normalized whitespace.
- Compute SHA-256 `contentHash` on the clean text.
- Catch network and XML parsing errors gracefully, returning empty lists or throwing structured errors rather than unhandled rejections.

**Ask First:**
- Adding authentication headers or proxy support for private feeds.

**Never:**
- Allow XML entity expansion vulnerabilities (ensure safe XML parsing).
- Hardcode third-party API dependencies or vendor SDKs inside the strategy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| RSS 2.0 Feed | Valid RSS XML string / URL | Parses items into `RawDocument[]` with `title`, `guid`, `pubDate` | N/A |
| Atom Feed | Valid Atom XML string / URL | Parses entries into `RawDocument[]` with `title`, `id`, `published` | N/A |
| HTML in Content | `<p>Hello <b>World</b></p>` | `extractCleanText()` returns `"Hello World"` without HTML tags | N/A |
| Invalid / Malformed XML | Malformed XML response | Returns empty array or throws `FeedParsingError` | Catches parse error cleanly |
| Network Timeout / 404 | Unreachable feed URL | Logs error and returns empty array | Catches fetch error cleanly |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Domain models for `RawDocument`, `CleanTextDocument`, `DataSource`
- `packages/core/src/ports/index.ts` -- `IngestionStrategy` interface
- `packages/adapters/package.json` -- Add dependencies (`rss-parser`, `sanitize-html` / `html-to-text`, `vitest`)
- `packages/adapters/src/ingestion/rss-strategy.ts` -- `RssIngestionStrategy` implementation
- `packages/adapters/src/index.ts` -- Export `RssIngestionStrategy`
- `packages/adapters/test/rss-strategy.test.ts` -- Unit and integration tests with XML fixtures

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/package.json` -- Add `rss-parser`, `@types/rss-parser`, `vitest` dependencies
- [x] `packages/adapters/src/ingestion/rss-strategy.ts` -- Implement `RssIngestionStrategy` conforming to `IngestionStrategy`
- [x] `packages/adapters/src/index.ts` -- Export `RssIngestionStrategy`
- [x] `packages/adapters/test/rss-strategy.test.ts` -- Unit tests validating RSS 2.0, Atom 1.0, HTML stripping, content hashing, and error recovery

**Acceptance Criteria:**
- **Given** a data source with type "rss" and a valid RSS/Atom feed
- **When** `RssIngestionStrategy.fetch(source)` is executed
- **Then** all feed items are returned as `RawDocument[]` with titles, publication dates, and GUIDs.
- **Given** a `RawDocument` containing HTML markup
- **When** `RssIngestionStrategy.extractCleanText(rawDoc)` is called
- **Then** HTML tags are stripped, whitespace is collapsed, and a valid SHA-256 `contentHash` is generated.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All RSS and Atom ingestion tests pass.
- `npm run build` -- expected: All workspace packages compile without TypeScript errors.



## Suggested Review Order

**RSS / Atom Ingestion Strategy**

- Core XML parsing, HTML entity stripping, and content hashing
  [packages/adapters/src/ingestion/rss-strategy.ts#L27](../../packages/adapters/src/ingestion/rss-strategy.ts#L27)

- Ingestion test suite covering RSS 2.0, Atom 1.0, and error boundaries
  [packages/adapters/test/rss-strategy.test.ts#L1](../../packages/adapters/test/rss-strategy.test.ts#L1)

**Adapters Index**

- Package exports for adapters
  [packages/adapters/src/index.ts#L1](../../packages/adapters/src/index.ts#L1)
