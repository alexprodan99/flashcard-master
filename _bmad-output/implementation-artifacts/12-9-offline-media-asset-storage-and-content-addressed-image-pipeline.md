---
title: 'Offline Media Asset Storage & Content-Addressed Image Pipeline'
type: 'feature'
created: '2026-09-06'
status: 'done'
baseline_commit: '31b4499'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ingested documents currently discard or leave image references as volatile third-party URLs. If original websites go offline, update URLs, or block hotlinking, diagrams and figures are lost forever, preventing true offline reading across devices and exported knowledge bases.

**Approach:** Build a content-addressed local media engine with SHA-256 deduplication in `~/.flashcard-master/media/`, automatically download and localize article images during ingestion, serve local media via `GET /api/media/:filename`, and bundle offline assets in exports (inlined Base64 Data URLs for standalone HTML, and a `./media/` directory for Split ZIP archives).

## Boundaries & Constraints

**Always:**
- Store media files in a dedicated filesystem directory (`~/.flashcard-master/media/` or configured `mediaDir`), indexed by SHA-256 content hash (`<hash>.<ext>`) to guarantee zero SQLite database bloat and automatic deduplication.
- Sanitize all requested media filenames with `path.basename` and reject path-traversal attempts (`../`).
- Serve local media with high-performance immutable caching headers (`Cache-Control: public, max-age=31536000, immutable`).
- Protect LLM generation: `textContent` represents images as lightweight markdown `![Alt description](/api/media/<hash>.<ext>)` (never raw Base64 strings in the LLM prompt).
- For Standalone HTML Export: Automatically inline local images as Base64 Data URLs (`data:image/...;base64,...`) so the HTML file is 100% self-contained offline.
- For Split ZIP Export: Package referenced media files into a `media/` folder in the ZIP archive and rewrite paths to relative `./media/<filename>`.
- Maintain 100% test pass rate across all monorepo packages (`core`, `adapters`, `cli`, `web`).

**Never:**
- Never store raw binary image blobs in the SQLite database.
- Never inline Base64 data directly into `textContent` stored in DB or passed to LLMs.
- Never crash ingestion if a remote image fails to download (degrade gracefully to resolved absolute remote URL or alt text).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ingest HTML with Relative Images | `<img src="/assets/arch.png" alt="Architecture">` with origin `https://example.com/docs/` | Resolves to `https://example.com/assets/arch.png`, downloads buffer, computes SHA-256, saves to `media/<hash>.png`, replaces with `![Architecture](/api/media/<hash>.png)`. | If download fails, keeps `![Architecture](https://example.com/assets/arch.png)` |
| Ingest Multiple Docs Sharing Image | 10 articles contain the same company logo or diagram | Image is downloaded once; subsequent downloads detect existing SHA-256 hash and reuse existing disk file without duplicate storage. | Safe overwrite / reuse |
| Serve Local Media via Web API | `GET /api/media/a1b2c3d4.png` | Streams binary image with appropriate `Content-Type: image/png` and immutable cache header. | 404 if file does not exist |
| Malicious Path Traversal | `GET /api/media/../../etc/passwd` | Sanitized to `passwd`; path traversal rejected. | 404 or 400 Bad Request |
| Render in Document Preview | Markdown with `![Diagram](/api/media/hash.png)` | Renders responsive `<figure class="doc-figure"><img src="/api/media/hash.png" alt="Diagram" loading="lazy" /><figcaption>Diagram</figcaption></figure>`. | Broken image fallback |
| Export Standalone HTML | Document containing `/api/media/hash.png` | `DocumentExportService` converts `/api/media/hash.png` to `data:image/png;base64,...` in the exported `.html` file. | Leaves URL as-is if media file missing |
| Export Split ZIP Archive | Multiple documents containing local media | ZIP contains `media/<hash>.png`, documents rewritten to `<img src="./media/<hash>.png">` or `![alt](./media/<hash>.png)`. | Omits missing media from ZIP |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Define `MediaAsset` interface and media types.
- `packages/core/src/storage/db.ts` -- Export `getDefaultMediaDirectory()`.
- `packages/core/src/services/media-service.ts` -- Implement `MediaService` (saving, downloading, hashing, reading, Base64 conversion, directory management).
- `packages/core/src/index.ts` -- Export `MediaService` and media types.
- `packages/adapters/src/utils/html-cleaner.ts` -- Convert `<img>` tags to resolved Markdown images with alt text.
- `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Support optional `MediaService` to download and localize images during web article extraction.
- `packages/web/src/server.ts` -- Register `GET /api/media/:filename` endpoint to stream local media files with security checks and MIME types.
- `packages/adapters/src/export/document-export-service.ts` -- Support `MediaService` to inline Base64 data URLs in HTML exports and bundle `./media/` directory into Split ZIP archives.
- `packages/web/client/src/components/DocumentPreviewModal.svelte` -- Render Markdown image syntax into styled responsive `<figure>` tags in Reader View.
- `packages/core/test/media-service.test.ts` -- Unit tests for `MediaService` (hashing, deduplication, downloading, base64 conversion).
- `packages/adapters/test/document-export-service.test.ts` -- Unit tests verifying standalone Base64 HTML export and Split ZIP media bundling.
- `packages/web/test/server.test.ts` -- Unit tests verifying `GET /api/media/:filename` endpoint and path traversal prevention.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/media-service.ts` -- Create `MediaService` with SHA-256 hashing, deduplication, disk storage, and base64 helpers.
- [x] `packages/core/src/storage/db.ts` & `packages/core/src/index.ts` -- Export `getDefaultMediaDirectory` and expose `MediaService`.
- [x] `packages/core/test/media-service.test.ts` -- Write comprehensive unit tests for `MediaService`.
- [x] `packages/adapters/src/utils/html-cleaner.ts` & `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Update HTML cleaner and web reader to localize images via `MediaService`.
- [x] `packages/web/src/server.ts` -- Add `GET /api/media/:filename` static serving route with MIME detection and path traversal protection.
- [x] `packages/web/test/server.test.ts` -- Add tests for `/api/media/:filename` endpoint and security validation.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Update export service to inline Base64 images in HTML exports and package `media/` in ZIP archives.
- [x] `packages/adapters/test/document-export-service.test.ts` -- Add tests for media-aware standalone HTML and ZIP export.
- [x] `packages/web/client/src/components/DocumentPreviewModal.svelte` -- Add image rendering support (`<figure>`, `<img>`, `<figcaption>`) and reader typography CSS.

**Acceptance Criteria:**
- Given a web page with images, when ingested by `WebReaderStrategy`, then images are downloaded to `~/.flashcard-master/media/`, deduplicated by SHA-256 hash, and referenced as `/api/media/<hash>.<ext>`.
- Given local media files, when requested via `GET /api/media/<filename>`, then the web server returns the binary with appropriate MIME type and immutable cache headers.
- Given documents with local media, when exported as Standalone HTML, then images are automatically converted to Base64 Data URLs for 100% offline portability.
- Given documents with local media, when exported as Split ZIP, then all referenced media files are bundled into a `media/` folder inside the archive with relative links.
- Given all monorepo test suites, when running `npm test`, then 100% of tests pass cleanly.

## Spec Change Log

## Design Notes

### Content-Addressed Filename Generation
```ts
const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32);
const ext = detectExtension(mimeType, url) || "png";
const filename = `${hash}.${ext}`;
```

### Clean Responsive Figure Rendering
```html
<figure class="doc-figure">
  <img src="/api/media/a1b2c3d4.png" alt="System Architecture" loading="lazy" referrerpolicy="no-referrer" />
  <figcaption>System Architecture</figcaption>
