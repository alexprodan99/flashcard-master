---
title: 'Worker Thread Execution Engine & Task Pipeline'
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

**Problem:** Heavy tasks (multi-document LLM card synthesis, multi-source content syncing, format compilation/export) previously blocked the main Node.js event loop, and executing them asynchronously without an IPC architecture could risk database concurrency locks (`SQLITE_BUSY`).

**Approach:**
1. Establish a clear IPC message contract (`WorkerInboundMessage`, `WorkerOutboundMessage`) defining tasks, progress updates, step logs, card commit requests, and ACKs.
2. Implement isolated worker thread tasks (`packages/web/src/workers/task-worker.ts`) for card generation, sync, and export pipelines.
3. Implement `WorkerExecutor` (`packages/web/src/workers/worker-executor.ts`) on the main thread to serve as the sole SQLite custodian: receiving `COMMIT_CARDS` and `COMMIT_SYNC_RESULT` IPC messages, executing deduplication and database transactions on the main thread, and returning ACKs to the worker.
4. Support task cancellation by listening to `ctx.signal` (`AbortSignal`), posting `ABORT_TASK` messages, and terminating workers if necessary.
5. Export worker modules and integrate `WorkerExecutor` with `WebServer`.

## Boundaries & Constraints

**Always:**
- Keep all SQLite operations strictly on the main thread via `WorkerExecutor` (the Zero SQLite Lock Contention Invariant `AD-19`).
- Worker threads MUST communicate database mutations exclusively via IPC messages (`COMMIT_CARDS`, `COMMIT_SYNC_RESULT`).
- Handle task-level errors gracefully without crashing the worker or main server process.
- Support partial batch success: if a document fails in a multi-document generation job, log the failure and proceed to subsequent documents.

**Never:**
- Never import SQLite libraries (`better-sqlite3`) or access database files from worker threads.
- Never block the main thread event loop with CPU-bound card synthesis or document parsing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Card Generation Batch | `type: "generation"`, 2 documents | Worker prompts LLM, sends `COMMIT_CARDS` via IPC; main thread deduplicates & writes to SQLite | Individual doc error logged with `level: "error"`, subsequent docs processed |
| Source Sync Batch | `type: "sync_all"`, multiple sources | Worker sends `COMMIT_SYNC_RESULT` to main thread; main thread executes sync and returns ACK | Source fetch error recorded with `level: "warn"`, remaining sources processed |
| Document Export Task | `type: "export"`, format markdown/csv | Worker formats and packages export file in background thread | If invalid format or doc, `TASK_ERROR` returned |
| User Task Cancellation | `ctx.signal.abort()` triggered | Main thread sends `ABORT_TASK`, terminates worker thread, rejects with `AbortError` | Clean termination, status marked cancelled |
| Foreign Key Fallback | `COMMIT_CARDS` with non-existent `sourceId` | Main thread attempts write; on foreign key constraint, retries safely with `sourceId: null` | Cards are never lost due to missing source reference |

</frozen-after-approval>

## Code Map

- `packages/web/src/workers/task-types.ts` -- IPC message schemas, task payloads (`GenerationTaskPayload`, `SyncTaskPayload`, `ExportTaskPayload`), and message types (`STEP_PROGRESS`, `STEP_LOG`, `COMMIT_CARDS`, `COMMIT_CARDS_ACK`, etc.).
- `packages/web/src/workers/task-worker.ts` -- Worker thread task handler executing card generation, sync, and export pipelines with zero SQLite dependencies.
- `packages/web/src/workers/worker-executor.ts` -- Main thread execution manager and SQLite custodian, handling worker lifecycle, IPC message dispatch, card commits, deduplication, and cancellation.
- `packages/web/src/workers/index.ts` -- Public exports for worker types and executor.
- `packages/web/src/index.ts` -- Exported `workers/index.js`.
- `packages/web/src/server.ts` -- Wired `WorkerExecutor` into `WebServer` and `WebServerOptions`.
- `packages/web/test/worker-executor.test.ts` -- Unit and integration tests for `WorkerExecutor`, IPC message handling, card commits, cancellation, and real export execution (5 passing tests).

## Verification Evidence

- `npm run build:server -w @flashcard-master/web`: TypeScript compiles cleanly with zero errors.
- `npx vitest run test/worker-executor.test.ts`: 5/5 tests passing.
- `npm test`: Monorepo test suite passes completely (Core: 198, Web: 111, Adapters: 218, CLI: 12 = 539 tests passed).
- `npm run build`: All packages compile and build production assets without errors.
