---
title: "Media Asset WebP Compression & Image Optimization Pipeline"
type: "feature"
created: "2026-09-06"
status: 'done'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Downloaded image assets from web articles and documentation can be several megabytes each (uncompressed PNGs, high-resolution JPEGs, raw camera snapshots), which inflates local disk storage, slows down HTTP transfer, causes browser memory bloat, and massively balloons standalone HTML exports containing inlined Base64 images.

**Approach:** Integrate an automated WebP optimization and compression engine using `sharp` into `MediaService`. Automatically convert and compress raster images (PNG, JPEG, TIFF, BMP, uncompressed WebP) into high-efficiency WebP with configurable quality and max dimensions, while safely preserving vector SVGs and animated graphics, and gracefully falling back to original buffers if compression fails.

## Boundaries & Constraints

**Always:**
- Convert raster images (PNG, JPEG, JPG, TIFF, BMP, unoptimized WebP) to optimized WebP format with configurable quality (default: 80, effort: 4) and optional max-dimension constraint (e.g. 1920px width/height).
- Preserve vector assets (`SVG`) without rasterization as `image/svg+xml`.
- Preserve animated GIFs or handle animation frames safely without corrupting the file.
- Compute SHA-256 content hashes on the final optimized image buffer, ensuring `<hash>.webp` is content-addressed, deduplicated, and consistent.
- Ensure graceful fallback: if an image buffer is corrupted or `sharp` fails to process it, save the original raw buffer with its detected MIME type and extension without throwing or aborting ingestion.
- Pass `MediaService` into `LlmsTxtIngestionStrategy` and `WebReaderStrategy` so all web ingestion pipelines benefit from offline localized and compressed media.
- Maintain 100% test pass rate across all monorepo packages (`core`, `adapters`, `cli`, `web`).

