---
title: 'Remote Media Localization & Packaging for EPUB Exports'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '5ef4c8aa627373ecaede2c6b8c17c15670312bfa'
review_loop_iteration: 0
context:
  - 'packages/adapters/src/export/document-export-service.ts'
  - 'packages/core/src/services/media-service.ts'
  - 'packages/web/src/workers/task-worker.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When exporting document collections (such as Milan Jovanović's .NET Weekly newsletter or web articles) to EPUB eBooks, images referencing external `http(s)://` URLs are not localized or packaged into the EPUB container. Because e-readers (Apple Books, Calibre, Kindle) execute in strict offline sandboxes that reject remote network requests, all illustrations and diagrams appear broken or blank.

**Approach:** Extend `DocumentExportService.exportEpub()` and `MediaService` to scan document text for external `http(s)://` images, download and cache them via `MediaService`, bundle image binaries into `OEBPS/images/<hash>.<ext>`, register them in the `OEBPS/content.opf` manifest with valid MIME types, and rewrite chapter XHTML `img` sources to relative local paths (`images/<hash>.<ext>`) with graceful alt-text fallbacks for offline or 404 failures.

## Boundaries & Constraints

**Always:**
- Discovered remote images must be downloaded and bundled into `OEBPS/images/<hash>.<ext>` inside the EPUB zip container.
- All packaged images must be registered in the `OEBPS/content.opf` manifest with valid media types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`, `image/avif`).
- Chapter XHTML must rewrite image `src` to relative paths (`images/<hash>.<ext>`).
- If an image fails to download (404, offline, or timeout), the export must never fail or crash; it must degrade gracefully by rendering a clean placeholder with the original alt text.
- If multiple documents reference the same remote image URL, it must be deduplicated so that it is only fetched and packaged once.
- Existing local `/api/media/<filename>` image packaging must continue to function without regressions.

**Ask First:**
- Increasing default media download timeouts or altering existing HTML/Markdown export behaviors.

**Never:**
- Never crash an EPUB export due to remote image download failures.
- Never write uncompressed image files into the top-level root of the EPUB archive outside `OEBPS/images/`.
- Never leave external `http(s)://` image tags in chapter XHTML when a clean placeholder or local image is expected.
- Never add external native binary dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Remote Markdown Image in RSS | Document text has `![Diagram](https://milanjovanovic.tech/assets/diagram.png)` | Image downloaded, saved as `OEBPS/images/<hash>.png`, registered in `content.opf`, rewritten to `images/<hash>.png` in chapter XHTML | N/A |
| Remote HTML `<img>` Tag | Document text has `<img src="https://example.com/chart.webp" alt="Chart" />` | Image downloaded, saved as `OEBPS/images/<hash>.webp`, rewritten to `images/<hash>.webp` | N/A |
| Duplicate Remote URLs | 3 documents contain `![Logo](https://example.com/logo.png)` | Single fetch, single file in `OEBPS/images/<hash>.png`, single entry in `content.opf`, all 3 chapters rewritten to `images/<hash>.png` | N/A |
| Image Download 404 / Network Failure | Document text has `![Broken](https://example.com/missing.png)`, server returns 404 | Export succeeds; chapter XHTML contains clean placeholder `[Image: Broken]` with alt text; not added to manifest | Log warning, continue export without crash |
| Remote URL with Query Parameters | `https://example.com/photo.jpg?size=large&v=2` | URL fetched cleanly; packaged filename uses content hash and extension (`<hash>.jpg`); rewritten without query string | N/A |
| Missing MediaService Instance | `DocumentExportService` instantiated without `mediaService` parameter | Export succeeds; remote images retained as-is or replaced with clean alt-text placeholder | Safe fallback without null pointer error |

</frozen-after-approval>

## Code Map

- `packages/core/src/services/media-service.ts` (lines 264-316) -- Add `fetchAndCacheMedia(url, originUrl)` alias/enhancement and in-memory URL memoization cache to prevent redundant HTTP fetches during export batches.
- `packages/adapters/src/export/document-export-service.ts` (lines 1358-1390, 1519-1527) -- In `exportEpub()`:
  - Add discovery regexes scanning both local `/api/media/` and remote `http(s)://` images in Markdown (`![]()`) and HTML (`<img>`).
  - Coordinate batch downloading via `MediaService` with URL deduplication.
  - Package downloaded binaries into `OEBPS/images/${filename}`.
  - Rewrite image sources to relative `images/${filename}` in chapter XHTML, and insert graceful figure placeholders for failed downloads.
  - Register all packaged images with detected MIME types in `OEBPS/content.opf` manifest.
  - Add `.doc-figure-missing` and `.image-placeholder` typography styles in `generateEpubCss()` (lines 1240-1314).
