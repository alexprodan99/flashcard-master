# Intent: Epic 21 — Audio, Video & YouTube Data Sources, Subtitle Parsing, Speech-to-Text & Timestamp Slicing

## Document Metadata & Core Intent
- **Epic**: Epic 21 — Audio, Video & YouTube Data Sources, Subtitle Parsing, Speech-to-Text & Timestamp Slicing
- **Target Areas**:
  1. Media Data Source Taxonomy (`audio`, `video`, `youtube`) & Per-Item Extraction Descriptors (`MediaSourceItemSchema`)
  2. Multi-Format Subtitle Parser (`.srt`, `.vtt`) with Smart Cue Coalescing (`[MM:SS - MM:SS]`)
  3. Speech-to-Text (STT) Port, Pre-STT Audio Trimming & Multi-Provider Adapters (OpenAI, Gemini, Local Offline Whisper)
  4. Local Audio & Video Ingestion Strategies (`audio` and `video` Data Sources)
  5. YouTube Data Source Ingestion Strategy (`youtube` Data Source)
  6. Timestamp Slicing Engine (Custom Timestamp Ranges + Fixed `N`-Minute Intervals / YouTube Chapters), Timestamp Citation Deep-Linking (`?t=<seconds>s`), & Timestamp-Aware `GroundingGuard`
  7. Web UI Media Modals (Per-Item STT/Subtitle & Timestamp Controls), Task Center Progress Streaming, Subdocument Timestamp Badges, Settings STT Defaults & CLI Media Flags
- **Core Intent**: Enable learners to turn podcasts, voice memos, lectures, local video courses, and YouTube videos into grounded, timestamp-cited flashcards. Users can group multiple files or links per data source, choose per item whether to parse subtitles (`.srt`/`.vtt` or YouTube captions) or transcribe via Speech-to-Text (OpenAI, Gemini, or Local Offline Whisper), slice long recordings by custom timestamp ranges or fixed intervals/chapters (trimming audio *before* STT to save time and API cost), and deep-link flashcard citations directly to exact audio/video timestamps.
- **Delivery Strategy**: Complete BMad brainstorming, Epic 21 context, epics breakdown, ready-for-dev story specs, and GitHub tracking issues on `feat/epic-21` before implementation execution.

---

