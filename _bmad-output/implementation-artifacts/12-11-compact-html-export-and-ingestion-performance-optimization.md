---
title: "Compact HTML Export Optimization & Ingestion Performance Pipeline"
type: "feature"
created: "2026-09-06"
status: "done"
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Exporting multi-document collections (like .NET Weekly with 300+ articles and 380+ images) into a single standalone HTML document currently inlines full-resolution WebP images as Base64, inflating file size to ~43 MB, which crashes Edge and exceeds e-reader limits. Additionally, catalog syncing fetches images sequentially and consumes 100% of all CPU cores.

**Approach:** Implement a compact e-reader image optimization pipeline in `DocumentExportService` (constraining inlined Base64 images to 600px max width, WebP Q50, maximum compression effort 6, with optional grayscale support) to produce a 100% self-contained, offline single HTML document under ~6.5–7.5 MB that opens in < 0.4s in Edge and sends to Kindle effortlessly. Furthermore, parallelize image downloads within article ingestion and limit Sharp concurrency to 2 threads to keep CPU utilization cool and responsive.

## Boundaries & Constraints

**Always:**
- When inlining media in standalone HTML exports (`DocumentExportService.inlineMediaAsBase64`), downscale raster images to compact e-reader dimensions (default `maxWidth: 600px`, `maxHeight: 600px`, WebP quality 50, `effort: 6`) to keep total standalone HTML file size compact (~6.5–8.5 MB for 300+ articles).
- Preserve vector SVGs verbatim without rasterization.
- Support optional `grayscale: boolean` in export options for extra size reduction (~15% smaller) on black-and-white e-ink Kindle devices.
- Parallelize intra-article image downloads using `Promise.allSettled` / `Promise.all` in both `LlmsTxtIngestionStrategy` and `WebReaderStrategy` to cut ingestion duration by 2x–3x.
- Configure `sharp.concurrency(2)` (or `Math.min(2, os.cpus().length)`) in `MediaService` to prevent CPU starvation and 100% core saturation during batch ingestion.
- Maintain 100% test pass rate across all monorepo packages (`core`, `adapters`, `cli`, `web`).

**Never:**
- Never force external URL dependencies in standalone HTML exports when offline self-contained export is requested.
- Never crash Edge or the export engine on massive 300+ document knowledge bases.
- Never break existing Split ZIP exports or local in-app reader modal previews.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Large Knowledge Base HTML Export | 318 articles, 382 images | Exports a single self-contained `.html` file between 6.5 MB and 7.8 MB (down from 43 MB), opening in Edge in < 0.4s. | Missing media left as fallback |
| Grayscale E-Ink Export | Export with `grayscale: true` | Converts inlined images to optimized 8-bit grayscale WebP, reducing export size to ~6.6 MB. | Safe fallback to standard WebP |
| Multi-Image Article Ingestion | Article with 10 diagrams | Downloads all 10 images concurrently via `Promise.all` instead of sequential serial loop. | Failed image downloads degrade to original URL |
| High-Core Machine Batch Sync | Syncing 318 articles on 16-core CPU | Sharp uses maximum 2 threads; CPU usage stays under 40-50% with smooth system responsiveness. | N/A |
| SVG Vector in Compact HTML | SVG vector diagram | Inlined as clean `data:image/svg+xml;utf8,...` or Base64 without rasterization or blur. | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Add `imageQuality?: "compact" | "standard" | "high"` and `grayscale?: boolean` to `DocumentExportOptions`.
- `packages/core/src/services/media-service.ts` -- Configure `sharp.concurrency(2)` and add `readMediaAsCompactBase64(filename, options)` method.
- `packages/adapters/src/export/document-export-service.ts` -- Update `inlineMediaAsBase64` to use compact e-reader optimization pipeline when generating standalone HTML.
- `packages/adapters/src/ingestion/llms-txt-strategy.ts` -- Parallelize image downloads in `localizeImagesInHtml` using `Promise.all`.
- `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Parallelize image downloads in `localizeImagesInHtml` using `Promise.all`.
- `packages/adapters/test/document-export-service.test.ts` -- Test compact Base64 inlining and size reduction.
- `packages/adapters/test/llms-txt-strategy.test.ts` -- Test parallel image localization during sync.
- `packages/core/test/media-service.test.ts` -- Test compact Base64 rendering and Sharp thread concurrency configuration.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` & `ports/index.ts` -- Extend `DocumentExportOptions` with `imageQuality` and `grayscale` flags -- Support export profile configuration.
- [x] `packages/core/src/services/media-service.ts` -- Set `sharp.concurrency(2)` and implement `readMediaAsCompactBase64()` -- Limit CPU core usage and provide high-efficiency downscaled Base64 encoding.
- [x] `packages/adapters/src/export/document-export-service.ts` -- Update `DocumentExportService` to inline compact WebP images during standalone HTML exports -- Shrink 43 MB export to ~7 MB.
- [x] `packages/adapters/src/ingestion/llms-txt-strategy.ts` -- Parallelize image downloads in `localizeImagesInHtml` with `Promise.all` -- Accelerate sync speed 2x-3x.
- [x] `packages/adapters/src/ingestion/web-reader-strategy.ts` -- Parallelize image downloads in `localizeImagesInHtml` with `Promise.all` -- Accelerate multi-URL web syncs.
- [x] `packages/adapters/test/document-export-service.test.ts` -- Add unit tests for compact HTML export size optimization and grayscale mode.
- [x] `packages/core/test/media-service.test.ts` -- Add tests for `readMediaAsCompactBase64` and concurrency cap.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Update sprint status with Story 12-11.

