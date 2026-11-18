# Brainstorm Intent: Desktop & Web Shared Directory Sync + Sync New Data Only (Epic 22)

## Problem & Goal

Enable zero-friction context switching across Desktop, Web, and CLI without duplicating storage or re-scraping/re-transcribing already-ingested items:
- Unify Desktop, Web, and CLI data and source directories (`data.sqlite`, `media/`, `local-files/`, and caches) onto a single canonical directory: `~/.flashcard-master/`.
- Make incremental **Sync New Only** the default ingestion behavior across UI, API, and CLI, skipping already-known items prior to fetching or transcribing, while preserving an explicit **Full Re-sync** (`--full`) escape hatch.
- Improve source item transparency and deduplication by persisting lightweight YouTube metadata (title, canonical URL, `videoId`) and surfacing **Synced** vs. **New** item visibility across all data sources in Edit Data Source.

---

## Locked Architectural & UX Decisions

1. **Canonical Unified Storage (`~/.flashcard-master/`)**
   - Desktop, Web, and CLI all point directly to `~/.flashcard-master/` for `data.sqlite`, `media/`, `local-files/`, and caches.
   - Retain CLI `--data-dir` override (if present); no custom directory override in Web/Desktop UI or global options.
   - Ensure worker-thread services (e.g., `MediaService`) resolve paths consistently against the unified directory without path drift.

2. **Default Incremental Sync (`Sync New Only`)**
   - **Sync New Only** is the default across UI, API, and CLI.
   - **UI Pattern**: Split-button dropdown on sync actions where **Sync New Only** is the 1-click primary default and **Full Re-sync** is available inside the dropdown.
   - **CLI Pattern**: Incremental sync is the default; expose `--full` to override and re-sync all items.

3. **Identity Preservation & Pre-Fetch Skipping**
   - Skip known items *before* network fetching, scraping, or media transcription.
   - Account for sliced subdocument URL suffixes (`#t=`, `#page=`) when matching against parent item identity so existing items are not misclassified as new.

---

## Source-by-Source Incremental Sync Rules

When running in **Sync New Only** mode (default), known items are skipped pre-fetch using source-appropriate identifiers:

| Source Type | Matching / Identity Rule | Notes |
| --- | --- | --- |
| **PDFs & Local Files** | Match by file name / path only | User-controlled; no cross-path content-hash deduplication. |
| **Web / URLs / Feeds** | Match by canonical URL / `guid` | Normalize away sliced subdocument URL fragments (`#t=`, `#page=`) to preserve parent identity. |
| **YouTube** | Match by `videoId` | Deduplicate against `videoId` resolved from lightweight metadata; skip video fetching/transcription if already known. |

In **Full Re-sync** mode (`--full` CLI flag or **Full Re-sync** UI dropdown option), all items in the source are re-synced regardless of prior status.

---

## YouTube Metadata & Item Visibility Requirements

1. **YouTube Lightweight Metadata Resolution & Persistence**
   - Resolve lightweight YouTube metadata (`videoId`, canonical URL, video `title`) on source add, edit, and sync.
   - Persist video `title` and canonical URL in the source URI JSON so items are easily identifiable in Edit Data Source and can be deduplicated by `videoId`.

2. **General Synced vs. New Visibility in Edit Data Source**
   - Surface **Synced** vs. **New** item status visibility in **Edit Data Source** as a general feature across *all* data source types (not limited to YouTube), enabling users to inspect what **Sync New Only** will include or skip before running a sync.

---

## Versioning & Release Plan (Epic 22 -> v1.3.0)

- **Scope Consolidation**: Combine both tracks (Unified `~/.flashcard-master/` directory + Sync New Only / YouTube metadata & item visibility) into a single **Epic 22**.
- **Target Version**: Release as **v1.3.0** using lockstep SemVer across all 5 packages.
- **PR & Release Workflow**:
  - 1 feature branch and PR per Story (via `gh:pr`).
  - Followed by 1 release bump PR updating all 5 packages in lockstep to `1.3.0`.

---

## Explicit Non-Goals

- **No Electron `userData` Migration**: Point Desktop directly to `~/.flashcard-master/` without automatically migrating legacy Electron `userData` files.
- **No Global UI Directory Override**: Do not add global directory configuration UI or options (only keep CLI `--data-dir` if present).
- **No Cross-Path PDF Content-Hash Deduplication**: Do not hash PDF/local file contents to deduplicate across different paths; match strictly by file name/path.
