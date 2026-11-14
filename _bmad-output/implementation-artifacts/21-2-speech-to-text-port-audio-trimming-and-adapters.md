---
title: 'Story 21.2: Speech-to-Text (STT) Port, Pre-STT Audio Trimming & Multi-Provider Adapters (OpenAI, Gemini, Local Whisper)'
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
Many audio recordings, local videos, and YouTube talks do not have usable `.srt`/`.vtt` subtitles—or users explicitly prefer higher-accuracy Speech-to-Text. Additionally, transcribing a full 2-hour video when the user only cares about `10:00 - 20:00` wastes time, local compute, and API budget.

**Approach:**
1. **Hexagonal `SpeechToTextPort` (`packages/core/src/ports/index.ts`)**:
   - Define `SpeechToTextPort` with `transcribe(input: SttTranscriptionInput): Promise<SttTranscriptionResult>` returning timestamped `TranscriptCue[]` (`{ startSeconds, endSeconds, text }`) plus detected language and duration metadata.
2. **Pre-STT Audio Trimmer (`packages/adapters/src/media/audio-trimmer.ts`)**:
   - Implement an `ffmpeg`-backed utility (with injectable command runner for testability) that extracts mono 16kHz audio from audio/video files and trims strictly to configured `timestampRanges` *before* STT invocation.
   - Offset timestamps returned by the STT adapter by each trimmed segment's `startSeconds` so all transcribed cues retain exact original media timeline coordinates.
   - Chunk oversized files exceeding provider limits (e.g., OpenAI 25MB limit) safely and shift timestamps across chunks.
3. **Three Concrete STT Adapters (`packages/adapters/src/stt/`)**:
   - `OpenAiSttAdapter`: Uses existing OpenAI API key and hardcodes `whisper-1` (`verbose_json` / `segment` timestamp granularities) under the hood—no cloud STT model selection exposed to users.
   - `GeminiSttAdapter`: Uses existing Gemini API key and targets `gemini-3.6-flash` under the hood with multimodal audio input / File API requesting structured JSON timestamped transcript segments—no cloud STT model selection exposed to users.
   - `LocalWhisperSttAdapter`: Runs local offline transcription via configurable `whisper` / `whisper.cpp` CLI binary or local Whisper HTTP endpoint (`baseUrl`, model tier such as `tiny`/`base`/`small`/`medium`/`large-v3` configured in Settings), producing zero cloud telemetry.

## Boundaries & Constraints

**Always:**
- Reuse existing OpenAI and Gemini credentials from `SettingsService` / environment variables—never require separate duplicate provider API keys.
- Clean up temporary trimmed audio files in `finally` blocks so disk space never leaks.
- Surface clear, actionable diagnostics when `ffmpeg` or local `whisper` binary is not installed or when an API key is missing.

**Never:**
- Never send un-trimmed full-length media to an STT provider when explicit `timestampRanges` are provided.
- Never shell out with unescaped user paths (`execFile` / `execFileSync` with argument arrays only).

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/ports/index.ts` -- Define and export `SpeechToTextPort`, `SttTranscriptionInput`, `SttTranscriptionResult`, and `TranscriptCue`.
- [ ] `packages/adapters/src/media/audio-trimmer.ts` -- Implement `AudioTrimmer` (extract audio, trim to timestamp ranges, chunk oversized audio, offset cue timestamps, clean up temp files, probe `ffmpeg` availability).
- [ ] `packages/adapters/src/stt/openai-stt-adapter.ts` -- Implement `OpenAiSttAdapter` supporting timestamped segment output and chunk merging.
- [ ] `packages/adapters/src/stt/gemini-stt-adapter.ts` -- Implement `GeminiSttAdapter` using Gemini multimodal audio + structured JSON segments.
- [ ] `packages/adapters/src/stt/local-whisper-stt-adapter.ts` -- Implement `LocalWhisperSttAdapter` supporting local Whisper CLI JSON/SRT output or local Whisper server HTTP endpoint.
- [ ] `packages/adapters/src/stt/stt-factory.ts` -- Factory resolving `openai` | `gemini` | `whisper-local` adapters from settings/credentials.
- [ ] Unit tests -- Test `AudioTrimmer` range trimming and timestamp offset math, plus mocked unit tests for all three STT adapters and error handling.

**Acceptance Criteria:**
- `SpeechToTextPort` and `SttProvider` (`openai` | `gemini` | `whisper-local`) contracts are exported from `@flashcard-master/core`.
- `AudioTrimmer` extracts audio from media files and trims strictly to configured timestamp windows prior to STT, accurately shifting segment timestamps back to source time coordinates.
- `OpenAiSttAdapter`, `GeminiSttAdapter`, and `LocalWhisperSttAdapter` transcribe audio buffers/files into timestamped segments with graceful error messages when API keys or local Whisper binaries are missing.
- Comprehensive unit tests verify trimming calculations, timestamp offsetting, and all three STT adapters with mocked network/subprocess runners.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm test` -- expected: all unit tests for `AudioTrimmer` and STT adapters pass.

