---
title: 'Progressive SSE Streaming & Token Limit Retention'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: 'd6f6d073125d6ceb319e727941f78ff2272232af'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-16-context.md
  - _bmad-output/specs/spec-structured-responses/SPEC.md
  - _bmad-output/specs/spec-structured-responses/architecture-diagrams.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Flashcard generation in worker threads currently buffers cards per document and drops enriched metadata (`keywords`, `sourceLocator`, `citation`) during worker IPC and SQLite persistence. Furthermore, if an LLM reaches max output tokens, the abrupt truncation causes `JSON.parse` failures that discard all completed cards and fail the entire job.

**Approach:** Update `CardGenerationService`, worker threads, and the SSE streaming pipeline to stream completed cards incrementally into Task Center via `card_created` SSE events, properly persist `keywords` and `sourceLocator` to SQLite, and implement resilient partial JSON recovery so that token limit cutoffs preserve all completed cards with a user-facing warning notification and `completed_with_warnings` job status.

## Boundaries & Constraints

**Always:**
- Stream validated flashcards incrementally as they are created and committed, emitting `card_created` SSE events to connected clients.
- Forward and persist `keywords` (string array) and `sourceLocator` (string) through worker IPC (`GeneratedCardDraftPayload`), `WorkerExecutor`, and `cardRepo.create()`.
- Recover and preserve all valid flashcard objects completed before an LLM output truncation occurs, rather than throwing unhandled errors or discarding output.
- When partial output is retained due to token cutoff, log a `level: "warn"` entry and set final job status to `completed_with_warnings`.
- Maintain zero external runtime sidecars or microservices (pure TypeScript monorepo).
- Preserve existing worker concurrency limits and SQLite serialization guarantees (AD-19 custodian pattern).

**Ask First:**
- Modifying `JobStatus` enum or changing existing SSE event formats.

