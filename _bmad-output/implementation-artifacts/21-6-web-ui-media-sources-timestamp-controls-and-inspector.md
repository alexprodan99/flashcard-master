---
title: 'Story 21.6: Web UI Media Source Modals, Per-Item STT/Subtitle & Timestamp Controls, Task Center & Inspector Badges'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '3b74d42'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-21-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Users need an intuitive, responsive Web UI & Desktop experience to create and manage `audio`, `video`, and `youtube` data sources, add multiple files or links per source, choose per item whether to attach/extract subtitles (`.srt`/`.vtt`) or transcribe via OpenAI / Gemini / Local Whisper, configure custom timestamp ranges or automatic interval slicing, watch long media transcription progress in the Task Center, inspect timestamped subdocuments, and click timestamped YouTube citations in Question Explorer.

**Approach:**
1. **Backend Source & Upload Routes (`packages/web/src/`)**:
   - Accept `'audio'`, `'video'`, and `'youtube'` in source creation/update/sync validation schemas.
   - Extend `POST /api/sources/upload` to accept audio (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`), video (`.mp4`, `.mkv`, `.webm`, `.mov`), and subtitle (`.srt`, `.vtt`) uploads safely.
   - Pass `onProgress` hooks from media strategies into `JobManager` / `JobLogs` so Task Center displays granular stages (*Probing subtitles → Trimming audio range → Running STT → Slicing by timestamp*).
2. **Add & Edit Source Modals (`AddSourceModal.svelte`, `EditSourceModal.svelte`, `MediaItemListEditor.svelte`)**:
   - Add **Audio**, **Video**, and **YouTube** tabs/cards in `AddSourceModal.svelte`.
   - Build a reusable `MediaItemListEditor.svelte` component where each added file or YouTube URL displays:
     - Extraction mode selector: **Subtitles** (with optional `.srt`/`.vtt` upload/pair button for `audio`/`video`, or YouTube captions), **Speech-to-Text** (`OpenAI`, `Gemini`, `Local Whisper` dropdown pre-filled from Settings), or **Auto (Subtitles → STT fallback)**.
     - Custom timestamp ranges builder (`+ Add Timestamp Range`: `02:30` to `14:00`, optional label).
   - Add source-level slicing selector for media sources: **Fixed Interval (Every `N` minutes)**, **Chapters / Custom Ranges**, or **Keep Full Transcript**.
3. **Inspector, Preview, Sources Cards & Question Explorer**:
   - Update `SourcesView.svelte` type badges/icons for `audio`, `video`, and `youtube`.
   - Render `⏱️ MM:SS – MM:SS` duration/timestamp badges on sliced subdocuments in `SourceDocumentInspector.svelte`, `DocumentPreviewModal.svelte`, and `SourceDocumentPickerModal.svelte`.
   - Render clickable timestamp deep-links (`sourceLocator` + `sourceOriginUrl`) on flashcards in `QuestionExplorer.svelte`.

## Boundaries & Constraints

**Always:**
- Match existing dark slate Tailwind design system and accessible keyboard interactions (Escape dismissal, clear validation alerts).
- Keep all existing source types (`rss`, `web`, `local`, `sitemap`, `llms-txt`, `notion`) working identically.
- Warn clearly in UI if a user selects `OpenAI` or `Gemini` STT without a configured API key in Settings, offering a direct link to Settings.

**Never:**
- Never block the UI thread during media sync—always run sync via background `JobManager` + `TaskCenterDrawer`.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/routes/sources.ts` (and related server/worker handlers) -- Support `audio`, `video`, `youtube` validation, media + `.srt`/`.vtt` upload handling, and granular `JobManager` task logs during media sync.
- [x] `packages/web/client/src/lib/types.ts` & `api.ts` -- Sync TypeScript client types (`DataSourceType`, `MediaSourceItem`, `startSeconds`, `endSeconds`, timestamp slicing options).
- [x] `packages/web/client/src/components/MediaItemListEditor.svelte` -- Create reusable per-item editor for extraction mode (`subtitles` / `stt` / `auto`), `.srt`/`.vtt` subtitle attachment, STT provider picker (`OpenAI`, `Gemini`, `Local Whisper`), and custom `start - end` timestamp ranges.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` & `EditSourceModal.svelte` -- Integrate `Audio`, `Video`, and `YouTube` source flows, `MediaItemListEditor`, and timestamp slicing controls.
- [x] `SourcesView.svelte`, `SourceDocumentInspector.svelte`, `DocumentPreviewModal.svelte`, `SourceDocumentPickerModal.svelte`, `QuestionExplorer.svelte` -- Add type badges, `⏱️ MM:SS – MM:SS` subdocument timestamp badges, and clickable timestamp links on flashcards.
- [x] API & Svelte component tests -- Test media upload validation, source creation/editing flows, timestamp badge rendering, and clickable citations.

**Acceptance Criteria:**
- Backend `/api/sources` and `/api/sources/upload` accept `audio`, `video`, and `youtube` source types plus media and `.srt`/`.vtt` subtitle uploads.
- `AddSourceModal.svelte` and `EditSourceModal.svelte` let users add multiple media files or YouTube links and configure extraction mode (`Subtitles` vs. `OpenAI` / `Gemini` / `Local Whisper`), optional `.srt`/`.vtt` attachment, and custom timestamp ranges per item.
- `TaskCenterDrawer.svelte` streams step-by-step media ingestion progress (subtitle check, audio trim, STT transcription, timestamp slicing).
- `SourceDocumentInspector.svelte` and `DocumentPreviewModal.svelte` render `⏱️ MM:SS – MM:SS` badges on sliced media subdocuments, and `QuestionExplorer.svelte` displays clickable timestamp citations.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors across server and Svelte client.
- `npm test` -- expected: all web API and Svelte component tests pass.
- `npm run build` -- expected: production Vite client and backend builds succeed.

## Dev Agent Record

### Summary
- Propagated `startSeconds` and `endSeconds` across background card generation payloads in `packages/web/src/workers/task-types.ts`, `packages/web/src/workers/task-worker.ts`, and `packages/web/src/server.ts`, and updated `task-worker.ts` `COMMIT_CARDS` to emit `d.originUrl || d.sourceOriginUrl || doc.originUrl` so card-level YouTube timestamp deep-links persist in worker jobs.
- Added `stage: "slicing"` emission in `packages/core/src/services/ingestion-service.ts` and mapped `MediaResolutionStage` + `slicing` stage events to Task Center `updateProgress` calls in `packages/web/src/workers/worker-executor.ts`.
- Extended `packages/web/client/src/lib/types.ts` with `'audio' | 'video' | 'youtube'`, `MediaSourceItem`, `SttProvider`, `MediaExtractionMode`, `TimestampRange`, `'timestamps' | 'chapters'` slicing modes, and `startSeconds`/`endSeconds` on `DiscoveredDocument`.
- Implemented `formatSecondsToTimestamp`, `formatTimestampBadge`, `formatLocatorLabel`, `parseMediaItemsSummary`, and `validateMediaItems` in `packages/web/client/src/lib/formatters.ts`.
- Created `packages/web/client/src/components/MediaItemListEditor.svelte` with multi-file upload/drag-drop, YouTube URL batch input, per-item extraction mode (`auto` / `subtitles` / `stt`), `.srt`/`.vtt` pairing upload, STT provider selection with Settings API-key warning, and custom `MM:SS`/`HH:MM:SS` timestamp ranges builder.
- Integrated media types and timestamp/chapter slicing options in `AddSourceModal.svelte` and `EditSourceModal.svelte`, added `audio`/`video`/`youtube` badges and multi-item URI summaries in `SourcesView.svelte`, added `⏱️` timestamp badges in `SourceDocumentInspector.svelte`, `DocumentPreviewModal.svelte`, and `SourceDocumentPickerModal.svelte`, and rendered clickable external timestamp locator links in `QuestionExplorer.svelte`.
- Added unit and API/worker integration tests in `packages/web/test/media-source-ui.test.ts` and verified with `npm run build && npm run typecheck && npm run lint && npm test` (59 test files, 796 tests passed).

### File List
- `packages/core/src/services/ingestion-service.ts`
- `packages/web/src/server.ts`
- `packages/web/src/workers/task-types.ts`
- `packages/web/src/workers/task-worker.ts`
- `packages/web/src/workers/worker-executor.ts`
- `packages/web/client/src/lib/types.ts`
- `packages/web/client/src/lib/formatters.ts`
- `packages/web/client/src/components/MediaItemListEditor.svelte`
- `packages/web/client/src/components/AddSourceModal.svelte`
- `packages/web/client/src/components/EditSourceModal.svelte`
- `packages/web/client/src/components/SourceDocumentInspector.svelte`
- `packages/web/client/src/components/DocumentPreviewModal.svelte`
- `packages/web/client/src/components/SourceDocumentPickerModal.svelte`
- `packages/web/client/src/views/SourcesView.svelte`
- `packages/web/client/src/views/QuestionExplorer.svelte`
- `packages/web/test/media-source-ui.test.ts`
- `_bmad-output/implementation-artifacts/21-6-web-ui-media-sources-timestamp-controls-and-inspector.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

