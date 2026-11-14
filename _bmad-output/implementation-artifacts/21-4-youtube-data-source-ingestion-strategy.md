---
title: 'Story 21.4: YouTube Data Source Ingestion Strategy (`youtube` Data Source)'
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
YouTube videos are a major learning medium with unique URL formats, manual and auto-generated caption tracks, chapter markers, and cases where captions are disabled or poor quality—requiring an explicit `youtube` data source distinct from local audio/video files.

**Approach:**
1. **`YouTubeIngestionStrategy` (`packages/adapters/src/ingestion/youtube-strategy.ts`)**:
   - `readonly type = "youtube" as const`, supporting multiple YouTube URLs per source (`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `youtube.com/live/...`).
   - Normalize canonical video IDs and URLs (`https://www.youtube.com/watch?v=<id>`).
2. **Metadata, Chapters & Caption Waterfall**:
   - Fetch video metadata (title, channel, duration, and chapter timestamps when present).
   - When `extractionMode` is `'subtitles'` or `'auto'`: fetch manual creator subtitles first (matching preferred caption language, e.g. `en`), then auto-generated captions (in `'auto'` mode), parsing VTT/SRT/timedtext into coalesced `[MM:SS - MM:SS]` blocks and filtering to custom `timestampRanges` if provided.
   - When captions are unavailable (in `'auto'` mode) or user selected `extractionMode: 'stt'`: extract/download the audio stream (via `yt-dlp` / audio extractor port with injectable runner), trim to custom `timestampRanges` if configured, and transcribe via the item's selected STT adapter (`openai`, `gemini`, or `whisper-local`).
3. **Diagnostic & Resilience Handling**:
   - Preserve original `originUrl` (`https://www.youtube.com/watch?v=<id>`) on `RawDocument` / `CleanTextDocument` for Story 21.5 timestamp deep-linking.
   - Surface actionable errors for invalid YouTube URLs, private/unavailable videos, or captionless videos lacking `yt-dlp`/STT configuration.

## Boundaries & Constraints

**Always:**
- Respect per-item `extractionMode` (`subtitles` vs. `stt` vs. `auto`) and per-item `sttProvider` selection.
- Inject HTTP fetch / `yt-dlp` command runners cleanly so unit tests never rely on live YouTube network calls.
- Clean up any temporary downloaded audio files in `finally` blocks.

**Never:**
- Never hardcode fragile scraping assumptions without structured fallback and clear diagnostics.
- Never silently swallow errors when a video fails to yield any transcript.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `packages/adapters/src/ingestion/youtube-strategy.ts` -- Implement YouTube URL parser/normalizer (`extractYouTubeVideoId`), metadata & chapter extraction, manual/auto caption fetcher, and trimmed audio STT fallback (`YouTubeIngestionStrategy`).
- [ ] `packages/adapters/src/index.ts` & runtime wiring -- Export and register `YouTubeIngestionStrategy` in `StrategyRegistry`.
- [ ] Unit tests -- Test URL normalization (`watch?v=`, `youtu.be/`, `shorts/`), chapter extraction, manual vs. auto caption selection, custom timestamp filtering on captions, STT fallback when captions are missing, and error messages for unavailable videos.

**Acceptance Criteria:**
- `YouTubeIngestionStrategy` parses and normalizes multiple YouTube URL formats within a single data source.
- Manual creator captions (and auto-captions in `'auto'` mode) are fetched and normalized into coalesced `[MM:SS - MM:SS]` transcripts with video title and chapter metadata preserved.
- Missing captions or explicit `'stt'` mode trigger audio extraction, pre-STT range trimming (when custom timestamp ranges exist), and transcription via the item's selected STT adapter.
- Private, unavailable, or captionless videos without configured STT return clear, actionable diagnostic errors.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm test` -- expected: all `YouTubeIngestionStrategy` unit tests pass.

