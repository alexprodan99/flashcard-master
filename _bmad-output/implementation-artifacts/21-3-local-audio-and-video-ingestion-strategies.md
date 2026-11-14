---
title: 'Story 21.3: Local Audio & Video Ingestion Strategies (`audio` & `video` Data Sources)'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '83faefd'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-21-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Users need separate, first-class `audio` and `video` data sources that accept multiple local files per source, respect each item's configured extraction mode (attached/sidecar `.srt`/`.vtt` subtitles vs. explicit STT engine), probe embedded video subtitle tracks when available, and fall back seamlessly to pre-trimmed Speech-to-Text.

**Approach:**
1. **Shared Media Resolution Pipeline (`packages/adapters/src/ingestion/media-transcript-resolver.ts`)**:
   - Implement the 3-tier transcript resolution waterfall per `MediaSourceItem`:
     1. Explicit `subtitlePath` (or direct `.srt`/`.vtt` file) or matching sidecar `<basename>.srt` / `<basename>.vtt` when `extractionMode` is `'subtitles'` or `'auto'`.
     2. Embedded container subtitle track extraction via `ffprobe`/`ffmpeg` (for `video` files when `extractionMode` is `'subtitles'` or `'auto'`).
     3. Speech-to-Text via the configured `sttProvider` (`openai`, `gemini`, or `whisper-local`), running `AudioTrimmer` on `timestampRanges` first when present.
   - Coalesce cues into `[MM:SS - MM:SS]` formatted transcripts with incremental content hashes and progress callback hooks (`onProgress(step, message)`).
2. **`AudioIngestionStrategy` (`packages/adapters/src/ingestion/audio-strategy.ts`)**:
   - `readonly type = "audio" as const`, supporting `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, and standalone `.srt`/`.vtt` files (single paths, arrays of paths, directories, or `MediaSourceItem[]`).
3. **`VideoIngestionStrategy` (`packages/adapters/src/ingestion/video-strategy.ts`)**:
   - `readonly type = "video" as const`, supporting `.mp4`, `.mkv`, `.webm`, `.mov`, and standalone `.srt`/`.vtt` files, including embedded container subtitle probing.
4. **Registry & Service Wiring (`StrategyRegistry`, `IngestionService`)**:
   - Register `AudioIngestionStrategy` and `VideoIngestionStrategy` in runtime factories (API server, worker threads, CLI) with access to configured STT credentials/adapters.

## Boundaries & Constraints

**Always:**
- Honor per-item `extractionMode`: if the user explicitly picks `'stt'`, skip subtitle probing and run STT directly; if the user picks `'subtitles'`, fail clearly when no subtitle file/track is found instead of silently spending STT tokens.
- Keep `LocalFileStrategy` strictly focused on text/document files (`.md`, `.txt`, `.pdf`, `.docx`, `.epub`).
- Support incremental delta sync via deterministic content hashes covering item URI, subtitle/STT config, and timestamp ranges.

**Never:**
- Never invoke cloud STT when valid `.srt`/`.vtt` subtitles are attached and `extractionMode` is `'subtitles'` or `'auto'`.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/ingestion/media-transcript-resolver.ts` -- Implement 3-tier waterfall (explicit/sidecar `.srt`/`.vtt` -> embedded container subtitles -> pre-trimmed STT), cue coalescing, and progress reporting hooks.
- [x] `packages/adapters/src/ingestion/audio-strategy.ts` -- Implement `AudioIngestionStrategy` (`type = "audio"`).
- [x] `packages/adapters/src/ingestion/video-strategy.ts` -- Implement `VideoIngestionStrategy` (`type = "video"`) with embedded subtitle extraction support.
- [x] `packages/adapters/src/index.ts` & runtime wiring (`packages/web`, `packages/cli`) -- Export strategies and register both in `StrategyRegistry` with configured `SttFactory` / `SettingsService`.
- [x] Unit tests -- Test multi-item `audio` and `video` sources across all 3 waterfall tiers (`subtitles`, `auto` with embedded track, `stt` with custom timestamp ranges, and missing-subtitle error path).

**Acceptance Criteria:**
- `AudioIngestionStrategy` and `VideoIngestionStrategy` are registered in `StrategyRegistry` and handle single or multi-item sources.
- When `extractionMode` is `subtitles` or `auto` and a matching/attached `.srt` or `.vtt` file exists, transcripts are extracted without invoking STT.
- When `video` files contain embedded text subtitle streams and no external `.srt`/`.vtt` is attached, embedded tracks are extracted before falling back to STT.
- When `extractionMode` is `stt` or subtitles are absent, audio is trimmed to custom timestamp ranges (if specified) and transcribed via the item's selected STT adapter.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm test` -- expected: all `AudioIngestionStrategy` and `VideoIngestionStrategy` tests pass.

## Implementation Notes

- **Zero-Setup Media Binaries & Offline Whisper**: Story 21.3 ships `ffmpeg-static` + `ffprobe-static` (unpacked in Electron Desktop builds via `asarUnpack`) for embedded subtitle extraction, pre-STT trimming, and 16 kHz WAV conversion, plus on-demand cross-platform `whisper.cpp` (`whisper-cli`) + GGML model auto-downloading when using `whisper-local` without an external binary or HTTP server.
- **Graceful Untrimmed Video Fallback**: If `ffmpeg` is explicitly unavailable at runtime and no `timestampRanges` are requested, `MediaTranscriptResolver` falls back to direct `sttPort.transcribe()` so formats accepted natively by Gemini/OpenAI still ingest cleanly.