- `packages/web/src/workers/task-worker.ts` (line 417) -- Provide `new MediaService()` when instantiating `DocumentExportService` for background export worker tasks.
- `packages/adapters/test/document-export-service.test.ts` (lines 645-680) -- Add unit and integration tests verifying remote Markdown and HTML image localization, deduplication, 404 degradation, and OPF manifest registration using mock fetch.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/media-service.ts` -- Add `fetchAndCacheMedia` and URL memoization cache -- Guarantees single-fetch deduplication for identical remote image URLs.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Implement remote image scanning, downloading, XHTML rewriting, and manifest registration in `exportEpub()` -- Delivers offline-ready media packaging in EPUB eBooks.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Add missing image placeholder styling and graceful degradation for failed downloads -- Prevents broken offline rendering when images are unreachable.
- [x] `packages/web/src/workers/task-worker.ts` -- Inject `MediaService` into `DocumentExportService` during worker export tasks -- Enables remote media localization in background worker exports.
- [x] `packages/adapters/test/document-export-service.test.ts` -- Unit tests for remote image packaging (Milan's .NET Weekly RSS fixture, duplicate URLs, 404 fallbacks, query params, and manifest MIME types).

**Acceptance Criteria:**
- Given a document collection containing remote images (`![Diagram](https://example.com/diag.png)`), when exported to EPUB format, then the image is downloaded, bundled into `OEBPS/images/`, registered in `OEBPS/content.opf`, and referenced as `images/<hash>.png` in chapter XHTML.
- Given multiple documents referencing the exact same remote image URL, when exported to EPUB, then the image is downloaded only once and packaged as a single file in `OEBPS/images/`.
- Given a document with a remote image that returns HTTP 404 or times out, when exported to EPUB, then the export completes successfully without error, and chapter XHTML renders a descriptive placeholder retaining the alt text.
- Given an EPUB with WebP, PNG, JPEG, SVG, and GIF images, when packaged, then all items in `OEBPS/content.opf` carry the correct `media-type` attributes.

## Spec Change Log

## Design Notes

### Remote Image Discovery Patterns
Document text from RSS feeds and Web Reader strategies contains image references in two primary formats:
1. Markdown: `!\[([^\]]*)\]\((https?:\/\/[^\s")]+)(?:\s+["'][^"']*["'])?\)`
2. HTML: `<img\b[^>]*?\bsrc=["'](https?:\/\/[^"'\s>]+)["'][^>]*>`

### Chapter XHTML Image Rewriting & Fallbacks
```ts
if (localFilename) {
  rewritten = rewritten.replaceAll(remoteUrl, `images/${localFilename}`);
} else {
  // Failed to download: replace with clean offline placeholder
  rewritten = rewritten.replace(new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegex(remoteUrl)}[^)]*\\)`, 'g'), (_m, alt) => {
    return `*[Image: ${alt || 'Image unavailable'}]*`;
  });
}
```

## Verification

**Commands:**
- `pnpm --filter @flashcard-master/adapters test` -- expected: All exporter and adapter tests pass, including remote media EPUB tests.
- `pnpm --filter @flashcard-master/core test` -- expected: All media service tests pass.
- `pnpm test` -- expected: Monorepo test suite passes with 0 regressions.

## Suggested Review Order

1. `packages/adapters/src/export/document-export-service.ts` — Review `exportEpub()` remote image discovery, batch downloading, URL prefix collision prevention (descending length sort), local media fallback, alt-attribute quote parsing, and manifest generation.
2. `packages/core/src/services/media-service.ts` — Review `fetchAndCacheMedia(url, originUrl)`, in-memory `urlCache` memoization, and `application/octet-stream` URL extension fallback in `detectExtension()`.
3. `packages/web/src/workers/task-worker.ts` — Review `MediaService` dependency injection and `outputPath` forwarding in `executeExport`.
4. `packages/adapters/test/document-export-service.test.ts` & `packages/core/test/media-service.test.ts` — Review automated test suites covering RSS fixtures, duplicate URL deduplication, 404 degradations, URL collisions, and image titles.

