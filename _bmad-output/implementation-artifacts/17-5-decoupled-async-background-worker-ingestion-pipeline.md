---
title: 'Decoupled Async Background Worker Ingestion Pipeline'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '130fd92a0f145c228d6a4d94c6986fee3abd4206'
review_loop_iteration: 0
context:
  - 'packages/web/src/server.ts'
  - 'packages/web/src/workers/task-types.ts'
  - 'packages/web/src/workers/task-worker.ts'
  - 'packages/web/src/workers/worker-executor.ts'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Parsing multi-page PDF (`unpdf`) and Word (`mammoth`) documents is CPU- and memory-intensive. Synchronous or inline main-thread document extraction during uploads and source synchronization freezes the Node.js event loop, stalling HTTP responses, SSE progress broadcasts, and client interactions while risking unbounded heap growth and process OOM crashes.

**Approach:** Decouple file upload from extraction with a fast (<50ms) disk write acknowledgment returning the uploaded file path, expand allowed upload extensions to include `.pdf` and `.docx` while rejecting legacy binary `.doc`, and offload extraction and slicing into the async `WorkerExecutor` pool with worker thread heap limits (`resourceLimits: { maxOldGenerationSizeMb: 512 }`), execution timeouts, cancellation via `AbortSignal`, and real-time SSE progress streaming to Task Center.

## Boundaries & Constraints

**Always:**
- `POST /api/sources/upload` must write uploaded files to disk in `<50ms` and immediately return `{ path, filename, size }`.
- Allowed upload extensions must be `.md`, `.markdown`, `.txt`, `.pdf`, and `.docx`.
- Legacy pre-2007 binary `.doc` files (identified by `.doc` extension or `0xD0CF11E0` OLE magic bytes) must be rejected upfront with a clear 400 error.
- Background worker execution must run in isolated `node:worker_threads` with `resourceLimits` (default `maxOldGenerationSizeMb: 512`) to protect the main process from memory spikes.
- Background worker tasks must enforce configurable execution timeouts (default 60 minutes / 3,600,000ms, with dynamic document-scaled generation timeouts e.g. up to 180s per document, configurable via `--task-timeout <minutes>` or 0 to disable) and clean `AbortSignal` cancellation, terminating the worker thread without leaking resources.
- Worker threads must stream incremental progress events (`STEP_PROGRESS`, `STEP_LOG`) via IPC, which `JobManager` broadcasts over SSE to Task Center.
- SQLite remains strictly custodial: worker threads perform CPU-intensive parsing and slicing, then submit extracted subdocument batches via `COMMIT_SYNC_RESULT` to the main thread `WorkerExecutor` for transactional database persistence.
- Slicing configurations passed during sync must be forwarded to the slicing engine.

**Ask First:**
- Lowering worker thread heap limits below 256MB or altering database schema.

**Never:**
- Never block the Node.js main thread event loop during PDF or DOCX parsing.
- Never crash the main server process when a worker thread exceeds memory limits, throws parsing errors, or encounters corrupted/scanned zero-text files.
- Never write extracted document text into SQLite directly from a worker thread.
- Never add external native C++ or CLI binary dependencies (Poppler, Python, LibreOffice).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload PDF Document | `POST /api/sources/upload` with `Handbook.pdf` | File written to `localFilesDir` in <50ms; HTTP 200 `{ path, filename, size }` | N/A |
| Upload DOCX Document | `POST /api/sources/upload` with `Report.docx` | File written to `localFilesDir` in <50ms; HTTP 200 `{ path, filename, size }` | N/A |
| Upload Legacy .doc File | `POST /api/sources/upload` with `ancient.doc` | HTTP 400 rejection stating legacy .doc is unsupported and suggesting .docx or .pdf | Rejection with 400 status and descriptive message |
| Upload OLE Binary Spoofed as .docx | `POST /api/sources/upload` with `spoofed.docx` containing `0xD0CF11E0` | HTTP 400 rejection detecting OLE magic bytes before saving | Rejection with 400 status |
| Background Sync of Local PDF/DOCX | `POST /api/sync/:id` for local source | HTTP 202 `{ jobId, status: "queued" }`; worker parses file, streams page progress over SSE, commits subdocuments | Worker catches format errors; logs warning, completes job without server crash |
| Worker Execution Timeout | Sync task runs longer than timeout limit | Worker thread terminated; job marked failed with timeout message; resources cleaned up | AbortError / TimeoutError logged to job logs |
| User Cancellation via Task Center | Client sends `POST /api/jobs/:id/cancel` | `AbortSignal` fires; worker terminates; job status updated to `cancelled` | Clean IPC teardown |
| Worker OOM / Memory Ceiling | Malicious or huge file exceeding 512MB heap | Worker thread throws / exits with code; main process catches error, marks job failed, server stays healthy | Process remains online; error reported in Task Center |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` (lines 2526-2548, 2085-2164):
  - Expand `ALLOWED_EXTS` in `/api/sources/upload` to include `.pdf` and `.docx`.
  - Add upfront rejection for `.doc` extension and `0xD0CF11E0` OLE magic bytes.
  - In `POST /api/sync/:id` and `POST /api/sync`, parse optional `{ slicing?: DocumentSlicingOptions }` body/query and forward to `jobManager.enqueueJob`.
- `packages/web/src/workers/task-types.ts` (lines 42-60, 65-160):
  - Extend `SyncTaskPayload` with `slicing?: DocumentSlicingOptions; timeoutMs?: number;`.
  - Extend `COMMIT_SYNC_RESULT` outbound message with `documents?: DiscoveredDocument[]; slicing?: DocumentSlicingOptions;`.
- `packages/web/src/workers/task-worker.ts` (lines 314-405):
  - In `executeSync`: For `local` sources, execute document parsing in worker thread via `LocalFileStrategy`.
  - Emit real-time `STEP_PROGRESS` and `STEP_LOG` during page extraction and slicing.
  - Apply `DocumentSlicingEngine` subdocument slicing if slicing options are provided.
  - Submit extracted documents via `COMMIT_SYNC_RESULT` to main thread.
- `packages/web/src/workers/worker-executor.ts` (lines 60-115, 225-248):
  - Configure `resourceLimits: { maxOldGenerationSizeMb: 512 }` when instantiating `Worker`.
  - Add execution timeout guard with automatic `worker.terminate()` and error rejection.
  - In `COMMIT_SYNC_RESULT`: Custodial upsert of `msg.documents` into SQLite `documentRepo.upsertBatch()` and `syncRepo.upsert()`.
- `packages/web/test/server.test.ts` & `packages/web/test/worker-executor.test.ts`:
  - Unit and integration tests covering upload validation, worker thread heap limits, cancellation, and async sync task pipeline.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/server.ts` -- Expand file upload validation and sync route slicing payloads -- Enables fast <50ms upload of .pdf and .docx with upfront legacy .doc rejection.
