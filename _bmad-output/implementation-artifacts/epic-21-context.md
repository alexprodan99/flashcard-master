# Epic 21 Context: Audio, Video & YouTube Data Sources, Subtitle Parsing, Speech-to-Text & Timestamp Slicing

<!-- Compiled from brainstorming session _bmad-output/brainstorming/brainstorm-epic-21-audio-video-data-source/.memlog.md -->

## Goal

Extend Flashcard Master into multimedia learning by introducing three dedicated data source types (`audio`, `video`, and `youtube`) supporting multiple files or video links per source. Enable users to specify per-item extraction mode (attach/extract `.srt` or `.vtt` subtitles vs. Speech-to-Text using OpenAI, Gemini, or Local Offline Whisper), slice recordings by custom timestamp ranges or automatic time intervals/chapters (trimming audio *before* STT to reduce latency and cost), emit timestamped transcripts compatible with verbatim `GroundingGuard` verification, deep-link YouTube flashcard citations directly to exact timestamps (`?t=<seconds>s`), and monitor long-running media transcription jobs live in the Task Center, Web UI, Settings, and CLI.

## Stories

- **Story 21.1:** Media Domain Schema, Per-Item URI Descriptors & SRT/VTT Subtitle Parser
  - ID: `21-1-media-domain-schema-and-subtitle-parser`
- **Story 21.2:** Speech-to-Text (STT) Port, Pre-STT Audio Trimming & Multi-Provider Adapters (OpenAI, Gemini, Local Whisper)
  - ID: `21-2-speech-to-text-port-audio-trimming-and-adapters`
- **Story 21.3:** Local Audio & Video Ingestion Strategies (`audio` & `video` Data Sources)
  - ID: `21-3-local-audio-and-video-ingestion-strategies`
- **Story 21.4:** YouTube Data Source Ingestion Strategy (`youtube` Data Source)
  - ID: `21-4-youtube-data-source-ingestion-strategy`
- **Story 21.5:** Timestamp Slicing Engine, Citation Deep-Linking & Timestamp-Aware `GroundingGuard`
  - ID: `21-5-timestamp-slicing-citations-and-grounding-guard`
- **Story 21.6:** Web UI Media Source Modals, Per-Item STT/Subtitle & Timestamp Controls, Task Center & Inspector Badges
  - ID: `21-6-web-ui-media-sources-timestamp-controls-and-inspector`
- **Story 21.7:** Settings Default STT Configuration, CLI Media Flags & End-to-End Verification Suite
  - ID: `21-7-settings-stt-defaults-cli-media-flags-and-verification`

## Requirements & Design Decisions

1. **Dedicated Media Data Source Taxonomy (`audio`, `video`, `youtube`):**
   - Extend `DataSourceTypeSchema` and SQLite `data_sources` table `CHECK` constraint (with safe automatic schema migration for existing SQLite databases) to support `audio`, `video`, and `youtube` alongside existing types (`rss`, `web`, `local`, `sitemap`, `llms-txt`, `notion`).
   - Support multiple media items per data source via structured `MediaSourceItem` JSON descriptors stored in `source.uri`, carrying `uri`, optional `title`, `extractionMode` (`subtitles` | `stt` | `auto`), optional `subtitlePath`, `sttProvider` (`openai` | `gemini` | `whisper-local`), and optional custom `timestampRanges` (`{ start, end, label? }[]`).

2. **Multi-Format Subtitle Parser & Smart Cue Coalescing:**
   - Parse `.srt` and `.vtt` subtitle files cleanly into structured timestamped cues (`startSeconds`, `endSeconds`, `text`), stripping HTML/WebVTT styling tags, `NOTE`/`STYLE` blocks, and duplicate rolling lines.
   - Coalesce fragmented 2–3 second caption cues into natural sentence/time-window blocks prefixed with inline timestamp markers (`[MM:SS - MM:SS] ...` or `[HH:MM:SS - HH:MM:SS] ...`).