**Never:**
- Never crash ingestion or document syncing if an image fails compression or download.
- Never degrade vector SVGs to raster images.
- Never store raw binary image blobs in the SQLite database.
- Never mutate or alter Markdown text with oversized Base64 strings (always reference `/api/media/<hash>.webp`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Large PNG Optimization | 2 MB PNG diagram | Converted to ~150-300 KB WebP (`<hash>.webp`), MIME `image/webp`. | If sharp fails, saves as original PNG `<hash>.png` |
| JPEG Compression | 3 MB JPEG photo | Converted to optimized WebP with quality 80, reduced by 50–70%. | Graceful fallback to original JPEG |
| SVG Vector Asset | `<svg>...</svg>` | Preserved verbatim as `<hash>.svg`, MIME `image/svg+xml`, zero quality loss. | N/A |
| Already-Optimized WebP | 50 KB WebP image | Re-compressed or verified; saves as `<hash>.webp`. | N/A |
| Corrupted Image Buffer | Invalid binary data | Bypasses sharp compression, saves original buffer as `<hash>.bin` / detected fallback extension. | Logs warning, does not crash |
| Standalone HTML Export with WebP | Document with `/api/media/<hash>.webp` | Exports with inlined `data:image/webp;base64,...`, resulting in 50–70% smaller standalone HTML files. | Missing media left as-is |
| LLMs.txt Image Ingestion | Article in `llms.txt` with PNG diagram | Downloaded, compressed to WebP, stored in `media/<hash>.webp`, text replaced with `![alt](/api/media/<hash>.webp)`. | Fallback to original URL |

</frozen-after-approval>

## Code Map

- `packages/core/package.json` -- Add `sharp` dependency for fast WebP conversion.
- `packages/core/src/domain/models.ts` -- Extend `MediaServiceOptions` and `MediaAsset` interfaces with optimization settings (`optimizeWebp`, `webpQuality`, `maxWidth`, `maxHeight`).
- `packages/core/src/services/media-service.ts` -- Implement `optimizeImageBuffer()` method using `sharp`, automatic conversion to WebP, dimension scaling, and fallback handling.
- `packages/adapters/src/ingestion/llms-txt-strategy.ts` -- Integrate `MediaService` into `LlmsTxtIngestionStrategy` to download, optimize, and localize article images.
- `packages/adapters/src/utils/html-cleaner.ts` -- Ensure `.webp` and localized `/api/media/` references are cleanly maintained during HTML-to-clean-text extraction.
- `packages/core/test/media-service.test.ts` -- Unit tests covering WebP compression, size reduction, SVG preservation, error fallback, and deduplication.
- `packages/adapters/test/llms-txt-strategy.test.ts` -- Unit tests verifying image extraction and localization in `llms.txt` sources.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/package.json` -- Add `sharp` dependency -- Enable native WebP encoding and optimization in core.
- [x] `packages/core/src/domain/models.ts` -- Add `MediaOptimizationOptions` to `MediaServiceOptions` -- Allow configurable WebP quality, max dimensions, and bypass switches.
- [x] `packages/core/src/services/media-service.ts` -- Implement WebP compression with `sharp` in `saveMedia` and `downloadAndSave` -- Compress raster images to WebP, preserve SVGs, handle fallback.
- [x] `packages/adapters/src/ingestion/llms-txt-strategy.ts` -- Pass optional `mediaService` to download and localize article images during `llms.txt` catalog ingestion -- Consistent offline media across all web ingestion strategies.
- [x] `packages/core/test/media-service.test.ts` -- Add comprehensive tests for WebP compression, size reduction ratio, SVG bypass, corrupted buffer fallback, and deduplication -- Verify reliability and performance.
- [x] `packages/adapters/test/llms-txt-strategy.test.ts` -- Test `llms.txt` image localization and WebP storage -- Verify cross-strategy media integration.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Update tracking with Story 12-10 -- Keep sprint status in sync.

**Acceptance Criteria:**
- Given a raw PNG or JPEG image buffer, when processed by `MediaService.saveMedia()`, then it is converted to a high-efficiency WebP file (`<hash>.webp`) with `image/webp` MIME type and substantially reduced byte length.
- Given an SVG vector image, when processed by `MediaService.saveMedia()`, then it is preserved as `image/svg+xml` (`<hash>.svg`) without rasterization.
- Given a corrupted image buffer, when processed by `MediaService`, then it safely falls back to storing the raw buffer without crashing.
- Given a web document or `llms.txt` article with images, when ingested, then all referenced raster images are downloaded and saved as optimized `.webp` files in `~/.flashcard-master/media/`.

## Spec Change Log

## Design Notes

- **Sharp Integration:** `sharp(buffer, { failOnError: false })` with `.webp({ quality: options.webpQuality ?? 80, effort: 4 })` produces 40–75% smaller files compared to original PNGs with imperceptible visual difference for technical diagrams and text charts.
- **Resize Constraints:** If `maxWidth` (e.g. 1920) or `maxHeight` (e.g. 1920) is set, use `sharp.resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })` to prevent enormous 4K/8K screenshots from consuming excess memory.
- **Deduplication:** Hashing the post-compression WebP buffer guarantees that re-downloading or re-processing identical source images maps to the exact same content-addressed file on disk.

## Verification

**Commands:**
- `npm run test -w @flashcard-master/core` -- expected: All core unit tests pass including WebP compression tests.
- `npm run test -w @flashcard-master/adapters` -- expected: All adapter unit tests pass including LLMs.txt and WebReader media localization tests.
- `npm run test` -- expected: All 30+ test suites pass 100% across the monorepo.
- `npm run build` -- expected: TypeScript build succeeds across all workspace packages.
## Suggested Review Order

**Image Optimization & WebP Engine**

- Sharp-powered WebP conversion engine, EXIF rotation, SVG/GIF preservation, and dimension scaling
  [`media-service.ts:46`](../../packages/core/src/services/media-service.ts#L46)

- Media optimization options type definitions
  [`models.ts:13`](../../packages/core/src/domain/models.ts#L13)

**Web Strategy & Ingestion Integration**

- Localized image downloading, WebP optimization, and URL rewriting during catalog parsing
  [`llms-txt-strategy.ts:202`](../../packages/adapters/src/ingestion/llms-txt-strategy.ts#L202)

- Ingestion strategies wireup with MediaService in CLI app context
  [`app.ts:32`](../../packages/cli/src/app.ts#L32)

**Test Coverage & Verification**

- Core unit test suite verifying WebP compression, quality differences, EXIF rotation, and fallbacks
  [`media-service.test.ts:43`](../../packages/core/test/media-service.test.ts#L43)

- LLMs.txt and WebReader integration tests for localized WebP media
  [`llms-txt-strategy.test.ts:121`](../../packages/adapters/test/llms-txt-strategy.test.ts#L121)
