---
title: 'Story 17.1: Database Path Unification & LocalStorage State Persistence'
type: 'feature'
created: '2026-10-05'
status: 'done'
baseline_commit: '7bcd0ef5cc129c20bb42ce3e867522f41aa459dc'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-rich-document-ingestion-and-exports/SPEC.md'
  - '_bmad-output/specs/spec-rich-document-ingestion-and-exports/brownfield.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Flashcard Master had divergent default database locations (`~/.flashcard-master/flashcards.db` in CLI vs `~/.flashcard-master/data.sqlite` in Core/Web), risking data fragmentation across tools, while browser reloads (F5) wipe out in-progress document selections, source accordion states, and filter queries in Generate Studio, causing user frustration and perceived data loss.

**Approach:** Unify all packages onto the canonical `~/.flashcard-master/data.sqlite` path with automatic legacy database migration, and expand `generateStore.svelte.ts` and `DashboardView.svelte` to persist active selections, accordion states, filters, and cached metrics in `localStorage` with Stale-While-Revalidate hydration.

## Boundaries & Constraints

**Always:**
- Use `~/.flashcard-master/data.sqlite` as the single canonical database path across `@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/cli`, and `@flashcard-master/web`.
- If legacy `~/.flashcard-master/flashcards.db` exists and `data.sqlite` does not, automatically copy or rename the legacy file to `data.sqlite` during initialization to preserve user data.
- Ensure SQLite WAL mode is enabled on all database connections.
- Persist `selectedDocIds`, `selectedSourceIds`, `expandedSources`, and `sourceFilterQuery` in `generateStore.svelte.ts` under `localStorage` (`fc_generation_settings` / `fc_generation_selections`).
- Ensure `DashboardView.svelte` uses cached metrics from `localStorage` on initial mount to eliminate empty-state flashing while refreshing telemetry in the background.

**Ask First:**
- If both `flashcards.db` and `data.sqlite` exist simultaneously with different byte sizes or conflicting row counts.

**Never:**
- Never wipe or overwrite existing user SQLite databases during path resolution or migrations.
- Never crash or block browser rendering if `localStorage` is disabled or throws a `QuotaExceededError`.
- Never store sensitive secrets or provider API keys in unencrypted query parameters.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Canonical DB resolution | CLI `createAppContext()` without `--db` | Connects to `~/.flashcard-master/data.sqlite` | Logs path if verbose |
| Legacy DB migration | `flashcards.db` exists, `data.sqlite` missing | Copies `flashcards.db` to `data.sqlite`, opens `data.sqlite` | Warns if copy fails, falls back safely |
| Studio reload selection retention | User selects 3 documents, hits F5 | Page reloads; all 3 documents remain checked and source accordion stays expanded | Ignores invalid/deleted IDs gracefully |
| Dashboard reload without flashing | User refreshes dashboard tab | Renders previous cached KPI metrics instantly, updates in background | Falls back to skeleton if no cache |
| Private browsing / disabled storage | Browser blocks `localStorage` access | Store defaults to in-memory state; generation functions normally | Catches `SecurityError` silently |

</frozen-after-approval>

## Code Map