## Pillar 1: Media Data Sources Taxonomy & Per-Item Descriptors
- **Three Dedicated Data Source Types**:
  - `audio`: Local audio files (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`) and optional sidecar/attached subtitle files (`.srt`, `.vtt`).
  - `video`: Local video files (`.mp4`, `.mkv`, `.webm`, `.mov`) and optional sidecar/attached subtitle files (`.srt`, `.vtt`).
  - `youtube`: Dedicated YouTube data source supporting multiple YouTube video URLs (`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`).
- **Multi-Item & Per-Item Configuration (`MediaSourceItemSchema`)**:
  - Just as `local` and `web` sources store multiple entries in `source.uri`, media sources store structured JSON arrays of `MediaSourceItem` objects (preserving backward compatibility for bare string arrays/paths).
  - Each item defines:
    - `uri`: local media path or YouTube URL
    - `title` (optional custom label)
    - `extractionMode`: `'subtitles' | 'stt' | 'auto'`
    - `subtitlePath` (optional explicit `.srt`/`.vtt` path for local `audio`/`video`)
    - `sttProvider`: `'openai' | 'gemini' | 'whisper-local'` (resolved from per-item choice or Settings default)
    - `timestampRanges`: optional array of custom `{ start: string; end: string; label?: string }` windows (e.g., `02:30`–`14:00`).

---

## Pillar 2: Multi-Format Subtitle Parser & Smart Cue Coalescing
- **Supported Formats**:
  - **SubRip (`.srt`)**: Sequence index, `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamps, HTML/SSA formatting tags stripped.
  - **WebVTT (`.vtt`)**: `WEBVTT` header, `STYLE`/`NOTE`/`REGION` metadata blocks ignored, `MM:SS.mmm` / `HH:MM:SS.mmm` cue timings, cue settings and `<c>`/`<v>` voice tags normalized.
- **Smart Cue Coalescing**:
  - Raw captions frequently fracture a single spoken sentence across multiple 2–3 second cues.
  - Coalesce consecutive cues into natural sentence/time-window blocks (e.g., `[04:12 - 04:28] <complete spoken paragraph>`) so LLM context stays coherent and verbatim quote extraction spans whole sentences cleanly.

---

## Pillar 3: Speech-to-Text (STT) Port, Pre-STT Trimming & Multi-Provider Adapters
- **`SpeechToTextPort` (`@flashcard-master/core`)**:
  - Hexagonal port decoupling media ingestion from transcription backends, returning structured timestamped segments (`{ startSeconds, endSeconds, text }[]`).
- **Three STT Backends**:
  1. **OpenAI Audio (`openai`)**: Reuses existing OpenAI API key (`whisper-1` / `gpt-4o-mini-transcribe`, `verbose_json` / timestamped segments).
  2. **Google Gemini Multimodal Audio (`gemini`)**: Reuses existing Gemini API key (`gemini-3.6-flash` / File API audio understanding with structured timestamped transcript output).
  3. **Local Offline Whisper (`whisper-local`)**: Zero-telemetry local transcription via local `whisper` / `whisper.cpp` binary or configurable local Whisper endpoint/model in Settings.
- **Pre-STT Audio Trimming (Speed & Cost Saver)**:
  - Whenever an item defines custom timestamp ranges (e.g., `10:00 - 20:00` out of a 2-hour video), trim/extract only those audio ranges (via `ffmpeg` or media utility) *before* sending audio to OpenAI, Gemini, or Local Whisper, offsetting returned segment timestamps back to original media timeline coordinates.

---

## Pillar 4: Local `audio` & `video` Ingestion Strategies
- **3-Tier Transcript Resolution Waterfall**:
  1. **Explicit or Sidecar Subtitles**: If item specifies `subtitlePath`, or if `extractionMode` is `'subtitles'`/`'auto'` and a matching sidecar `.srt`/`.vtt` exists next to the media file (or user uploads `.srt`/`.vtt` directly), parse it immediately with zero STT cost.
  2. **Embedded Container Subtitles (Video)**: For `video` containers (`.mp4`, `.mkv`, `.webm`), probe for embedded text subtitle tracks (e.g., via `ffprobe`/`ffmpeg`) when in `'auto'` or `'subtitles'` mode.
  3. **Speech-to-Text Fallback / Explicit STT**: If no subtitles exist (or user selected `'stt'`), extract/trim the audio track to the configured timestamp ranges and invoke the selected STT adapter (`openai`, `gemini`, or `whisper-local`).

---

## Pillar 5: YouTube Data Source Ingestion Strategy
- **Dedicated `youtube` Strategy (`YouTubeIngestionStrategy`)**:
  - Supports multiple YouTube video links per data source.
  - **Waterfall Resolution**:
    1. Fetch manual creator subtitles / transcript tracks (preferring user's configured language, e.g., `en`), or auto-generated YouTube captions when `extractionMode` allows `'auto'`/`'subtitles'`.
    2. Extract video metadata and chapter markers when present.
    3. If subtitles are unavailable (or user explicitly chose `'stt'`), extract/download the audio stream, trim to any custom `timestampRanges`, and run the item's chosen STT provider (`openai`, `gemini`, or `whisper-local`).
  - **Graceful Diagnostics**: Actionable errors when captions are disabled and no STT provider/tool is configured, or when a video is private/unavailable.

---

## Pillar 6: Timestamp Slicing, Deep-Linked Citations & `GroundingGuard`
- **Dual Timestamp Slicing Modes**:
  - **Custom Timestamp Ranges (Per Item)**: Slice each file/video strictly along the user-defined `{ start, end, label }` ranges.
  - **Fixed `N`-Minute Interval / Chapter Slicing (Source-Level)**: Automatically partition transcripts into `N`-minute subdocuments (e.g., 5, 10, or 15 minutes) or by detected YouTube chapter boundaries without cutting mid-sentence.
- **Metadata Coordinates**:
  - Store `startSeconds` and `endSeconds` (or formatted timestamp bounds) alongside `startPage`/`endPage` on `DiscoveredDocument` / `documents` SQLite table.
- **Timestamp Citations & Deep-Linking**:
  - Transcript text carries inline markers `[MM:SS - MM:SS]`.
  - Prompt instructions guide the LLM to populate `Flashcard.sourceLocator` with exact timestamp spans (`[04:12 - 04:28]`).
  - For YouTube flashcards, append `?t=<seconds>s` (or `&t=<seconds>s`) to `Flashcard.sourceOriginUrl` matching the `sourceLocator` start time so clicking the citation jumps directly to that timestamp.
- **Timestamp-Aware `GroundingGuard`**:
  - Update `GroundingGuard.normalizeText()` so inline `[MM:SS]` / `[HH:MM:SS]` / `[MM:SS - MM:SS]` timestamp markers are stripped when comparing `sourceQuote` against `sourceText`, ensuring verbatim spoken quotes spanning coalesced cue boundaries pass verification cleanly.

---

## Pillar 7: Web UI, Task Center, Settings & CLI Integration
- **Web UI (`AddSourceModal.svelte` & `EditSourceModal.svelte`)**:
  - Add **Audio**, **Video**, and **YouTube** source type cards.
  - Multi-item list builder where each added file/URL lets users pick: **Has Subtitles** (attach `.srt`/`.vtt` or use YouTube captions) or **Speech-to-Text** (`OpenAI`, `Gemini`, `Local Whisper`) + optional custom timestamp range chips (`+ Add Range: 02:30 - 14:00`).
  - Source-level slicing controls for **Timestamp Interval (minutes)**, **YouTube Chapters**, or **Keep Full Transcript**.
- **Task Center & Document Inspector**:
  - Background worker streams granular media job steps (*Probing subtitles → Trimming audio range → Running STT → Slicing transcript*) to `TaskCenterDrawer.svelte`.
  - `SourceDocumentInspector.svelte` and `DocumentPreviewModal.svelte` display `⏱️ MM:SS – MM:SS` timestamp badges on sliced media subdocuments.
  - Question Explorer / Card Grid renders clickable timestamp deep-links for YouTube cards.
- **Settings & CLI Parity**:
  - `SettingsView.svelte` adds **Speech-to-Text Defaults**: default STT provider (`openai` | `gemini` | `whisper-local`), local Whisper model/binary configuration, and default YouTube caption language.
  - CLI (`@flashcard-master/cli`) adds support for `--type audio|video|youtube`, `--stt-provider`, `--subtitles`, and `--timestamps` / `--interval-minutes`.

