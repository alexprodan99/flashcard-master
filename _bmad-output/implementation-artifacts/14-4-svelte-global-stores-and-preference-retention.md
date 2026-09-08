# Implementation Artifact: 14-4 Svelte Global Stores and Preference Retention

**Epic:** Epic 14 - Multi-Processing Task Pipeline, Live SSE Job Center, and Resilient Global State  
**Story:** 14-4 Svelte Global Stores and Preference Retention  
**Status:** Done  
**Date:** 2026-09-08  

---

## 1. Overview & Architecture Conformance

Story 14.4 implements global state management and persistent user preference retention across view navigation in the Flashcard Master web client.

### Key Decisions & Constraints:
- **No Keep-Alive DOM Hiding:** Per user mandate, no `display: none` or DOM keep-alive wrapper hacks were used. Views mount and unmount naturally based on route / tab navigation.
- **Svelte 5 Universal Stores (`.svelte.ts`):** Reactive shared state modules using Svelte 5 runes (`$state`, `$derived`, `$effect`).
- **LocalStorage Preference Syncing:** Generation preferences (`provider`, `model`, `persona`, `difficulty`, `depthMode`, `chunkMultiplier`, `limit`, `targetDeck`, `enforceGrounding`) are automatically synced and restored from `localStorage` under `fc_generation_settings`.
- **Zero Loss Cross-View Navigation:**
  - `generateStore`: Retains source and document checkbox selections, expanded accordions, filter queries, loading states, and ongoing generation / draft cards.
  - `sourcesStore`: Retains discovered sources catalog, expanded drawer states, search filters, and real-time syncing indicators.
  - `explorerStore`: Retains search queries, deck filter chips, difficulty filters, selected card IDs for bulk actions, and answer reveal states.
  - `exportStore`: Retains selected deck and source scope selections for Anki pushing and knowledge base export.
  - `taskStore`: Maintains live Server-Sent Events stream connection to `/api/jobs/stream`, drawer open/close states, active and history tabs, and real-time job/log catalogs.

---

## 2. File Changes Summary

### Stores Created & Enhanced:
1. `packages/web/client/src/stores/generateStore.svelte.ts`:
   - Holds configuration, selection records, document caches, and generation status.
   - Saves to and loads from `localStorage` (`fc_generation_settings` with legacy fallback).
2. `packages/web/client/src/stores/sourcesStore.svelte.ts`:
   - Catalog management, source update/removal, expansion and sync tracking.
3. `packages/web/client/src/stores/explorerStore.svelte.ts`:
   - Cards caching, search query, deck & difficulty filters, bulk selection arrays, answer reveal records.
4. `packages/web/client/src/stores/exportStore.svelte.ts`:
   - Scope retention for `.apkg` and knowledge base document exports.
5. `packages/web/client/src/stores/taskStore.svelte.ts`:
   - SSE connection management, drawer toggling, job progress/status upserting, step log appending.
6. `packages/web/client/src/stores/index.ts`:
   - Re-exports all universal stores.

### Views Refactored:
1. `packages/web/client/src/views/GenerateStudio.svelte`:
   - Bound scope selections and config fields to `generateStore`.
   - Document trees and filter queries persist seamlessly between view navigations.
2. `packages/web/client/src/views/SourcesView.svelte`:
   - Connected to `sourcesStore` for instant view switching without re-fetching flicker or lost expansions.
3. `packages/web/client/src/views/QuestionExplorer.svelte`:
   - Connected to `explorerStore` for filter, search, selection, and reveal retention.
4. `packages/web/client/src/views/ExportCenter.svelte`:
   - Connected to `exportStore` for deck and source filter retention.

### Tests Added:
- `packages/web/test/client-stores.test.ts`:
  - 7 comprehensive unit tests verifying store initialization, reactivity, mutation methods, and localStorage persistence.
- `packages/web/vitest.config.ts`:
  - Lightweight Svelte 5 compiler module transform for vitest.

---

## 3. Verification & Test Output

- `@flashcard-master/web`: 73/73 tests passing (including 7/7 new store tests).
- Monorepo full suite: 501/501 tests passing.
- Client production build: `vite build client` succeeded (dist size: ~173 kB JS, ~69 kB CSS).
- Server build: `tsc` succeeded across all monorepo packages.
