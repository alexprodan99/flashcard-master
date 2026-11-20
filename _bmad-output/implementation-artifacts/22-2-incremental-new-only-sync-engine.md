---
title: 'Story 22.2: Core Incremental "Sync New Only" Engine & Pre-Fetch Item Filtering'
type: 'feature'
created: '2026-11-18'
status: 'review'
baseline_commit: 'main'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-22-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
`IngestionService.syncSource()` currently tracks only a single scalar cursor (`lastGuid`, `contentHash`, `lastSyncedAt`) in `sync_state`, and almost all ingestion strategies (`web`, `local`, `rss`, `sitemap`, `llms-txt`, `audio`, `video`, `youtube`) ignore `lastSync` and re-fetch, re-parse, or re-transcribe every item in a data source on every sync. Additionally, `task-worker.ts` executes `local` source syncing independently without consulting existing `DocumentRepository` records.

**Approach:**
1. **Sync Mode Contract (`packages/core/src/domain/models.ts`, `ports/index.ts`)**:
   - Define `SyncModeSchema = z.enum(["new-only", "full"])` (`SyncMode = "new-only" | "full"`).
   - Extend `IngestionOptions` with `syncMode?: SyncMode` (default `'new-only'`) and `knownItemKeys?: Set<string>` (or structured known-item helper).
2. **Canonical Parent Item Key Extraction (`packages/core/src/services/ingestion-service.ts`)**:
   - Query `this.docRepo.listBySourceId(source.id)` before calling `strategy.fetch(...)`.
   - Normalize document URLs/identifiers by stripping slice fragments (`#page=...`, `#t=...`, `#chapter=...`, etc.) to build canonical parent keys per source type:
     - `local` / `audio` / `video`: normalized file path & basename/filename (strictly path/name-based; no cross-path PDF content-hash deduplication).
     - `web` / `sitemap` / `llms-txt`: normalized canonical HTTP(S) URL.
     - `rss`: item `guid` and link.
     - `youtube`: canonical 11-character YouTube `videoId`.
     - `notion`: existing `last_edited_time` / page ID check.
3. **Pre-Fetch Skipping in Strategies & Worker (`packages/adapters/src/ingestion/*.ts`, `packages/web/src/workers/task-worker.ts`)**:
   - Update strategies (`WebReaderStrategy`, `LocalFileStrategy`, `RssIngestionStrategy`, `SitemapIngestionStrategy`, `LlmsTxtIngestionStrategy`, `AudioIngestionStrategy`, `VideoIngestionStrategy`, `YouTubeIngestionStrategy`, `NotionStrategy`) to skip known items when `syncMode !== "full"` *before* HTTP fetching, PDF/DOCX/EPUB parsing, or audio/video/YouTube STT transcription.
   - Update `SyncTaskPayload` and `task-worker.ts` so `local` source background sync receives `syncMode` and `knownItemKeys` and applies identical pre-parse skipping.
   - Ensure `SyncResult.skippedCount` and worker `TASK_COMPLETE` / logs report both newly ingested and skipped counts accurately.

## Boundaries & Constraints

**Always:**
- Default `syncMode` to `'new-only'` when omitted.
- Preserve full re-fetch / re-slice behavior when `syncMode === 'full'`.
- Strip `#page=`, `#t=`, `#chapter=`, and other slice hash fragments when matching existing `documents` rows back to parent source items.
- Match local/PDF files strictly by normalized file path / filename.

**Never:**
- Never run cross-path PDF content-hash deduplication.
- Never invoke STT transcription or remote article scraping for items skipped by `new-only` mode.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` & `packages/core/src/ports/index.ts` -- Define `SyncMode` (`'new-only' | 'full'`) and extend `IngestionOptions` with `syncMode` and `knownItemKeys`.
- [x] `packages/core/src/services/ingestion-service.ts` -- Build fragment-stripped parent item key sets from `DocumentRepository`, pass `syncMode` and `knownItemKeys` to `strategy.fetch()`, preserve existing documents in `'new-only'` mode (even when slicing is enabled for new items), and report accurate `newCount` / `skippedCount`.
- [x] `packages/adapters/src/ingestion/*.ts` -- Implement pre-fetch skipping of `knownItemKeys` across `local`, `web`, `rss`, `sitemap`, `llms-txt`, `notion`, `audio`, `video`, and `youtube` when `syncMode !== 'full'`.
- [x] `packages/web/src/workers/task-types.ts`, `worker-executor.ts`, `task-worker.ts` -- Pass `syncMode` and `knownItemKeys` for `local` worker sync and pass `syncMode` through `WorkerExecutor` for `IngestionService` syncs.
- [x] Unit & integration tests -- Verify pre-fetch skipping (0 fetch/parse/STT calls for known items), fragment-stripped sliced document matching, path-based PDF matching, and `'full'` mode override across core, adapters, and web worker tests.

**Acceptance Criteria:**
- `IngestionOptions` and `SyncTaskPayload` accept `syncMode?: 'new-only' | 'full'` (default `'new-only'`).
- In `'new-only'` mode, known items (including sliced subdocument parents via fragment-stripped matching) are skipped **before** HTTP fetching, document parsing, or STT transcription across `local`, `web`, `rss`, `sitemap`, `llms-txt`, `notion`, `audio`, `video`, and `youtube`.
- PDF and local files are matched strictly by normalized file path / filename (no cross-path content-hash deduplication).
- In `'full'` mode, all items in the source are re-fetched/re-processed as before, and `task-worker.ts` (`local` sources) respects `syncMode` identically to `IngestionService`.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm test -w @flashcard-master/core && npm test -w @flashcard-master/adapters && npm test -w @flashcard-master/web` -- expected: all unit and integration tests pass.