- `packages/cli/src/app.ts` -- Update `getDefaultDbPath()` to point to `~/.flashcard-master/data.sqlite` or import `getDefaultDatabasePath()` from `@flashcard-master/core`.
- `packages/core/src/storage/db.ts` -- In `getDefaultDatabasePath()`, detect if `flashcards.db` exists while `data.sqlite` is absent, and perform safe legacy copy.
- `packages/web/client/src/stores/generateStore.svelte.ts` -- Expand `PersistedSettings` interface and persistence functions to save and load `selectedDocIds`, `selectedSourceIds`, `expandedSources`, and `sourceFilterQuery`.
- `packages/web/client/src/views/DashboardView.svelte` -- Add SWR caching for `DashboardStats` using `localStorage` to eliminate blank/spinner flashes on reload.
- `packages/web/test/client-stores.test.ts` -- Add unit tests verifying selection persistence, serialization, and graceful error handling on storage read/write.
- `packages/cli/test/app.test.ts` -- Add verification that CLI context resolves canonical `data.sqlite`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/db.ts` -- Unify database path resolution and add non-destructive legacy `flashcards.db` migration helper.
- [x] `packages/cli/src/app.ts` -- Update CLI app context to use canonical `getDefaultDatabasePath()` from `@flashcard-master/core`.
- [x] `packages/web/client/src/stores/generateStore.svelte.ts` -- Add `selectedDocIds`, `selectedSourceIds`, `expandedSources`, and `sourceFilterQuery` to `localStorage` persistence.
- [x] `packages/web/client/src/views/DashboardView.svelte` -- Implement SWR telemetry caching with `localStorage` so reloading renders cached stats immediately.
- [x] `packages/web/test/client-stores.test.ts` -- Unit test store persistence and reload restoration across mock storage lifecycles.
- [x] `packages/cli/test/app.test.ts` -- Verify CLI database initialization and canonical file path consistency.

**Acceptance Criteria:**
- Given a system with only `~/.flashcard-master/flashcards.db`, when the application starts, it migrates data to `~/.flashcard-master/data.sqlite` without losing sources or cards.
- Given a user who selected documents and expanded sources in Generate Studio, when they reload the browser, all selections and accordion states are restored.
- Given a user on the Dashboard, when they click Refresh or press F5, the dashboard displays cached KPIs immediately and updates seamlessly.
- Given all CLI and Web server commands, they all read and write to the same canonical database file.

## Design Notes

```ts
// LocalStorage Selections Schema in generateStore.svelte.ts
const SELECTION_STORAGE_KEY = 'fc_generation_selections';

interface PersistedSelections {
  selectedDocIds: Record<string, boolean>;
  selectedSourceIds: string[];
  expandedSources: Record<string, boolean>;
  sourceFilterQuery: Record<string, string>;
}
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: all core tests pass including database path resolution.
- `npm test -w @flashcard-master/cli` -- expected: all CLI tests pass with canonical database client.
- `npm test -w @flashcard-master/web` -- expected: web client store tests pass verifying persistence across reloads.
- `npm run typecheck` -- expected: clean TypeScript compilation with zero errors across monorepo.

## Suggested Review Order

**Database Path Unification & Safe Migration**

- Atomic legacy copy with temporary staging and sidecar migration
  [`db.ts:113`](../../packages/core/src/storage/db.ts#L113)

- CLI context unified onto core default database path
  [`app.ts:77`](../../packages/cli/src/app.ts#L77)

**Client Selection Persistence & Reload Retention**

- Store selections schema, defensive hydration, and safe storage helpers
  [`generateStore.svelte.ts:45`](../../packages/web/client/src/stores/generateStore.svelte.ts#L45)

- Generate Studio reactive auto-save and dead ID pruning on mount
  [`GenerateStudio.svelte:49`](../../packages/web/client/src/views/GenerateStudio.svelte#L49)

**Dashboard Telemetry SWR Caching**

- Extracted cache storage helpers for immediate mount rendering
  [`dashboard-cache.ts:1`](../../packages/web/client/src/lib/dashboard-cache.ts#L1)

- Dashboard view SWR mount loading without empty-state flashing
  [`DashboardView.svelte:33`](../../packages/web/client/src/views/DashboardView.svelte#L33)

**Verification & Test Suites**

- Universal client store tests covering reload persistence, error tolerance, and SWR caching
  [`client-stores.test.ts:112`](../../packages/web/test/client-stores.test.ts#L112)

- Core database path resolution, atomic migration, and sidecar tests
  [`db.test.ts:245`](../../packages/core/test/db.test.ts#L245)

- Isolated CLI database path and context verification
  [`app.test.ts:1`](../../packages/cli/test/app.test.ts#L1)

