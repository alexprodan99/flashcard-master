---
title: 'Story 1.6: Incremental Delta Sync & Hash Tracking'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'b4e7c9207fd777f4659be8dcec44071d9a68ea48'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/implementation-artifacts/1-5-local-document-directory-ingestion-strategy.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Re-syncing data sources without tracking previous sync history causes redundant processing of previously ingested articles and unmodified files, wasting compute and risking duplicate card generation.

**Approach:** Implement `SyncStateRepository` in `packages/core/src/storage/sync-state-repository.ts` and `IngestionService` in `packages/core/src/services/ingestion-service.ts` to coordinate `StrategyRegistry` with SQLite `sync_state` delta tracking, filtering out already-processed GUIDs and identical SHA-256 content hashes.

## Boundaries & Constraints

**Always:**
- Persist sync state (`source_id`, `last_synced_at`, `last_guid`, `content_hash`, `item_count`) in SQLite `sync_state` table.
- Filter out documents whose GUID or content hash matches prior sync state without re-generating clean text.
- Update `sync_state` inside a transaction upon successful sync.
- Support `syncSource(sourceId: string)` and `syncAllActive(): Promise<SyncResult[]>` with fault isolation (one failing source does not stop other sources from syncing - NFR-301).
- Return structured `SyncResult` containing `sourceId`, `newDocuments: CleanTextDocument[]`, `totalFetched`, `newCount`, and `skippedCount`.

**Ask First:**
- Adding persistent document-level hash history table if single `sync_state` row per source needs expansion for multi-file sources.

**Never:**
- Overwrite existing `sync_state` on a failed fetch attempt.
- Crash the application when an individual data source encounters an error.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First-Time Sync | Source with no prior `sync_state` | Ingests all documents, creates `sync_state`, returns all as new | N/A |
| Delta Sync (No Changes) | Source with identical hashes/GUIDs | Returns `newDocuments: []`, `skippedCount > 0`, updates `last_synced_at` | N/A |
| Delta Sync (New Items) | Feed with 2 new items + 3 seen items | Returns only the 2 new `CleanTextDocument` items | N/A |
| Source Fetch Error | Network error on source | Returns `SyncResult` with error message; other sources continue | Isolates error per source |
| Inactive Source | `source.isActive === false` | Skips fetching or throws `InactiveSourceError` | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `DataSource`, `SyncState`, `CleanTextDocument`
- `packages/core/src/ports/index.ts` -- `IngestionStrategy`
- `packages/core/src/storage/sync-state-repository.ts` -- `SyncStateRepository` CRUD operations
- `packages/core/src/services/ingestion-service.ts` -- `IngestionService` coordinating strategies and delta sync
- `packages/core/src/index.ts` -- Export `SyncStateRepository` and `IngestionService`
- `packages/core/test/sync-state-repository.test.ts` -- Unit tests for `SyncStateRepository`
- `packages/core/test/ingestion-service.test.ts` -- Unit and integration tests for `IngestionService`

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/sync-state-repository.ts` -- Implement `SyncStateRepository` (`get`, `upsert`, `delete`)
- [x] `packages/core/src/services/ingestion-service.ts` -- Implement `IngestionService` (`syncSource`, `syncAllActive`) with GUID and content-hash delta filtering
- [x] `packages/core/src/index.ts` -- Export `SyncStateRepository` and `IngestionService`
- [x] `packages/core/test/sync-state-repository.test.ts` -- Unit tests for `SyncStateRepository`
- [x] `packages/core/test/ingestion-service.test.ts` -- Unit tests verifying initial sync, delta deduplication, and fault isolation

**Acceptance Criteria:**
- **Given** an active data source with 3 documents
- **When** `IngestionService.syncSource(id)` is run for the first time
- **Then** all 3 documents are returned in `newDocuments` and `sync_state` is created in SQLite.
- **Given** a data source synced previously
- **When** `IngestionService.syncSource(id)` is run with no changes
- **Then** `newDocuments` is empty and `skippedCount` is 3.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All core unit and integration tests pass.
- `npm run build` -- expected: All packages compile cleanly without TypeScript errors.



## Suggested Review Order

**Sync State Persistence**

- SQLite sync_state upsert and cascade deletion repository
  [packages/core/src/storage/sync-state-repository.ts#L17](../../packages/core/src/storage/sync-state-repository.ts#L17)

- Sync state test suite
  [packages/core/test/sync-state-repository.test.ts#L1](../../packages/core/test/sync-state-repository.test.ts#L1)

**Ingestion Service**

- Core ingestion coordinator with GUID and content-hash delta deduplication
  [packages/core/src/services/ingestion-service.ts#L22](../../packages/core/src/services/ingestion-service.ts#L22)

- Ingestion service test suite covering initial sync, delta filtering, and fault isolation
  [packages/core/test/ingestion-service.test.ts#L1](../../packages/core/test/ingestion-service.test.ts#L1)

**Core Barrel Export**

- Package exports for core module
  [packages/core/src/index.ts#L1](../../packages/core/src/index.ts#L1)
