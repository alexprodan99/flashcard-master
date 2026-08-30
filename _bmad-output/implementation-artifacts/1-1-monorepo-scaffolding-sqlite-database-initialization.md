---
title: 'Story 1.1: Monorepo Scaffolding & SQLite Database Initialization'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '4c4d9efba37ff40559d0a0d674fb789a4ada5c17'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-1-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `flashcard-master` currently lacks a project repository scaffold and local database persistence layer needed to support domain logic, strategies, CLI, and Web UI packages.

**Approach:** Initialize a TypeScript monorepo workspace (`packages/core`, `packages/adapters`, `packages/cli`, `packages/web`) and build the embedded SQLite database connection client with WAL mode and schema initialization in `packages/core`.

## Boundaries & Constraints

**Always:**
- Use npm workspaces in the root `package.json` referencing `"packages/*"`.
- Configure TypeScript strict mode (`"strict": true`) with modern ES2022/NodeNext modules.
- Initialize SQLite with `better-sqlite3` (or `sql.js` / native sqlite3 driver) configured for `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
- Ensure `packages/core` contains zero framework or UI dependencies.

**Ask First:**
- Adding external database ORM dependencies beyond lightweight query builders.

**Never:**
- Hardcode absolute user filesystem paths in database connection logic (use configurable `~/.flashcard-master/data.sqlite` or local relative path).
- Leak database driver instances directly to presentation layers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh DB Init | Missing DB directory | Creates directory `~/.flashcard-master/` and initializes `data.sqlite` with base schema tables | Returns connection instance with WAL mode confirmed |
| Existing DB | Pre-existing SQLite file | Reconnects without overwriting existing tables or dropping records | Verifies schema integrity; no-op migration |
| Read-only Path | Non-writable filesystem path | Throws descriptive initialization error | Catches and wraps in `DatabaseInitializationError` with path info |

</frozen-after-approval>

## Code Map

- `package.json` -- Monorepo root workspace configuration, scripts for build, test, and typecheck
- `tsconfig.json` -- Shared root TypeScript base configuration
- `packages/core/package.json` -- Core domain package definition (`@flashcard-master/core`)
- `packages/core/tsconfig.json` -- TypeScript config for core package
- `packages/core/src/index.ts` -- Main barrel export for `@flashcard-master/core`
- `packages/core/src/storage/db.ts` -- SQLite database connection factory and migration runner (WAL mode)
- `packages/core/src/storage/schema.sql` -- Base SQLite DDL for `data_sources`, `sync_state`, `flashcards`, `app_settings`
- `packages/core/test/db.test.ts` -- Unit and integration tests for SQLite initialization and table creation
- `packages/adapters/package.json` -- Adapters package definition (`@flashcard-master/adapters`)
- `packages/cli/package.json` -- CLI package definition (`@flashcard-master/cli`)
- `packages/web/package.json` -- Web package definition (`@flashcard-master/web`)

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- Create root monorepo config with npm workspaces and build/test scripts
- [x] `tsconfig.json` -- Create root TypeScript base compiler options
- [x] `packages/core/package.json` & `packages/core/tsconfig.json` -- Configure core package with dependencies (`better-sqlite3`, `zod`, `@types/better-sqlite3`, `vitest`)
- [x] `packages/core/src/storage/schema.sql` -- Define baseline SQL tables (`data_sources`, `sync_state`, `flashcards`, `app_settings`)
- [x] `packages/core/src/storage/db.ts` -- Implement `createDatabaseClient(dbPath?: string)` with WAL mode and schema runner
- [x] `packages/core/src/index.ts` -- Export storage client and types
- [x] `packages/core/test/db.test.ts` -- Unit tests validating in-memory and file-based SQLite database initialization
- [x] `packages/adapters/package.json`, `packages/cli/package.json`, `packages/web/package.json` -- Scaffold placeholder packages in the monorepo

**Acceptance Criteria:**
- **Given** an empty project directory
- **When** `npm install` and `npm run build` are executed
- **Then** all workspace packages resolve dependencies and compile without TypeScript errors.
- **Given** `createDatabaseClient(":memory:")` is invoked
- **When** table inspection queries are executed
- **Then** tables `data_sources`, `sync_state`, `flashcards`, and `app_settings` exist with correct column constraints.

## Verification

**Commands:**
- `npm run test` (or `npm test -w @flashcard-master/core`) -- expected: Tests pass with 100% table schema validation.
- `npm run build` -- expected: TypeScript compiles all workspace packages cleanly with exit code 0.





## Suggested Review Order

**Persistence & Database Layer**

- SQLite database client with WAL mode and schema initialization
  [packages/core/src/storage/db.ts#L47](../../packages/core/src/storage/db.ts#L47)

- Base DDL schema defining all core relational tables and indices
  [packages/core/src/storage/schema.sql#L1](../../packages/core/src/storage/schema.sql#L1)

**Domain Models & Ports**

- Core domain entities with Zod schema validation
  [packages/core/src/domain/models.ts#L1](../../packages/core/src/domain/models.ts#L1)

- IngestionStrategy, LLMProviderPort, and ExporterPort interfaces
  [packages/core/src/ports/index.ts#L1](../../packages/core/src/ports/index.ts#L1)

**Tests & Workspaces Scaffolding**

- SQLite initialization and idempotency test suite
  [packages/core/test/db.test.ts#L1](../../packages/core/test/db.test.ts#L1)

- Root monorepo configuration with npm workspaces
  [package.json#L1](../../package.json#L1)


### Review Findings

- [x] [Review][Patch] Standardize SQLite timestamp default format to ISO-8601 UTC (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) [packages/core/src/storage/schema.sql:10]
- [x] [Review][Patch] Add Zod schema parsing integration test for SQLite retrieved rows [packages/core/test/db.test.ts:50]