</figure>
```

## Verification

**Commands:**
- `npm run build` -- expected: All 4 packages compile cleanly with zero TypeScript errors.
- `npm test` -- expected: All unit tests across `core`, `adapters`, `cli`, and `web` pass with 100% success rate.

## Suggested Review Order

**Core Media Engine & Content-Addressed Storage**

- Entry point: Content-addressed hashing, deduplication, downloading, and Base64 reading
  [`media-service.ts:13`](../../packages/core/src/services/media-service.ts#L13)

- MediaAsset domain entity schema definition
  [`models.ts:97`](../../packages/core/src/domain/models.ts#L97)

- Default filesystem directory path helper in `~/.flashcard-master/media/`
  [`db.ts:82`](../../packages/core/src/storage/db.ts#L82)

**Web Ingestion Localization & HTML Cleaning**

- Ingestion image localization with URL resolution and `/api/media/` rewrite
  [`web-reader-strategy.ts:105`](../../packages/adapters/src/ingestion/web-reader-strategy.ts#L105)

- HTML to clean Markdown extraction supporting image alt-text and URLs
  [`html-cleaner.ts:88`](../../packages/adapters/src/utils/html-cleaner.ts#L88)

**Static Media Delivery & Export Bundling**

- HTTP GET endpoint with MIME streaming and path traversal rejection
  [`server.ts:1641`](../../packages/web/src/server.ts#L1641)

- Standalone HTML Base64 Data URL embedding and Split ZIP `media/` packaging
  [`document-export-service.ts:175`](../../packages/adapters/src/export/document-export-service.ts#L175)

- Reader View Markdown image parser and responsive figure styling
  [`DocumentPreviewModal.svelte:44`](../../packages/web/client/src/components/DocumentPreviewModal.svelte#L44)

**Test Suites & Verification Coverage**

- Media service unit tests for hashing, deduplication, and Base64 encoding
  [`media-service.test.ts:22`](../../packages/core/test/media-service.test.ts#L22)

- Web server endpoint tests for media streaming, caching, and traversal rejection
  [`server.test.ts:1004`](../../packages/web/test/server.test.ts#L1004)

- Export service tests for Base64 standalone HTML and Split ZIP bundling
  [`document-export-service.test.ts:223`](../../packages/adapters/test/document-export-service.test.ts#L223)

