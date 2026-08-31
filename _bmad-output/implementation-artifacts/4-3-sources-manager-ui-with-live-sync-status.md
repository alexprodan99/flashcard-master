---
title: 'Story 4.3: Sources Manager UI with Live Sync Status'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: '38956afcd5cf4c4b7c870a36b7adda026617c409'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/implementation-artifacts/4-2-local-web-ui-dashboard-server-design-system-foundation.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users need an interactive web interface to manage their content ingestion pipeline — viewing registered data sources, adding new feeds/URLs/folders via modal forms, triggering live synchronization on demand, viewing incremental sync delta counts, and toggling source active status (FR-403, AD-7).

**Approach:** Implement `POST /api/sync/:id`, `POST /api/sync`, `PATCH /api/sources/:id` REST endpoints in `packages/web/src/server.ts`, and render a rich interactive Data Sources Manager tab in the embedded SPA with modal creation dialogs, live sync trigger buttons, status indicators, and deletion controls.

## Boundaries & Constraints

**Always:**
- Support adding sources across all three supported types: `rss`, `web`, `local`.
- Provide per-source and bulk sync trigger endpoints (`POST /api/sync/:id`, `POST /api/sync`) returning granular `SyncResult` counts.
- Render last synced timestamps and total items tracked per source.
- Provide responsive modals and UI feedback for loading, success, and error states.
- Run completely local with zero third-party cloud analytics.

**Ask First:**
- Adding recurring cron schedule configurations via UI (planned for automation enhancements).

**Never:**
- Allow unsanitized HTML injection from source names or URIs in the web UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sync Single Source | `POST /api/sync/src-123` | Triggers `IngestionService.syncSource()`, returns JSON result | 404 if source not found |
| Sync All Sources | `POST /api/sync` | Triggers `IngestionService.syncAllActive()`, returns array of results | Isolated per-source errors |
| Add Source Modal | Submits form with valid fields | Creates source, refreshes UI grid, displays confirmation | Displays validation errors |
| Toggle Active Status | `PATCH /api/sources/src-123` `{ isActive: false }` | Updates SQLite record, reflects updated toggle state | 404 if source not found |
| Delete Source | `DELETE /api/sources/src-123` | Deletes source record, removes from UI list | 404 if not found |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` -- Sync REST endpoints (`POST /api/sync`, `POST /api/sync/:id`, `PATCH /api/sources/:id`), updated SPA HTML/JS with Sources Manager tab and modal
- `packages/web/test/server.test.ts` -- Integration tests for sync endpoints and source status toggling

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/server.ts` -- Implement sync and patch endpoints (`POST /api/sync`, `POST /api/sync/:id`, `PATCH /api/sources/:id`)
- [x] `packages/web/src/server.ts` -- Implement interactive Sources Manager view in SPA (add modal, sync button, status badges, delete action)
- [x] `packages/web/test/server.test.ts` -- Unit and integration tests covering sync endpoints and source management

**Acceptance Criteria:**
- **Given** registered data sources
- **When** `POST /api/sync/:id` is called
- **Then** `IngestionService` synchronizes the source and returns delta counts.
- **Given** the web dashboard
- **When** the Data Sources tab is accessed
- **Then** all sources are listed with live sync actions, add modals, and status badges.

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: Web server integration tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Sources Manager UI & Sync Endpoints**

- REST endpoints for sync trigger (POST /api/sync, POST /api/sync/:id), update (PATCH /api/sources/:id), and interactive Data Sources UI
  [packages/web/src/server.ts#L330](../../packages/web/src/server.ts#L330)

**Integration Test Suite**

- Unit and integration tests validating single source sync, bulk sync, creation, and status patch
  [packages/web/test/server.test.ts#L1](../../packages/web/test/server.test.ts#L1)