**Never:**
- Discard completed cards when a subsequent chunk or document hits a token limit.
- Re-introduce legacy string regex cleaners into the happy path.
- Block the main event loop during worker IPC streaming.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Incremental Card Stream | Generation job producing 5 cards across chunks | Each card is committed to SQLite and emitted over SSE `card_created` as generated | Network disconnects handled by SSE reconnect handler |
| Token Cutoff During Array | Truncated JSON array: `{"cards": [{...}, {...}, {"question": "incomplete` | Parser recovers 2 completed cards; commits both to SQLite; logs warning | Emits `level: "warn"` log; job marks `completed_with_warnings` |
| Token Cutoff Root Array | Truncated JSON root array: `[{...}, {...}, {"quest` | Parser recovers 2 completed cards; commits both to SQLite; logs warning | Emits `level: "warn"` log; job marks `completed_with_warnings` |
| Complete Token Exhaustion | Truncated JSON with 0 completed cards: `{"cards": [{"ques` | Throws `LLMResponseParsingError` since no valid cards could be recovered | Caught by worker, logs error, proceeds to next chunk/doc |
| Enriched Fields Persistence | Card with `keywords: ["sqlite", "wal"]`, `sourceLocator: "para 4"` | Flashcard stored in SQLite with matching `keywords` JSON array and `source_locator` string | Falls back to `[]` and `""` if omitted |
| Task Center Warning Badge | Job finishes with `completed_with_warnings` | Task Center renders amber warning badge with number of preserved cards | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/services/card-generation-service.ts` -- Populate `keywords`, `sourceLocator`, and `citation` on `GeneratedCardDraft` instances; support progressive `onCardGenerated` or per-chunk delivery.
- `packages/adapters/src/llm/types.ts` -- In `parseStructuredCardDrafts`, add truncated JSON array recovery to parse all valid card objects completed before an output token cutoff.
- `packages/web/src/workers/task-types.ts` -- Extend `GeneratedCardDraftPayload` with `keywords`, `sourceLocator`, and `citation`.
- `packages/web/src/workers/task-worker.ts` -- Pass enriched fields in `COMMIT_CARDS`, commit cards progressively per chunk, and log `warn` details on token limit cutoffs.
- `packages/web/src/workers/worker-executor.ts` -- Forward `keywords` and `sourceLocator` into `cardRepo.create()`, invoke `ctx.emitCard?.(created)` on commit.
- `packages/web/src/jobs/job-manager.ts` -- Add `emitCard` callback to `JobExecutionContext` and emit `card_created` event.
- `packages/web/src/server.ts` -- Broadcast `card_created` SSE event over `/api/jobs/stream` and `/api/jobs/:id/logs/stream`.
- `packages/web/client/src/lib/types.ts` -- Add `keywords?: string[]` and `sourceLocator?: string` to client `Flashcard` interface.
- `packages/web/client/src/stores/taskStore.svelte.ts` -- Handle `card_created` SSE event in client store, manage `streamedCards` state, and handle `completed_with_warnings` toast/badge.
- `packages/web/client/src/components/StepAccordion.svelte` -- Display streamed cards with keyword pills, and render amber warning badge for `completed_with_warnings`.
- `packages/web/client/src/views/GenerateStudio.svelte` -- Display partial completion warning when generation finishes with warnings.
- `packages/web/test/worker-executor.test.ts` -- Test progressive card emission, enriched fields persistence, and token limit retention.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/card-generation-service.ts` -- Populate `keywords`, `sourceLocator`, and `citation` on `GeneratedCardDraft` instances in `generateFromDocument`.
- [x] `packages/adapters/src/llm/types.ts` -- Add truncated JSON recovery in `parseStructuredCardDrafts` to extract completed cards before a token cutoff.
- [x] `packages/web/src/workers/task-types.ts` -- Add `keywords?: string[]`, `sourceLocator?: string`, and `citation?: string` to `GeneratedCardDraftPayload`.
- [x] `packages/web/src/workers/worker-executor.ts` -- Pass `keywords` and `sourceLocator` to `cardRepo.create()`, call `ctx.emitCard?.(created)` on each card committed.
- [x] `packages/web/src/jobs/job-manager.ts` -- Add `emitCard` to `JobExecutionContext` and emit `card_created` event on `JobManager`.
- [x] `packages/web/src/server.ts` -- Wire `card_created` event into `/api/jobs/stream` and `/api/jobs/:id/logs/stream`.
- [x] `packages/web/src/workers/task-worker.ts` -- Pass enriched card fields in `COMMIT_CARDS`, commit progressively, and emit `warn` log on token cutoffs.
- [x] `packages/web/client/src/lib/types.ts` -- Update client `Flashcard` interface with `keywords` and `sourceLocator`.
- [x] `packages/web/client/src/stores/taskStore.svelte.ts` -- Subscribe to `card_created` events, maintain `streamedCards`, and support warning notifications.
- [x] `packages/web/client/src/components/StepAccordion.svelte` & `GenerateStudio.svelte` -- Render streamed card preview with keyword pills and amber warning badge for `completed_with_warnings`.
- [x] `packages/web/test/` -- Add automated unit & integration tests covering progressive SSE streaming, enriched fields persistence, and partial card retention under token cutoff.

**Acceptance Criteria:**
- Given a generation task running in a worker thread, when flashcards are generated, each card is committed to SQLite with its `keywords` and `sourceLocator` intact.
- Given active SSE clients listening on `/api/jobs/stream` or `/api/jobs/:id/logs/stream`, when a card is committed, a `card_created` SSE event containing the card and jobId is delivered in real time.
- Given an LLM response truncated midway through card generation due to token limits, when `parseStructuredCardDrafts` parses the payload, then all completed cards preceding the cutoff are recovered and persisted to SQLite.
- Given a generation job where token limit cutoff occurred, when the job finishes, then the job status is set to `completed_with_warnings`, a warning log with details is recorded, and the Task Center UI renders an amber warning notification indicating partial retention.
- All monorepo tests pass cleanly (`npm test -w @flashcard-master/core`, `npm test -w @flashcard-master/adapters`, `npm test -w @flashcard-master/web`).

