---
title: 'Multi-URL Storage & Concurrent WebReader Ingestion Engine'
type: 'feature'
created: '2026-09-05'
status: 'done'
baseline_commit: 'd71237fd0585f1bff674e6db15cd89ef6e1e3875'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `WebReaderStrategy` only accepts a single URL in `source.uri`, requiring users to create dozens of redundant data sources when studying related web articles, documentation chapters, or blog posts.

**Approach:** Upgrade `WebReaderStrategy` with smart multi-URL decoding (supporting JSON array strings, newline-delimited lists, and single URLs) and bounded concurrent fetching (pool of 3–5) with isolated error handling and deterministic document hashing per URL.

## Boundaries & Constraints

**Always:**
- Maintain 100% backward compatibility with legacy single-URL strings in `data_sources.uri`.
- Bound concurrent network requests between 3 and 5 (default 3, configurable in options).
- Isolate HTTP and network failures per URL so a failure on one page never aborts or drops sibling pages.
- Produce deterministic document IDs using `sha256(sourceId:originUrl)` and correct SHA-256 clean text content hashes.

**Ask First:**
- Modifying SQLite schema columns or table definitions in `data_sources`.

**Never:**
- Never implement recursive or depth-1 web crawling (multi-URL ingestion is strictly user-specified explicit URLs).
- Never discard successful document extractions if one or more sibling URLs fail.
- Never block or crash the ingestion process on malformed URLs or network timeouts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single URL (Legacy) | `uri: "https://example.com/article"` | Decodes 1 URL, fetches and extracts 1 `RawDocument` | Logs warning if fetch fails, returns `[]` |
| JSON Array String | `uri: '["https://example.com/p1", "https://example.com/p2"]'` | Decodes 2 URLs, fetches concurrently, extracts 2 `RawDocument`s | Failed URLs logged, successful ones returned |
| Newline/Comma Delimited | `uri: "https://example.com/p1\nhttps://example.com/p2"` | Decodes 2 valid URLs, strips whitespace, fetches concurrently | Invalid lines skipped |
| Malformed / Non-HTTP URLs | `uri: '["not-a-url", "ftp://foo", "https://valid.com"]'` | Filters out non-HTTP entries, only fetches `https://valid.com` | Invalid entries skipped silently |
| Bounded Concurrency | 10 URLs with concurrency = 3 | At most 3 requests active simultaneously | Managed via worker pool without flooding server |
| Empty / Whitespace URI | `uri: "   "` | Returns `[]` immediately without network calls | Graceful exit, no errors |

</frozen-after-approval>

## Code Map

- `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Primary strategy implementation: URL parsing utility, bounded concurrency worker pool, and Readability extraction.
- `packages/adapters/test/web-reader-strategy.test.ts` -- Strategy unit tests: single URL, JSON array, newline list, concurrency limits, and error isolation.
- `packages/core/src/domain/models.ts` -- Read-only domain contracts: `DataSource`, `RawDocument`, `CleanTextDocument`.
- `packages/core/src/services/ingestion-service.ts` -- Ingestion service coordinating strategy fetch, delta tracking, and document catalog persistence.

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Export `parseSourceUrls(uri: string): string[]` utility supporting JSON arrays, newline/comma separators, whitespace trimming, and `http://`/`https://` protocol validation.
- [x] `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Implement `fetchSingleUrl(url: string, sourceId: string)` helper with timeout, custom fetch support, and DOM parsing.
- [x] `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Update `fetch(source: DataSource)` to parse all target URLs and execute parallel fetching with bounded concurrency (default 3, configurable via `WebReaderStrategyOptions.concurrency`).
- [x] `packages/adapters/test/web-reader-strategy.test.ts` -- Add comprehensive test suites verifying single URL, JSON array strings, multiline strings, non-HTTP filtering, concurrency bounding, and sibling error resilience.

**Acceptance Criteria:**
- Given a `web` data source with `uri: '["https://a.com", "https://b.com"]'`
- When `WebReaderStrategy.fetch(source)` is executed
- Then both documents are fetched in parallel and returned as `RawDocument[]` with their respective `originUrl` and deterministic `id`.
- Given a multi-URL source where 1 URL returns HTTP 500 and another succeeds
- When `WebReaderStrategy.fetch(source)` is executed
- Then the failed URL is logged as a warning and the successful URL is returned without throwing an unhandled exception.

## Spec Change Log

_None._

## Design Notes

### URL Parsing Utility
`parseSourceUrls` safely inspects the raw string. If it starts with `[` and ends with `]`, it attempts `JSON.parse`. If parsing succeeds and produces an array, string elements matching `^https?://` are returned. Otherwise, fallback regex `split(/[\r\n,]+/)` extracts all valid HTTP/HTTPS URLs.

### Bounded Concurrency Worker Pool
To prevent client socket exhaustion and rate-limit triggers on target hosts, requests are processed using a fixed pool of concurrent workers (`Math.min(concurrency, urls.length)`), advancing an index cursor through the URL array until all items settle.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: all adapter unit tests pass including web reader multi-URL tests.
- `npm test` -- expected: 100% of monorepo tests pass.
- `npm run build` -- expected: TypeScript build across all packages completes with 0 errors.

## Suggested Review Order

**Multi-URL Parsing & Validation**

- Tokenizes JSON arrays, newlines, and comma delimiters while preserving query parameters and deduplicating
  [`web-reader-strategy.ts:13`](../../packages/adapters/src/ingestion/web-reader-strategy.ts#L13)

**Concurrent Fetching & Resource Management**

- Dispatches parallel requests bounded by worker pool with per-URL error isolation
  [`web-reader-strategy.ts:58`](../../packages/adapters/src/ingestion/web-reader-strategy.ts#L58)

- Manages per-URL AbortController and guarantees timer cleanup via try-finally
  [`web-reader-strategy.ts:80`](../../packages/adapters/src/ingestion/web-reader-strategy.ts#L80)

**Automated Test Coverage**

- Tests decoding formats, query comma preservation, bounded concurrency limits, and sibling failure resilience
  [`web-reader-strategy.test.ts:100`](../../packages/adapters/test/web-reader-strategy.test.ts#L100)

