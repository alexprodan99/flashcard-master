---
title: 'Real-Time Server-Sent Events (SSE) Streaming Endpoints & Step-by-Step Logging'
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

**Problem:** Generation, sync, and export operations previously either blocked HTTP responses or ran without real-time streaming progress, audit step logs, cancellation APIs, or history management.

**Approach:**
1. Implement Server-Sent Events (SSE) stream at `GET /api/jobs/stream` broadcasting real-time lifecycle transitions (`job_created`, `job_status`, `job_progress`, `job_log`, `job_completed`, `job_failed`, `job_cancelled`) with 15s keep-alive heartbeats and clean socket teardown.
2. Implement discrete step log SSE stream at `GET /api/jobs/:id/logs/stream` which replays historical logs on connection and streams live execution steps.
3. Implement `GET /api/jobs` (filtered list by status/type) and `GET /api/jobs/:id` (full details with logs).
4. Implement `POST /api/jobs/:id/cancel` for immediate cancellation of running or queued jobs.
5. Implement `DELETE /api/jobs/history` for purging completed, failed, and cancelled tasks, supporting `?keepLastN`.
6. Refactor `POST /api/generate`, `POST /api/sync`, `POST /api/sync/:id`, and `POST /api/documents/export` to enqueue background jobs asynchronously through `JobManager` returning `{ success: true, jobId, status }` in < 50ms (with fallback synchronous mode if `?sync=true` or without `JobManager`).

## Boundaries & Constraints

**Always:**
- Keep responses for background triggers under 50ms.
- Send proper SSE headers: `text/event-stream`, `no-cache`, `keep-alive`, and `X-Accel-Buffering: no`.
- Clean up EventEmitter listeners and keep-alive intervals when clients disconnect (`req.on("close")`).
- Maintain backward compatibility for existing synchronous endpoints via query param `?sync=true` or when `JobManager` is omitted.

**Never:**
- Never leak SSE listeners on client connection closure.
- Never crash when a nonexistent job is queried or cancelled (return standard 404 JSON).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SSE Global Stream | `GET /api/jobs/stream` | Streams `connected` handshake followed by live events | Clean listener removal on `close` |
| Job Logs Stream | `GET /api/jobs/:id/logs/stream` | Replays past logs, streams live logs for `:id` only | 404 if `:id` does not exist |
| Async Generate | `POST /api/generate` | Enqueues job in `JobManager`, returns HTTP 202 in < 50ms | 400 if no active sources |
| Async Sync | `POST /api/sync` or `POST /api/sync/:id` | Enqueues sync job, returns HTTP 202 in < 50ms | 404 if single source not found |
| Async Export | `POST /api/documents/export?async=true` | Enqueues export job, returns HTTP 202 in < 50ms | 404 if no documents match |
| Cancel Job | `POST /api/jobs/:id/cancel` | Aborts execution via `AbortSignal`, emits `job_cancelled` | 404 if job not found |
| Clear History | `DELETE /api/jobs/history` | Purges terminal jobs from SQLite and memory | 200 with `{ deletedCount }` |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts`:
  - Added SSE streams: `GET /api/jobs/stream`, `GET /api/jobs/:id/logs/stream`.
  - Added Job REST endpoints: `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/cancel`, `DELETE /api/jobs/history`.
  - Updated `POST /api/generate`, `POST /api/sync`, `POST /api/sync/:id`, and `POST /api/documents/export` for async job dispatch.
- `packages/web/test/jobs-routes.test.ts`:
  - Integration tests for all SSE streaming events, job cancellation, history purging, and async job response latency budgets (8 passing tests).

## Verification Evidence

- `npx vitest run test/jobs-routes.test.ts`: 8/8 tests pass.
- `npx vitest run`: All 66 tests in `@flashcard-master/web` pass.
- `npm test`: Monorepo test suite passes completely (494 tests passed, 0 failures).
- `npm run build`: Monorepo build succeeds across all four packages.
