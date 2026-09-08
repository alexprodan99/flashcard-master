---
title: 'SQLite Job & Log Schema, Concurrency Manager & CLI Flags'
type: 'feature'
created: '2026-09-08'
status: 'done'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Long-running operations (card generation, bulk sync, exports) currently execute synchronously in HTTP request handlers without a persistent job queue, structured step logging, concurrency limits, or cancellation support, causing HTTP hangs and risking `SQLITE_BUSY` database write contention.

**Approach:** 
1. Define `Job` and `JobLog` domain models and Zod schemas in `@flashcard-master/core`.
2. Add `jobs` and `job_logs` tables and indexes to SQLite schema and migrations in `@flashcard-master/core`.
3. Implement `JobRepository` with CRUD, step log appending, history pruning, and clearing.
4. Implement `JobManager` in `@flashcard-master/web` with bounded concurrency pools (generation: 3, sync: 2, export: 2), FIFO queueing, event broadcasting, and cancellation.
5. Add CLI flags (`--max-generation-workers`, `--max-sync-workers`, `--max-export-workers`) in `@flashcard-master/cli` passing concurrency settings to `WebServer`.

## Boundaries & Constraints

**Always:**
- Keep all SQLite writes strictly on the main thread via `JobRepository`.
- Enforce bounded concurrency limits per pool (generation, sync, export).
- Maintain audit logs in `job_logs` with step numbers, titles, levels, and timestamps.
- Support cancellation via `AbortController` and `AbortSignal`.

**Never:**
- Never allow uncoordinated direct SQLite write operations from multiple threads or workers.
- Never crash a job batch when an individual step fails; record warnings/errors and allow partial success.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enqueue Job | `type: "generation"`, 4 tasks enqueued | First 2 run (limit=2), next 2 sit in FIFO queue | Overflow queued safely |
| Step Logging | `ctx.log(1, "Title", "info", "Msg")` | Structured log row inserted into `job_logs` | Cascaded on job delete |
| Job Cancellation | `jobManager.cancelJob(id)` | Active job aborted via `AbortSignal`, queued job removed | Status marked `cancelled` |
| History Pruning | `pruneJobs({ keepLastN: 2 })` | Preserves newest 2 completed jobs, deletes older | Active jobs untouched |
| Clear History | `clearHistory()` | Deletes completed, failed, cancelled jobs | Running & queued preserved |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Added `JobTypeSchema`, `JobStatusSchema`, `JobSchema`, `JobLogLevelSchema`, `JobLogSchema`.
- `packages/core/src/storage/schema.sql` -- Added `jobs` and `job_logs` table DDL and indices.
- `packages/core/src/storage/db.ts` -- Added `jobs` and `job_logs` to `SCHEMA_SQL` and `runMigrations(db)`.
- `packages/core/src/storage/job-repository.ts` -- Implemented `JobRepository` (create, getById, list, update, appendLog, getLogs, prune, clearHistory, delete).
- `packages/core/test/job-repository.test.ts` -- Comprehensive unit test suite for `JobRepository` (7 passing tests).
- `packages/web/src/jobs/job-manager.ts` -- Implemented `JobManager` with concurrency pools, event emitter, queue dispatch, and cancellation.
- `packages/web/src/server.ts` -- Added `jobRepo`, `jobManager`, and `concurrency` options to `WebServerOptions`.
- `packages/web/test/job-manager.test.ts` -- Comprehensive concurrency and lifecycle test suite (8 passing tests).
- `packages/cli/src/app.ts` -- Added `jobRepo` to `AppContext` and initialized in `createAppContext`.
- `packages/cli/src/cli.ts` -- Added `--max-generation-workers`, `--max-sync-workers`, and `--max-export-workers` CLI flags to `serve` command.

## Tasks & Acceptance

**Execution:**
- [x] Implement `Job` & `JobLog` domain models and schemas.
- [x] Create SQLite schema migrations for `jobs` and `job_logs` tables and indexes.
- [x] Implement `JobRepository` with CRUD and log storage methods.
- [x] Create `JobManager` with concurrency pools (generation: 3, sync: 2, export: 2) and event bus.
- [x] Add CLI concurrency flags to `flashcard-master serve`.
- [x] Verify full test suites pass across `core`, `adapters`, `cli`, and `web` with 100% success.