- [x] `packages/web/src/workers/task-types.ts` -- Update IPC message types for sync slicing and custodial document commits -- Defines type-safe IPC contracts for background extraction.
- [x] `packages/web/src/workers/task-worker.ts` -- Implement in-worker document extraction, progress streaming, and slicing -- Offloads CPU-intensive parsing to background worker thread.
- [x] `packages/web/src/workers/worker-executor.ts` -- Add resourceLimits, timeout enforcement, and custodial document persistence -- Protects server from OOM and freezes while persisting subdocuments to SQLite.
- [x] `packages/web/test/server.test.ts` & `packages/web/test/worker-executor.test.ts` -- Add comprehensive test coverage for upload endpoints and async worker extraction -- Guarantees resilience against timeouts, OOM, and invalid formats.

**Acceptance Criteria:**
- Given a user uploading a `.pdf` or `.docx` file via `POST /api/sources/upload`, when received, then the file is stored to disk and an HTTP 200 response with `{ path, filename, size }` is returned in under 50ms.
- Given an upload with `.doc` extension or `0xD0CF11E0` OLE magic bytes, when received, then the server rejects it immediately with HTTP 400 without saving to disk.
- Given a local data source pointing to a PDF or Word document, when synchronized via `POST /api/sync/:id`, then extraction executes inside a background worker thread with `resourceLimits` (max 512MB heap), streaming progress events via SSE to Task Center.
- Given a worker task that exceeds its timeout or is cancelled via `POST /api/jobs/:id/cancel`, then the worker thread terminates cleanly and the job status transitions to `failed` or `cancelled`.
- Given sliced subdocuments extracted by the worker, when extraction finishes, then they are transactionally persisted into the SQLite `documents` table by the custodial main thread.

## Spec Change Log

## Design Notes

### Worker Resource Limits & Timeout Protection
```ts
const MAX_WORKER_HEAP_MB = 512;
const DEFAULT_TASK_TIMEOUT_MS = 3_600_000; // 60 minutes default (configurable, 0 to disable)

worker = new Worker(this.workerScriptPath, {
  execArgv,
  resourceLimits: {
    maxOldGenerationSizeMb: MAX_WORKER_HEAP_MB,
  },
});
```

### Custodial Document Ingestion IPC Pattern
1. Worker extracts and slices documents in background thread:
   `postMessage({ type: "COMMIT_SYNC_RESULT", jobId, sourceId, stepNumber, documents: slicedDocs })`
2. Main thread receives IPC message and writes to SQLite:
   `this.options.documentRepo.upsertBatch(msg.documents)`
3. Main thread replies to worker:
   `worker.postMessage({ action: "COMMIT_SYNC_ACK", jobId, sourceId, newCount, totalFetched })`

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: All web server, worker, and API tests pass.
- `npm test` -- expected: All monorepo test suites pass with 0 regressions.
- `npm run lint` -- expected: Zero lint errors across the monorepo.
- `npm run typecheck` -- expected: Zero TypeScript type errors across the monorepo.

## Suggested Review Order

**HTTP Upload Validation & Sync Dispatch**

- Fast non-blocking upload endpoint with upfront legacy .doc and OLE magic byte rejection
  [`server.ts:2550`](../../packages/web/src/server.ts#L2550)

- Single and bulk sync routes parsing slicing options and enqueuing background tasks
  [`server.ts:2088`](../../packages/web/src/server.ts#L2088)

**Worker IPC Contracts & Thread Execution**

- Type-safe IPC payloads for sync tasks and custodial commit messages
  [`task-types.ts:42`](../../packages/web/src/workers/task-types.ts#L42)

- In-worker local document parsing, page extraction, and slicing engine integration
  [`task-worker.ts:336`](../../packages/web/src/workers/task-worker.ts#L336)

- Resource limit heap isolation, configurable execution timeouts, and custodial persistence
  [`worker-executor.ts:108`](../../packages/web/src/workers/worker-executor.ts#L108)

**Test Suites & Verification**

- Unit and integration tests for upload validations and jobManager sync route forwarding
  [`server.test.ts:1420`](../../packages/web/test/server.test.ts#L1420)

- Real task-worker execution and custodial SQLite document persistence verification
  [`worker-executor.test.ts:440`](../../packages/web/test/worker-executor.test.ts#L440)

- Sequential test execution configuration avoiding Windows ephemeral port collisions
  [`vitest.config.ts:20`](../../packages/web/vitest.config.ts#L20)
