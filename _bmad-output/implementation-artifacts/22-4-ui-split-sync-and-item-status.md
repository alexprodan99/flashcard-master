---
title: 'Story 22.4: Web UI Split-Button Sync Controls & General "Synced vs. New" Item Visibility'
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
The Web UI currently provides only a single `⚡ Sync` button per source row and `🔄 Sync All Sources` in the header of `SourcesView.svelte`, giving users no way to choose **Sync New Only** vs. **Full Re-sync (All Items)**. Furthermore, **Edit Data Source** (`EditSourceModal.svelte`) does not indicate which items in a source are already **Synced** vs. **New**, nor does `MediaItemListEditor.svelte` display YouTube video titles alongside their URLs.

**Approach:**
1. **Sync API & Client Wiring (`packages/web/src/server.ts`, `packages/web/client/src/lib/api.ts`, `types.ts`)**:
   - Accept `{ syncMode?: 'new-only' | 'full' }` (default `'new-only'`) on `POST /api/sync` and `POST /api/sync/:id`, forwarding `syncMode` to `WorkerExecutor` and `IngestionService`.
   - Expose item sync-status resolution (`GET /api/sources/:id/items-status` or enriched source document key matching) comparing source items against `documents` (with `#fragment` normalization).
2. **Split-Button Dropdown Controls (`packages/web/client/src/views/SourcesView.svelte`, `AddSourceModal.svelte`, `EditSourceModal.svelte`, `GenerateStudio.svelte`)**:
   - Build a clean, reusable split-button component (or split-button markup) for `⚡ Sync ▾` (per row) and `🔄 Sync All ▾` (header): primary click executes **Sync New Only**, dropdown menu offers **Sync New Items Only** and **Full Re-sync (All Items)**.
   - Display skipped vs. newly ingested counts in completion toasts.
   - Update "Save & Re-sync" in `EditSourceModal.svelte` / `AddSourceModal.svelte` to expose Sync New vs. Full Re-sync cleanly.
3. **General "Synced vs. New" Item Visibility & YouTube Title/URL Display (`EditSourceModal.svelte`, `UrlListManager.svelte`, `MediaItemListEditor.svelte`)**:
   - Across all multi-item and single-item source types (`web`, `local`, `audio`, `video`, `youtube`, `rss`, `sitemap`, `llms-txt`, `notion`), display clear **Synced** vs. **New** status badges in **Edit Data Source** so users know what **Sync New Only** will include or skip.
   - Render YouTube video **Title + clickable URL** in `MediaItemListEditor.svelte`.

## Boundaries & Constraints

**Always:**
- Make **Sync New Only** the 1-click primary action on all split-button sync controls.
- Keep keyboard accessibility (`aria-expanded`, `aria-haspopup`, Escape/outside-click close) on split-button dropdown menus.
- Surface Synced vs. New status generically across all data source types in Edit Data Source.

**Never:**
- Never break existing `SourcesView`, `AddSourceModal`, or `EditSourceModal` flows when a source has 0 documents (all items show as **New**).

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `packages/web/src/server.ts` -- Accept `syncMode` (`'new-only' | 'full'`, default `'new-only'`) in `POST /api/sync` and `POST /api/sync/:id`, and add an endpoint/payload returning Synced vs. New item keys for a source (`GET /api/sources/:id/sync-status` or similar).
- [ ] `packages/web/client/src/lib/types.ts` & `packages/web/client/src/lib/api.ts` -- Add `SyncMode` type, pass `syncMode` in `syncSource` / `syncAllSources`, and add client helper to fetch source item sync status.
- [ ] `packages/web/client/src/views/SourcesView.svelte` -- Implement split-button dropdowns for `⚡ Sync ▾` and `🔄 Sync All ▾` (1-click default = Sync New Only, dropdown option = Full Re-sync) and update toast summaries to include skipped counts.
- [ ] `packages/web/client/src/components/EditSourceModal.svelte`, `UrlListManager.svelte`, `MediaItemListEditor.svelte`, `AddSourceModal.svelte` -- Render **Synced** vs. **New** item status badges across all data sources in Edit Data Source, render YouTube **Title + URL** clearly, and support `syncMode` when syncing from modals.
- [ ] `packages/web/test/` -- Add/update component & server tests verifying split-button behavior, `syncMode` routing, Synced/New item badges across source types, and YouTube title/URL rendering.

**Acceptance Criteria:**
- `POST /api/sync` and `POST /api/sync/:id` default to `syncMode: 'new-only'` and support `{ syncMode: 'full' }`.
- `SourcesView.svelte` renders split-button dropdowns for both per-row `⚡ Sync ▾` and header `🔄 Sync All ▾`, with **Sync New Only** as the 1-click default and **Full Re-sync (All Items)** in the dropdown.
- `EditSourceModal.svelte` (covering `web`, `local`, `audio`, `video`, `youtube`, `rss`, `sitemap`, `llms-txt`, `notion`) displays **Synced** vs. **New** item visibility badges, and `MediaItemListEditor.svelte` renders YouTube video `title` alongside its URL.
- UI tests verify split-button interactions, `syncMode` API payloads, item status badges, and YouTube title/URL rendering.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm run build -w @flashcard-master/web` -- expected: Svelte client & server compile cleanly.
- `npm test -w @flashcard-master/web` -- expected: all server & client tests pass.
