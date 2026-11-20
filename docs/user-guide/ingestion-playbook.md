# 🌐 Multi-Source Ingestion Playbook

Flashcard Master features a modular, extensible ingestion pipeline built on Hexagonal architecture. It allows you to transform diverse learning sources—from short web articles to multi-hundred-page textbooks—into clean, chunked documents ready for hallucination-free card generation.

---

## 📑 Supported Source Types

| Source Type | Extractor Strategy | Typical Use Cases | Key Features |
| :--- | :--- | :--- | :--- |
| **Web Article** | Mozilla Readability + JSDOM | Blogs, documentation, Wikipedia | Strips navigation, headers, footers, and ads; extracts clean title and body text. |
| **RSS / Atom Feed** | Fast-XML-Parser + Feed Polling | Newsletters, tech publications, blogs | Incremental ingestion; only imports new items since the last sync timestamp. |
| **Local File / Notes** | Fast-Glob + Native Parsers | Obsidian vaults, local Markdown notes | Recursive folder crawling, frontmatter parsing, tag indexing. |
| **EPUB E-Books** | EPUB3 Navigation + JSZip | Technical manuals, e-books, textbooks | Chapter extraction, semantic heading outline slicing, cover image extraction. |
| **PDF Documents** | UnPDF / Native Text Extractor | Academic papers, lecture slides, books | Multi-page text extraction, page coordinate indexing (`startPage`, `endPage`). |
| **Notion Workspaces** | Notion Official SDK Client | Knowledge bases, personal wikis | Recursive page hierarchy crawling, database table syncing, media asset localization. |
| **Local Audio** | `AudioIngestionStrategy` + STT | Podcasts, voice memos, recorded lectures | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`; `.srt`/`.vtt` sidecar pairing; pre-STT `ffmpeg` range trimming. |
| **Local Video** | `VideoIngestionStrategy` + `ffmpeg` | Screen recordings, downloaded courses | `.mp4`, `.mkv`, `.webm`, `.mov`; embedded/sidecar subtitle extraction before STT fallback. |
| **YouTube Videos** | `YouTubeIngestionStrategy` | Online lectures, talks, tutorials | Manual/auto caption tracks, `ytInitialData`/description chapter extraction, `yt-dlp` STT fallback, `?t=Ns` citations. |

---

## 📖 Chapter & Document Slicing for Books (EPUB & PDF)

When ingesting long-form materials like 300-page books or 60-page research reports, passing the entire document to an LLM degrades card quality due to *lost-in-the-middle* attention degradation and context limits.

Flashcard Master provides the **Document Slicing Engine** (`DocumentSlicingEngine`) to split books into focused, chapter-level subdocuments:

```
Full Book (EPUB / PDF)  ──▶  Document Slicing Engine  ──▶  Subdocument Chapters (10–50)
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
Semantic Outline Mode        Page Budget Mode             Word Budget Mode
(Headings H1-H3)             (e.g., 10-page chunks)       (e.g., 2,500-word chunks)
```

### 1. Semantic Outline Mode (`outline`) — *Recommended*
- Analyzes the internal document structure, Table of Contents, and HTML heading elements (`#`, `##`, `<h3>`).
- Splits the text naturally at chapter and major section boundaries.
- Produces clean chapter titles like *"Chapter 1: Foundations"*, *"Chapter 2: Core Concepts"*.
- If a book lacks heading markers, it automatically falls back gracefully to Page Budget or Word Budget mode.

### 2. Page Budget Mode (`pages`)
- Groups pages into consistent blocks (e.g., 5 to 25 pages per subdocument).
- Maintains page coordinate ranges (`startPage` to `endPage`) for precise citation tracing.
- Ideal for textbooks and academic papers with structured page layouts.

### 3. Word Budget Mode (`words`)
- Splits dense text into balanced word counts (e.g., 2,000 to 4,000 words).
- Guarantees each chunk fits comfortably inside optimal LLM attention windows.

### 4. Single Document Mode (`none`)
- Retains the entire input as a single document record.
- Recommended for short articles, single blog posts, and brief meeting notes.

---

## 🗃️ Notion Integration Setup

Flashcard Master connects to Notion via Notion's official REST API to import pages and databases while preserving rich text and headings:

### Step 1: Create an Internal Integration
1. Visit the [Notion Developers Portal](https://www.notion.so/my-integrations).
2. Click **➕ New integration**.
3. Name it `Flashcard Master` and associate it with your target workspace.
4. Set capabilities to **Read content** and **Read user information (without email)**.
5. Copy your **Internal Integration Secret** (`ntn_...`).

### Step 2: Grant Access to Your Target Pages
> **Crucial Step:** In Notion, an integration has zero access until you explicitly invite it to specific pages!
1. Open the Notion page or database you want to ingest.
2. Click the **•••** menu in the top right corner.
3. Scroll down to **Connections** (or **Add connections**).
4. Search for `Flashcard Master` and click **Confirm**.
5. All child pages under this root page will now inherit access automatically.

### Step 3: Add to Flashcard Master
1. In Flashcard Master Web UI, go to **Data Sources** ➔ **➕ Add Source**.
2. Select **Notion Workspace**.
3. Paste your **Integration Token** and enter the **Page URL** or **Database ID**.
4. Set your desired **Max Crawl Depth** (1 for single page, 2–4 for nested subpages).
5. Click **Save & Ingest**.

---

## 🔄 RSS & Atom Feeds Automated Syncing

RSS and Atom feeds allow you to continuously learn from your favorite newsletters and technical publications:
- Flashcard Master records the `lastSyncedAt` timestamp for each feed.
- Only newly published articles are ingested during subsequent syncs.
- Background sync tasks can be triggered manually or via CLI:
  ```bash
  # Incremental sync (defaults to Sync New Only across all active sources):
  flashcard-master sync

  # Incremental sync for a specific source:
  flashcard-master sync <source-id>

  # Force a full re-sync of every item in a source or all active sources:
  flashcard-master sync <source-id> --full
  flashcard-master sync --full
  ```

---

## ⚡ Incremental Sync ("Sync New Only" vs. "Full Re-sync") & Item Visibility

By default, every sync trigger in Flashcard Master runs in **Sync New Only** mode (`syncMode: "new-only"`), avoiding redundant downloads, PDF/EPUB parsing, and expensive Speech-to-Text runs on already-ingested items:

- **Pre-Fetch Filtering Across All 9 Source Types**:
  - **Multi-Item Sources** (`web`, `local`, `audio`, `video`, `youtube`): Skips already-synced URLs, local file paths, and YouTube videos **before** downloading or transcribing, matching canonicalized URLs and video IDs across fragment-sliced subdocuments (`#page=`, `#t=`, `#section=`).
  - **Catalog / Feed Sources** (`rss`, `sitemap`, `llms-txt`, `notion`): Skips already-ingested feed entries, discovered URLs, or unchanged Notion pages while still checking for newly published additions.
- **When to Use Full Re-sync**:
  - **Web UI Split Buttons**: Clicking **⚡ Sync** (row), **🔄 Sync All** (header), or **⚡ Save & Sync** (Edit Data Source modal) runs **Sync New Items Only** in one click. Open the adjacent **▾** menu and choose **Full Re-sync (All Items)** whenever you want to re-fetch and re-slice already-synced items (for example, after changing video transcript slicing intervals in Edit Data Source, or passing new `--slicing-mode` / `--pages-per-chunk` flags via CLI).
  - **CLI Flag (`--full`)**: Both `flashcard-master sync [sourceId]` and `flashcard-master sources sync [sourceId]` default to `new-only` and report newly ingested vs. skipped item counts. Pass `--full` to force full re-ingestion.
- **General "Synced" vs. "New" Visibility in Edit Data Source**:
  - Opening **Edit Data Source** inspects synced parent items (`GET /api/sources/:id/sync-status`) and displays clear **Synced** and **New** status badges across web URLs, local files/directories, media/YouTube lists, feeds, sitemaps, `llms.txt`, and Notion sources—turning newly appended URLs or videos immediately **New** so you know exactly what **Sync New Only** will ingest.
- **YouTube Title Resolution & Video ID Deduplication**:
  - Pasting YouTube URLs automatically resolves video titles (plus backfills missing titles for existing YouTube sources during sync), renders both **Title** and a **clickable URL**, and prevents duplicate videos across `youtube.com/watch?v=...`, `youtu.be/...`, `shorts/`, and `live/` links.

---

## 🏷️ Interactive Tagging & Organization

Data sources can be organized with interactive tags (e.g. `#neuroscience`, `#javascript`, `#economics`):
- Assign tags during source creation or update them in **Data Sources**.
- In **Generate Studio**, filter your source library by tags to focus card generation on specific topics.
- In **Question Explorer**, filter cards by source tags and deck memberships.

---

## 🎙️ Audio, Video & YouTube Ingestion

Flashcard Master supports ingesting spoken-word content from local audio files (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`), local video files (`.mp4`, `.mkv`, `.webm`, `.mov`), and YouTube URLs (`youtube.com/watch?v=...`, `youtu.be/...`, `shorts/`, `live/`).

### Subtitle-First Extraction & Speech-to-Text Providers
For video and YouTube sources, Flashcard Master prioritizes existing transcripts before running Speech-to-Text (STT):
1. **Sidecar / Embedded Subtitles (`subtitles` or `auto` mode)**:
   - Place a matching `.srt` or `.vtt` file next to your media file (or attach it in the Web UI / via `--subtitles <path>`).
   - For local videos, `ffmpeg` probes embedded subtitle streams automatically.
   - For YouTube, creator captions are preferred over auto-generated ASR tracks using your configured **Preferred Subtitle Language** (`DEFAULT_SUBTITLE_LANGUAGE`, default `en`).
2. **Speech-to-Text Fallback (`stt` or `auto` mode)**:
   - **OpenAI Whisper (`openai`)**: Cloud transcription using your `OPENAI_API_KEY`.
   - **Google Gemini (`gemini`)**: Multimodal audio transcription using your `GEMINI_API_KEY`.
   - **Local Whisper (`whisper-local`)**: Offline transcription via a local `whisper.cpp` HTTP server or CLI binary (`LOCAL_WHISPER_MODEL` / `LOCAL_WHISPER_ENDPOINT`).

Configure your defaults and check `ffmpeg`, `yt-dlp`, and `whisper-local` readiness in **Settings ➔ General ➔ Speech-to-Text & Media Defaults**.

### Timestamp Ranges, Chapter Slicing & Deep-Link Citations
- **Pre-STT Range Trimming**: Specify custom timestamp windows (e.g. `05:00-15:00`) per media item so `ffmpeg` trims the audio *before* calling STT, saving both time and API cost while preserving original timestamps.
- **Slicing Modes**:
  - **Video Chapters (`chapters`)** *(YouTube)*: Splits transcripts along YouTube chapter boundaries (falling back to fixed N-minute windows when no chapters are present).
  - **Time Windows (`timestamps`)**: Splits transcripts into fixed N-minute windows (e.g. `10` minutes) aligned cleanly to cue boundaries.
  - **None (`none`)**: Keeps the entire transcript as a single document.
- **Source Defaults & Per-Item Overrides**:
  - **Data Source Default**: Configure and edit the default slicing strategy (`chapters`, `timestamps`, or `none`) and interval minutes in both **Add Source** and **Edit Source** (open **Save & Sync ▾** and select **Full Re-sync (All Items)** to re-slice existing documents immediately).
  - **Per-Item Override**: In multi-item media sources, each audio/video/YouTube row defaults to **Inherit source default**, or can override `slicingMode` (`chapters` | `timestamps` | `none`) and `intervalMinutes` individually (precedence: *Per-item override* &rarr; *Sync/CLI flag* &rarr; *Source default*).
- **CLI Examples**:
  ```bash
  # Add and sync a YouTube source with chapter slicing
  flashcard-master sources add "LLM Intro" youtube "https://www.youtube.com/watch?v=LPZh9BOjkQs" --slicing-mode chapters --interval-minutes 10 --sync

  # Add a local video with a custom timestamp range and offline Whisper STT
  flashcard-master sources add "Systems Lecture" video "/path/to/lecture.mp4" --stt-provider whisper-local --timestamps "02:00-12:00" --sync

  # Inspect discovered timestamp slices
  flashcard-master sources docs <source-id>
  ```
- Generated flashcards retain `⏱️ MM:SS - MM:SS` locators and clickable deep-link URLs (`&t=<seconds>s` for YouTube, `#t=<start>,<end>` for local media).