**Acceptance Criteria:**
- Given a multi-document knowledge base with 380+ images, when exported to Standalone HTML, then the resulting single `.html` file is under 10 MB and opens smoothly in Edge without freezing.
- Given an article containing multiple images, when ingested by `LlmsTxtIngestionStrategy` or `WebReaderStrategy`, then all images are downloaded in parallel with `Promise.all`.
- Given Sharp image processing operations, when running during ingestion, then Sharp thread concurrency is capped to 2 to prevent 100% CPU starvation.

## Spec Change Log
- 2026-09-06: Initial spec creation for compact HTML export optimization and ingestion performance.
- 2026-09-06: Triaged 3-layer code review feedback:
  - Added sRGB normalization and GIF frame extraction in `readMediaAsCompactBase64`.
  - Added full parallelization and single-pass regex replacement in `inlineMediaAsBase64`.
  - Added URL deduplication, lazy-loading check, and data-URI skipping in ingestion strategies.
  - Wired `imageQuality` and `grayscale` into web server, REST API, web client UI, and CLI.
  - Added SVG preservation, multi-image scale, web reader concurrency, and server integration unit tests.

## Design Notes

- **Compact Base64 Inlining:** When generating standalone HTML, reading from `~/.flashcard-master/media/<hash>.webp` through `sharp` with `resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 50, effort: 6 })` produces ~8.6 KB per diagram (down from ~70 KB), yielding an 83% reduction in Base64 text string length.
- **Grayscale Support:** Adding `.grayscale()` provides an additional 15% reduction for users specifically targeting e-ink Kindles.
- **Promise.all in localizeImagesInHtml:** Mapping `images.map(async (img) => ...)` into `await Promise.all(...)` allows all images within a single article to download concurrently, eliminating serial network wait time.

## Verification

**Commands:**
- `npm run test -w @flashcard-master/core` -- expected: All core tests pass.
- `npm run test -w @flashcard-master/adapters` -- expected: All adapter tests pass.
- `npm run test` -- expected: 100% monorepo pass rate.
- `npm run build` -- expected: Clean TypeScript build across all workspace packages.

## Suggested Review Order

1. [`packages/core/src/domain/models.ts`](packages/core/src/domain/models.ts) & [`packages/core/src/ports/index.ts`](packages/core/src/ports/index.ts) -- `ImageQuality`, `CompactMediaOptions`, and `DocumentExportOptions` extensions.
2. [`packages/core/src/services/media-service.ts`](packages/core/src/services/media-service.ts) -- Sharp concurrency cap and `readMediaAsCompactBase64` implementation.
3. [`packages/adapters/src/export/document-export-service.ts`](packages/adapters/src/export/document-export-service.ts) -- Parallel compact Base64 inlining pipeline in standalone HTML.
4. [`packages/adapters/src/ingestion/llms-txt-strategy.ts`](packages/adapters/src/ingestion/llms-txt-strategy.ts) & [`packages/adapters/src/ingestion/web-reader-strategy.ts`](packages/adapters/src/ingestion/web-reader-strategy.ts) -- Concurrency, URL deduplication, and lazy-loading handling.
5. [`packages/web/src/server.ts`](packages/web/src/server.ts), [`packages/cli/src/cli.ts`](packages/cli/src/cli.ts), and [`packages/web/client/src/components/DocumentExportModal.svelte`](packages/web/client/src/components/DocumentExportModal.svelte) -- API and UI option wiring.
6. Test suites:
   - [`packages/core/test/media-service.test.ts`](packages/core/test/media-service.test.ts)
   - [`packages/adapters/test/document-export-service.test.ts`](packages/adapters/test/document-export-service.test.ts)
   - [`packages/adapters/test/llms-txt-strategy.test.ts`](packages/adapters/test/llms-txt-strategy.test.ts)
   - [`packages/adapters/test/web-reader-strategy.test.ts`](packages/adapters/test/web-reader-strategy.test.ts)
   - [`packages/web/test/server.test.ts`](packages/web/test/server.test.ts)
