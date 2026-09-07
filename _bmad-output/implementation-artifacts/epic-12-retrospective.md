# Epic 12 Retrospective: Knowledge Base Document Lifecycle, Reader Pipeline & Offline Media Storage

**Date:** 2026-09-06  
**Branch:** `feat/epic12`  
**Epic Status:** Done  
**Verdict:** ACCEPTED  
**Stories Completed:** 10 / 10 (100%)  

---

## 1. Executive Summary

Epic 12 addressed core knowledge base scalability, article ingestion, and media delivery across Flashcard Master. Originally conceived to handle multi-URL ingestion, document lifecycle management, and knowledge base exports, the epic expanded to solve critical real-world media performance bottlenecks:
1. **Multi-URL & Document Lifecycle (Stories 12.1–12.4):** Implemented multi-URL discovery, concurrent article ingestion, safe document deletion with card preservation options, and multi-document batch inspection/management in the Svelte 5 UI.
2. **Comprehensive Document Export Suite (Stories 12.5–12.6):** Shipped full export capabilities across Markdown, Interactive Study Guide HTML (with TOC, anchors, and citation links), Split ZIP bundles, CSV/TSV, and Anki package formats via streaming REST endpoints and export dialogs.
3. **Format-Preserving Extraction & Raw Content (Story 12.8):** Upgraded `DocumentRepository` schema and migrations to persist `raw_content` alongside stripped clean text, allowing high-fidelity rendering and export of web articles.
4. **Content-Addressed Offline Media Pipeline (Story 12.9):** Created `MediaService` to download, hash (SHA-256), and store image assets locally in `data/media/`, rewriting external URLs to `/api/media/<hash>.<ext>` to protect user privacy and guarantee offline availability.
5. **Automated WebP Compression & E-Reader HTML Optimization (Stories 12.10–12.11):** Integrated `sharp` to convert localized images to WebP and downscale e-reader standalone HTML exports to reading width (600px, Q50 WebP). This reduced massive 380+ image document export sizes from an unmanageable ~43MB down to ~6.5–7.2MB, preventing browser crashes on Microsoft Edge and enabling seamless Kindle/e-reader delivery. Sharp concurrency was capped at 2 to eliminate 100% CPU thread starvation during batch ingestion.

---

## 2. Stories Breakdown

| Story | Title | Scope & Artifacts | Status |
|---|---|---|---|
| **12.1** | Multi-URL Storage and Concurrent Web Reader Engine | Array URL inputs, `WebReaderStrategy` concurrency control, error isolation per article. | ✅ Done |
| **12.2** | Interactive URL List Manager UI | Svelte 5 tag-based URL input chip manager with validation and quick deletion. | ✅ Done |
| **12.3** | Document Deletion & Safe Flashcard Preservation | `DocumentRepository.deleteDocument()` with cascade or orphan preservation options. | ✅ Done |
| **12.4** | Document Inspector Bulk Selection & Management | Checkbox multi-select drawer, bulk deletion, and batch export triggers in UI. | ✅ Done |
| **12.5** | Document Knowledge Base Export Engine | Exporters for Markdown, Study Guide HTML, Split ZIP bundles, CSV, and Anki APKG. | ✅ Done |
| **12.6** | Document Export UI Modal & Streaming Endpoints | Modal dialog with format selection, TOC toggles, and streaming download endpoints. | ✅ Done |
| **12.7** | Monorepo Verification & Automated Test Suites | End-to-end integration and regression test coverage across all packages. | ✅ Done |
| **12.8** | Raw Document Storage & Format-Preserving Extraction | SQLite schema migration 4 for `raw_content`, Turndown HTML cleaner, and raw preview. | ✅ Done |
| **12.9 / 12.10** | Content-Addressed Media Store & WebP Compression | Local filesystem hash storage, WebP compression pipeline, and `/api/media/` endpoint. | ✅ Done |
| **12.11** | Compact HTML Export & Ingestion Performance Pipeline | Compact Base64 WebP inlining, intra-article concurrent downloads, CPU throttle limit. | ✅ Done |

---

## 3. Key Architectural Innovations & Invariants

- **Content-Addressed Asset Storage:** Media files are named by the first 32 hex characters of their SHA-256 digest (`<hash>.<ext>`), guaranteeing deduplication across articles and sources.
- **Dual-Tier Image Optimization:**
  - *Tier 1 (Ingestion):* Original downloaded images are optimized to WebP and stored on disk. Corrupted buffers or unsupported vector formats (SVGs) safely fall back to raw preservation without failing article sync.
  - *Tier 2 (Export):* When generating standalone single-file HTML for e-readers, images are read through a specialized pipeline (`readMediaAsCompactBase64`) downscaling to 600px width/height and re-compressing at Q50 WebP.
- **CPU & Concurrency Throttling:** Sharp thread concurrency is explicitly capped to `Math.min(2, os.cpus().length || 2)` to prevent 100% CPU thread starvation during batch ingestion of media-heavy articles.
- **Safe HTML Sanitization:** SVG XML is sanitized and preserved in vector format without loss of fidelity; scripts and tracking elements are stripped by `HtmlCleaner`.

---

## 4. Verification & Metrics

- **Monorepo Test Pass Rate:** 100% (237 passed, 0 failed across 30 test files)
  - `packages/core`: 15 test files, 91 tests passed
  - `packages/adapters`: 13 test files, 103 tests passed
  - `packages/web`: 1 test file, 37 tests passed
  - `packages/cli`: 1 test file, 6 tests passed
- **Performance Benchmark:**
  - Single-file HTML export size for 380+ image test collections reduced from ~43 MB to ~6.5–7.2 MB (~84% payload reduction).
  - Browser memory consumption during reading reduced by >80%, completely preventing Microsoft Edge and mobile browser tab freezing.
  - Article ingestion image fetch time decreased 2.5x via intra-article `Promise.all` concurrent fetching.

---

## 5. Action Items & Future Considerations

1. **E-Reader Grayscale Profile Preset:** Expose an explicit "Kindle / E-Ink Monochromatic" toggle in the export UI modal to convert images to 8-bit grayscale for further byte savings.
2. **Background Media Cleanup Routine:** Add an administrative maintenance task to prune orphaned media files in `data/media/` that are no longer referenced by any stored document.
