---
title: 'Story 22.3: YouTube Lightweight Metadata Resolution, Persistence & Duplicate Detection'
type: 'feature'
created: '2026-11-18'
status: 'ready-for-dev'
baseline_commit: 'main'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-22-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
When users add YouTube URLs to a `youtube` data source, `MediaItemListEditor.svelte` leaves `item.title` blank for `http(s)://` URLs, so **Edit Data Source** only displays raw URLs (e.g., `https://www.youtube.com/watch?v=...`) instead of recognizable video titles. Furthermore, duplicate detection in `MediaItemListEditor.svelte` only compares raw strings (`youtu.be/abc` vs. `youtube.com/watch?v=abc` are not flagged as duplicates) and resolved titles/canonical URLs are not persisted back to `data_sources.uri`.

**Approach:**
1. **Lightweight Metadata Resolver (`packages/adapters/src/ingestion/youtube-strategy.ts` & `packages/web/src/server.ts`)**:
   - Add a lightweight `resolveLightweightMetadata(input)` helper (using oEmbed / watch-page title extraction without caption download or STT) returning `{ videoId, canonicalUrl, title, channel? }` with graceful fallback when offline.
   - Expose `POST /api/sources/youtube/resolve` accepting `{ urls: string[] }` and returning resolved metadata + `videoId` duplicate analysis.
2. **Persist Titles & Canonical URLs (`packages/core/src/services/ingestion-service.ts` / `packages/web/src/server.ts`)**:
   - During YouTube sync (and when adding/editing via UI), backfill missing `title` and canonical `uri` in the stored `MediaSourceItem[]` JSON in `data_sources.uri`.
3. **Duplicate `videoId` Detection (`packages/web/client/src/components/MediaItemListEditor.svelte`, `packages/core/src/domain/models.ts`)**:
   - Extract canonical 11-char `videoId` across `youtube.com/watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/`, and bare IDs.
   - Prevent/warn on duplicate `videoId`s when pasting/adding items in `MediaItemListEditor.svelte` and normalize duplicate items cleanly.

## Boundaries & Constraints

**Always:**
- Degrade gracefully if YouTube metadata fetch fails or times out (preserve the valid canonical URL and allow saving/syncing without blocking).
- Detect duplicate `videoId`s regardless of URL format (`youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/shorts/ID`, or bare `ID`).

**Never:**
- Never download audio streams or run STT during lightweight metadata resolution.
- Never overwrite a user-customized `item.title` if the user already manually edited a title.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `packages/adapters/src/ingestion/youtube-strategy.ts` -- Add lightweight `resolveVideoMetadataSummary()` / oEmbed + watch-page title helper and export `extractYouTubeVideoId` / `normalizeYouTubeUrl` cleanly.
- [ ] `packages/web/src/server.ts` & `packages/web/client/src/lib/api.ts` -- Implement `POST /api/sources/youtube/resolve` endpoint and client helper, plus persist resolved video titles back into `data_sources.uri` after YouTube sync if missing.
- [ ] `packages/web/client/src/components/MediaItemListEditor.svelte` -- Auto-resolve video titles on YouTube URL addition, store `title` + canonical `uri`, and detect/warn on duplicate `videoId`s across URL variants.
- [ ] Unit tests -- Verify `videoId` duplicate detection across URL formats, lightweight metadata fallback when offline, `/api/sources/youtube/resolve`, and `data_sources.uri` title persistence.

**Acceptance Criteria:**
- Lightweight YouTube metadata resolver extracts `{ videoId, canonicalUrl, title }` cleanly and gracefully falls back if YouTube is unreachable or offline.
- `POST /api/sources/youtube/resolve` resolves one or more YouTube URLs/IDs and returns canonical metadata plus duplicate flags.
- Adding or syncing YouTube items persists resolved video `title` and canonical `uri` in `data_sources.uri` so users can easily identify videos in Edit Data Source.
- Duplicate YouTube URLs resolving to the same 11-character `videoId` are flagged and prevented/deduplicated in `MediaItemListEditor.svelte` and during ingestion.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm test -w @flashcard-master/adapters && npm test -w @flashcard-master/web` -- expected: all tests pass.
