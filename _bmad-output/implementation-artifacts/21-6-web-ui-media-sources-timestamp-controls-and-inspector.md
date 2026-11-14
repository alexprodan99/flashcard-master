---
title: 'Story 21.6: Web UI Media Source Modals, Per-Item STT/Subtitle & Timestamp Controls, Task Center & Inspector Badges'
type: 'feature'
created: '2026-11-14'
status: 'ready-for-dev'
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
- [ ] `packages/web/src/routes/sources.ts` (and related server/worker handlers) -- Support `audio`, `video`, `youtube` validation, media + `.srt`/`.vtt` upload handling, and granular `JobManager` task logs during media sync.
- [ ] `packages/web/client/src/lib/types.ts` & `api.ts` -- Sync TypeScript client types (`DataSourceType`, `MediaSourceItem`, `startSeconds`, `endSeconds`, timestamp slicing options).
- [ ] `packages/web/client/src/components/MediaItemListEditor.svelte` -- Create reusable per-item editor for extraction mode (`subtitles` / `stt` / `auto`), `.srt`/`.vtt` subtitle attachment, STT provider picker (`OpenAI`, `Gemini`, `Local Whisper`), and custom `start - end` timestamp ranges.
- [ ] `packages/web/client/src/components/AddSourceModal.svelte` & `EditSourceModal.svelte` -- Integrate `Audio`, `Video`, and `YouTube` source flows, `MediaItemListEditor`, and timestamp slicing controls.
- [ ] `SourcesView.svelte`, `SourceDocumentInspector.svelte`, `DocumentPreviewModal.svelte`, `SourceDocumentPickerModal.svelte`, `QuestionExplorer.svelte` -- Add type badges, `⏱️ MM:SS – MM:SS` subdocument timestamp badges, and clickable timestamp links on flashcards.
- [ ] API & Svelte component tests -- Test media upload validation, source creation/editing flows, timestamp badge rendering, and clickable citations.

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

