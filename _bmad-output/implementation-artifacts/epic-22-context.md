# Epic 22 Context: Unified Desktop/Web Data Directory, Incremental "Sync New Only" Ingestion & YouTube Metadata Identity

<!-- Compiled from brainstorming session _bmad-output/brainstorming/brainstorm-epic-22-desktop-web-sync-and-incremental-sync-2026-11-17/.memlog.md -->

## Goal

Unify Desktop (`@flashcard-master/desktop`), Web (`@flashcard-master/web`), and CLI (`@flashcard-master/cli`) storage onto a single canonical directory (`~/.flashcard-master/`) while making incremental **Sync New Only** the default ingestion behavior across UI, API, background workers, and CLI — paired with lightweight YouTube metadata resolution (`videoId` deduplication + title/URL display) and general **Synced vs. New** item visibility across all data sources in Edit Data Source.

## Stories

- **Story 22.1:** Unified `~/.flashcard-master/` Data Directory Across Desktop, Web, and CLI
  - ID: `22-1-unified-desktop-web-directory`
- **Story 22.2:** Core Incremental "Sync New Only" Engine & Pre-Fetch Item Filtering
  - ID: `22-2-incremental-new-only-sync-engine`
- **Story 22.3:** YouTube Lightweight Metadata Resolution, Persistence & Duplicate Detection
  - ID: `22-3-youtube-metadata-identity-and-dedup`
- **Story 22.4:** Web UI Split-Button Sync Controls & General "Synced vs. New" Item Visibility
  - ID: `22-4-ui-split-sync-and-item-status`
- **Story 22.5:** CLI `--full` Sync Flag, Documentation & End-to-End Verification Suite
  - ID: `22-5-cli-full-flag-docs-and-e2e`

## Requirements & Design Decisions

1. **Canonical Unified Storage (`~/.flashcard-master/`):**
   - Desktop (`main.ts`, `bootstrap.ts`, `server-runner.ts`), Web (`server.ts`, `task-worker.ts`), and CLI (`app.ts`, `cli.ts`) all point directly to `~/.flashcard-master/` for `data.sqlite`, `media/`, `local-files/`, and tool caches (`yt-dlp/`, `whisper/`).
   - **No legacy `userData` migration:** Desktop points directly to `~/.flashcard-master/` without migrating prior Electron `userData` files.
   - **No global UI directory override:** Keep Web and Desktop locked to `~/.flashcard-master/` without adding global settings UI; add an optional `--data-dir <path>` override flag on `@flashcard-master/cli` only.
   - Propagate `mediaDir` cleanly into background worker threads (`task-worker.ts`) and read CLI `.version(...)` dynamically from `package.json`.

2. **Default Incremental Sync (`new-only`) & Pre-Fetch Skipping:**
   - Default `syncMode` is `'new-only'` across `IngestionService`, REST APIs, Web UI, worker threads, and CLI; `'full'` (`--full` in CLI, **Full Re-sync (All Items)** in UI dropdown) re-fetches everything.
   - Skip known items **before** network requests, PDF/DOCX/EPUB parsing, or Whisper/OpenAI/Gemini STT transcription by matching existing `documents` rows for the source (normalizing away slice URL fragments like `#page=`, `#t=`, `#chapter=`):
     - `local` / `audio` / `video`: normalized file path / filename (strictly path/name-based; **no** cross-path PDF content-hash deduplication).
     - `web` / `sitemap` / `llms-txt`: canonical URL.
     - `rss`: item `guid` / link.
     - `youtube`: canonical 11-character `videoId`.
     - `notion`: existing `last_edited_time` / page ID check.
   - Ensure `task-worker.ts` (`local` source path) follows the exact same `syncMode` skipping logic as `IngestionService`.

3. **YouTube Lightweight Metadata & General Item Visibility:**
   - Resolve lightweight YouTube video metadata (`videoId`, `canonicalUrl`, `title`) on add/edit/sync without downloading transcripts or audio, persisting `title` + canonical `uri` in `data_sources.uri`.
   - Deduplicate YouTube items by canonical `videoId` (e.g., catching `youtu.be/<id>` vs. `youtube.com/watch?v=<id>`).
   - Surface **Synced vs. New** item status badges across **all** data source types in Edit Data Source, plus YouTube video title + URL display in `MediaItemListEditor.svelte`.

4. **UI Split-Button Sync & Versioning Plan (`v1.3.0`):**
   - Replace single `⚡ Sync` and `🔄 Sync All Sources` buttons in `SourcesView.svelte` with split-button dropdowns where **Sync New Only** is the 1-click default and **Full Re-sync (All Items)** sits in the dropdown.
   - Implement Stories 22.1–22.5 as separate feature branches & PRs (`feat/story-22-<n>-<slug>` via `npm run gh:pr`), followed by a single lockstep release PR bumping all 5 workspace packages + root `package.json` to **`1.3.0`**.
