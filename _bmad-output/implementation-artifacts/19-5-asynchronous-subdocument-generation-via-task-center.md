---
title: 'Story 19.5: Asynchronous Subdocument Generation via Task Center'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: '4a60ce6ec0061bf77513d3cf0d5e8e11f4b73a4e'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
When generating flashcards for individual subdocuments (e.g. chapters from EPUBs or sliced sections of PDFs) from the Document Inspector (`SourceDocumentInspector.svelte`), the operation is currently dispatched as a blocking synchronous request (`sync: true`). This causes the user interface to freeze during AI synthesis, prevents the user from navigating or doing other work, and fails to leverage the existing background Task Center with real-time progress, token counts, and live logs. In addition, when generation finishes, document flashcard count badges in the inspector do not automatically refresh.

**Approach:**
1. **Asynchronous Dispatch**:
   - Update `handleSynthesizeSingle` in `SourceDocumentInspector.svelte` to dispatch non-blocking generation tasks to the background worker (`generateCards({ ..., sync: false })`).
   - Immediately close the configuration modal and display a feedback toast indicating that generation has been queued in the background.
2. **Task Center Integration**:
   - Automatically open the Task Center drawer to the **Active Tasks** tab (`taskStore.openDrawer('active')`) and expand the newly created job accordion (`taskStore.expandedJobIds[jobId] = true`) so users can watch live generation progress, token usage, and streamed cards in real time.
3. **Reactive Badge Updates**:
   - Subscribe or listen to task completion events in `SourceDocumentInspector.svelte` so that when a generation task finishes for any document in the current source, the document list and flashcard counts refresh automatically without requiring a manual page reload.
4. **Resilient Notification Handling**:
   - Update `taskStore.svelte.ts` so that completion of `generate_cards` tasks for single documents or subdocuments displays an accurate toast notice (showing cards created and document title) and updates store state properly, even when dispatched from outside the main Generate Studio.

## Boundaries & Constraints

**Always:**
- Discard modal blocks immediately upon queuing the task, returning control to the user.
- Ensure the Task Center drawer opens smoothly and displays real-time progress without disrupting the Document Inspector drawer.
- Reactively update flashcard counts for affected documents when the background job finishes.
- Keep task cancellation fully functional from the Task Center drawer.
- Preserve all existing user configuration options (provider, model, persona, difficulty, depth mode, deck, grounding).

**Never:**
- Never block the UI thread with synchronous HTTP generation requests from the Document Inspector.
- Never lose flashcards if the user closes the Document Inspector drawer while background generation is in flight.
- Never require a browser refresh to see updated flashcard badges on inspected documents.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output | Fallback |
|---|---|---|---|
| Click Start Generation | Configure settings & click "⚡ Start Generation" | Closes config modal, queues job, opens Task Center drawer showing live progress | Toast warning if API call fails |
| Close inspector while job runs | User closes drawer while job is generating | Job continues running in background worker pool; cards safely persist | Toast notifies when complete |
| Job completes | Background worker completes card generation | Toast announces completion; card badge updates from e.g. `0 cards` to `4 cards` | Badge updates on next refresh |
| Job cancelled | User clicks "Cancel" in Task Center | Job stops, status marked cancelled, toast confirms cancellation | No cards saved |
| Multiple subdocuments | User queues generation for Document A then Document B | Both jobs queue and run in worker pool with independent progress in Task Center | Sequential or concurrent based on pool limits |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Update `handleSynthesizeSingle` to dispatch asynchronously, open Task Center drawer, and reactively reload documents on job completion.
- `packages/web/client/src/stores/taskStore.svelte.ts` -- Enhance completion handling for `generate_cards` tasks dispatched outside Generate Studio.
- `packages/web/test/server.test.ts` / client tests -- Add tests for asynchronous document generation flow.
- `docs/ARCHITECTURE.md` -- Document asynchronous subdocument generation workflow.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Update `handleSynthesizeSingle` to call `generateCards({ ..., sync: false })`, close config modal, and open Task Center drawer with active job expanded.
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Add reactive effect / listener to reload documents when a relevant generation task completes.
- [x] `packages/web/client/src/stores/taskStore.svelte.ts` -- Handle generation task completion toasts and state updates for subdocument jobs cleanly.
- [x] `packages/web/test/server.test.ts` -- Add integration test asserting asynchronous generation response structure and background job creation.
- [x] `docs/ARCHITECTURE.md` -- Update architecture documentation with asynchronous subdocument synthesis details.

**Acceptance Criteria:**
- Clicking "⚡ Start Generation" on any subdocument in `SourceDocumentInspector.svelte` immediately enqueues a background task in `JobManager`.
- The configuration modal closes immediately and the Task Center drawer opens with live step progress, token counts, and streaming logs.
- The UI does not freeze or block during AI card synthesis.
- Upon job completion, document card count badges in the inspector refresh automatically without requiring a full page reload.
- Full monorepo verification passes (`npm test`, `npm run typecheck`, `npm run build`).
