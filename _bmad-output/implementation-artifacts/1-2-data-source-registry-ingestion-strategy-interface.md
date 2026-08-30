---
title: 'Story 1.2: Data Source Registry & Ingestion Strategy Interface'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'fb24ef6f457fcd3f91b083081e69156a801d0781'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/implementation-artifacts/1-1-monorepo-scaffolding-sqlite-database-initialization.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The system has an initialized SQLite schema but lacks a repository abstraction to manage data sources (`create`, `getById`, `list`, `update`, `delete`, `toggleActive`) and a centralized `StrategyRegistry` container to look up and register pluggable `IngestionStrategy` handlers.

**Approach:** Implement `DataSourceRepository` in `packages/core/src/storage/source-repository.ts` and `StrategyRegistry` in `packages/core/src/services/strategy-registry.ts`, complete with Zod validation, error handling, and unit test suites.

## Boundaries & Constraints

**Always:**
- Use parameterized queries in `better-sqlite3` to prevent SQL injection.
- Validate inputs and parse outputs using Zod schemas (`DataSourceSchema`, `DataSourceTypeSchema`).
- Store `tags` as JSON-serialized text in SQLite and deserialize to string arrays.
- Register strategies in `StrategyRegistry` by `DataSourceType` (`rss`, `web`, `local`).

**Ask First:**
- Adding pagination or cursor search parameters if simple filtering suffices for v1.

**Never:**
- Allow multiple strategies to be registered for the same `DataSourceType` without throwing a `DuplicateStrategyError` or explicit override flag.
- Expose raw SQL error messages directly to domain callers without structured domain exceptions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create Valid Source | `{ name: 'HN', type: 'rss', uri: 'https://news.ycombinator.com/rss' }` | Generates UUID, commits to DB, returns complete `DataSource` | N/A |
| Duplicate ID / Malformed Type | `{ type: 'invalid-type' }` | Rejects input before query execution | Throws Zod validation error |
| Get Non-Existent Source | `getById('non-existent-uuid')` | Returns `null` | Returns clean null (no throw) |
| Strategy Lookup Hit | `getStrategy('rss')` | Returns registered `IngestionStrategy` instance | N/A |
| Strategy Lookup Miss | `getStrategy('unregistered')` | Throws descriptive error | Throws `StrategyNotFoundError` |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Existing domain models for `DataSource`, `SyncState`
- `packages/core/src/ports/index.ts` -- Existing port definitions for `IngestionStrategy`
- `packages/core/src/storage/source-repository.ts` -- Implementation of `DataSourceRepository` CRUD methods
- `packages/core/src/services/strategy-registry.ts` -- Implementation of `StrategyRegistry` container
- `packages/core/src/index.ts` -- Re-export repositories and registry services
- `packages/core/test/source-repository.test.ts` -- Unit tests for `DataSourceRepository`
- `packages/core/test/strategy-registry.test.ts` -- Unit tests for `StrategyRegistry`

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/source-repository.ts` -- Implement `DataSourceRepository` class with `create`, `getById`, `list`, `update`, `delete`, `toggleActive`
- [x] `packages/core/src/services/strategy-registry.ts` -- Implement `StrategyRegistry` class with `register`, `getStrategy`, `hasStrategy`, `getAllTypes`
- [x] `packages/core/src/index.ts` -- Export `DataSourceRepository` and `StrategyRegistry`
- [x] `packages/core/test/source-repository.test.ts` -- Unit tests covering all CRUD operations, JSON tags serialization, and edge cases
- [x] `packages/core/test/strategy-registry.test.ts` -- Unit tests covering registration, lookup, duplicate checks, and missing strategy errors

**Acceptance Criteria:**
- **Given** a new data source payload
- **When** `DataSourceRepository.create()` is executed
- **Then** the record is inserted with unique UUID, default targetDeck "Default", and serialized tags.
- **Given** a registered strategy for type "rss"
- **When** `StrategyRegistry.getStrategy("rss")` is called
- **Then** the matching strategy instance is returned.
- **When** `StrategyRegistry.getStrategy("unknown")` is called
- **Then** a `StrategyNotFoundError` is thrown.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All source repository and strategy registry unit tests pass.
- `npm run build` -- expected: All packages compile cleanly without TypeScript errors.



## Suggested Review Order

**Data Source Repository**

- Repository CRUD methods with parameterization and Zod mapping
  [packages/core/src/storage/source-repository.ts#L30](../../packages/core/src/storage/source-repository.ts#L30)

- Repository unit tests covering CRUD, filters, and JSON serialization
  [packages/core/test/source-repository.test.ts#L1](../../packages/core/test/source-repository.test.ts#L1)

**Strategy Registry**

- Pluggable Strategy Pattern registry and custom domain errors
  [packages/core/src/services/strategy-registry.ts#L18](../../packages/core/src/services/strategy-registry.ts#L18)

- Registry unit tests verifying lookup, duplicate guards, and overrides
  [packages/core/test/strategy-registry.test.ts#L1](../../packages/core/test/strategy-registry.test.ts#L1)

**Exports**

- Main @flashcard-master/core barrel exports
  [packages/core/src/index.ts#L1](../../packages/core/src/index.ts#L1)