3. **Speech-to-Text (STT) Port, Pre-STT Trimming & Three STT Adapters:**
   - Define `SpeechToTextPort` in `@flashcard-master/core` returning timestamped transcript segments.
   - Implement three STT adapters in `@flashcard-master/adapters` (users only select the STT provider—no cloud STT model picker):
     - **OpenAI STT (`openai`)**: Uses existing OpenAI key and targets `whisper-1` under the hood (`verbose_json` segment timestamps).
     - **Gemini STT (`gemini`)**: Uses existing Gemini key and targets `gemini-3.6-flash` multimodal audio transcription under the hood returning timestamped segments.
     - **Local Offline Whisper (`whisper-local`)**: Offline privacy-preserving transcription with zero manual setup or installer bloat: supports configurable external CLI / local Whisper HTTP endpoints (`baseUrl`) and defaults to on-demand cross-platform `whisper.cpp` (`whisper-cli`) binary + GGML model (`tiny`, `base`, `small`, `medium`, `large-v3`) auto-download into `~/.flashcard-master/whisper/` (`WHISPER_CACHE_DIR`) on Windows, macOS, and Linux, producing zero cloud telemetry.
   - **Pre-STT Audio Trimming & Embedded Subtitles (`AudioTrimmer`)**: Bundles `ffmpeg-static` and `ffprobe-static` directly in `@flashcard-master/adapters` (with Electron `asarUnpack` rules in `electron-builder.json` and `FFMPEG_PATH`/`FFPROBE_PATH` env overrides) so custom timestamp range trimming (`10:00 - 20:00`), >24 MB chunking, and embedded container subtitle extraction work out of the box without system `ffmpeg` installation, offsetting returned timestamps back to the original timeline.

4. **Local `audio` & `video` Data Source Strategies:**
   - Implement `AudioIngestionStrategy` (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, plus `.srt`/`.vtt` attachments) and `VideoIngestionStrategy` (`.mp4`, `.mkv`, `.webm`, `.mov`, plus `.srt`/`.vtt` attachments).
   - Follow a 3-tier transcript resolution waterfall: (1) explicit `subtitlePath` or matching sidecar `.srt`/`.vtt` file → (2) embedded container subtitle stream (for video) → (3) configured STT adapter (using pre-trimmed audio when custom ranges exist).

5. **Dedicated `youtube` Data Source Strategy:**
   - Implement `YouTubeIngestionStrategy` accepting multiple YouTube URLs per source.
   - Resolve transcripts by fetching manual subtitles or auto-generated captions (preferring configured caption language) and chapter metadata; when captions are unavailable or `'stt'` is explicitly selected, extract the audio stream, trim to custom ranges if configured, and run the selected STT adapter.

6. **Timestamp Slicing, Citation Deep-Linking & Timestamp-Aware `GroundingGuard`:**
   - Extend `DocumentSlicingEngine` with timestamp-based slicing supporting both **Custom Timestamp Ranges** per item and **Automatic Fixed `N`-Minute Intervals / Chapter Slicing** without cutting mid-sentence.
   - Persist `start_seconds` / `end_seconds` (or normalized timestamp metadata) on `documents` in SQLite.
   - Teach `PromptBuilder` to instruct LLMs to set `Flashcard.sourceLocator` to exact timestamp spans (`[04:12 - 04:28]`), and append `&t=<seconds>s` / `?t=<seconds>s` to `sourceOriginUrl` for YouTube cards.
   - Update `GroundingGuard.normalizeText()` to strip inline `[MM:SS]` / `[HH:MM:SS]` / `[MM:SS - MM:SS]` timestamp markers so verbatim spoken quotes pass grounding verification across cue boundaries.

7. **Web UI, Task Center, Settings & CLI Integration:**
   - Update `AddSourceModal.svelte` and `EditSourceModal.svelte` with `audio`, `video`, and `youtube` source tabs, multi-file/URL item list builders, per-item subtitle/STT selector (`Subtitles`, `OpenAI`, `Gemini`, `Local Whisper`), `.srt`/`.vtt` attachment picker, and custom timestamp range editor (`Start - End`).
   - Stream granular media ingestion stages (*Probing subtitles → Trimming audio range → Transcribing via STT → Slicing by timestamp*) to `TaskCenterDrawer.svelte`.
   - Render `⏱️ MM:SS – MM:SS` badges on sliced subdocuments in `SourceDocumentInspector.svelte` and `DocumentPreviewModal.svelte`, and clickable timestamp links on flashcards in `QuestionExplorer.svelte`.
   - Add Speech-to-Text defaults (default STT provider, local Whisper model/path, preferred caption language) in `SettingsView.svelte` and `GeneralSettingsSchema`, plus matching CLI flags (`--type audio|video|youtube`, `--stt-provider`, `--subtitles`, `--timestamps`, `--interval-minutes`).