## Spec Change Log

_None._

## Design Notes

1. **Truncated JSON Recovery Mechanism:**
   When an LLM hits `max_tokens`, it cuts off mid-string or mid-property (e.g. `{"cards": [{"q": ...}, {"q": ...`). `parseStructuredCardDrafts` catches `SyntaxError`, finds the last `}` that forms a complete card object, appends `]}` or `]`, parses the recovered JSON array, marks the result with a partial flag, and returns the valid cards.
2. **Progressive Delivery vs. Custodian Safety (AD-19):**
   Worker threads do not write directly to SQLite; they post `COMMIT_CARDS` to the main thread. By committing progressively per chunk, SQLite custodian writes remain serialized and safe, while SSE clients receive `card_created` events within milliseconds of generation.
3. **Graceful Degradation:**
   If 0 cards were generated before the cutoff, the error is handled as a standard generation error. If >=1 card was completed, those cards are committed to SQLite, a warning is logged, and the job completes with `completed_with_warnings`.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter tests pass, including truncated JSON recovery tests.
- `npm test -w @flashcard-master/core` -- expected: All core tests pass, including `CardGenerationService` enriched fields tests.
- `npm test -w @flashcard-master/web` -- expected: All web tests pass, including worker executor, SSE streaming, and partial retention tests.
- `npm run typecheck` -- expected: Monorepo compiles cleanly with 0 errors.

## Suggested Review Order

1. **Core Service & Adapters Recovery:**
   - [`packages/core/src/services/card-generation-service.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/core/src/services/card-generation-service.ts): Inspect `onCardGenerated` and field mapping for `keywords`, `sourceLocator`, and `citation`.
   - [`packages/adapters/src/llm/types.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/types.ts): Inspect `tryRecoverTruncatedJson` and `parseStructuredCardDrafts` recovery logic.
   - [`packages/adapters/test/llm-adapters.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/test/llm-adapters.test.ts): Inspect truncated JSON recovery tests.

2. **Worker Thread Pipeline & Real-Time SSE Stream:**
   - [`packages/web/src/workers/task-types.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/workers/task-types.ts): Inspect `GeneratedCardDraftPayload` extensions.
   - [`packages/web/src/workers/task-worker.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/workers/task-worker.ts): Inspect progressive `COMMIT_CARDS` and token limit warning emission.
   - [`packages/web/src/workers/worker-executor.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/workers/worker-executor.ts): Inspect `keywords` & `sourceLocator` persistence and `ctx.emitCard?.(created)`.
   - [`packages/web/src/jobs/job-manager.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/jobs/job-manager.ts): Inspect `emitCard` callback and `card_created` event broadcast.
   - [`packages/web/src/server.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/src/server.ts): Inspect SSE handlers for `card_created` across both `/api/jobs/stream` and `/api/jobs/:id/logs/stream`.

3. **Web Client & Task Center UI:**
   - [`packages/web/client/src/lib/types.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/lib/types.ts): Inspect `keywords` and `sourceLocator` on `Flashcard`.
   - [`packages/web/client/src/stores/taskStore.svelte.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/stores/taskStore.svelte.ts): Inspect `card_created` event handling and `streamedCards` state.
   - [`packages/web/client/src/components/StepAccordion.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/components/StepAccordion.svelte): Inspect progressive card streaming list and amber warning badge for `completed_with_warnings`.
   - [`packages/web/client/src/views/GenerateStudio.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/views/GenerateStudio.svelte): Inspect partial retention toast and completion handling.

4. **Web Verification Suite:**
   - [`packages/web/test/worker-executor.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/test/worker-executor.test.ts): Inspect progressive card emission test and SQLite persistence verification.
   - [`packages/web/test/client-stores.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/test/client-stores.test.ts): Inspect `card_created` event handling and warning completion tests.
