---
title: 'Story 4.5: Inline Card Editor Slide-Over Drawer'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: 'f3baf5537e243d63e3ded9d7ae74d375895bbcdb'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/implementation-artifacts/4-4-question-explorer-filter-chips-visual-card-grid.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Curators need an intuitive inline editing tool within the Web UI to refine questions, tweak answers, adjust difficulty levels, reassign target decks, and delete cards without losing their current filtering context (FR-405, AD-7).

**Approach:** Implement `PATCH /api/cards/:id` and `DELETE /api/cards/:id` REST endpoints in `packages/web/src/server.ts`, and render a slide-over drawer editor in the embedded SPA with form fields for question, answer, difficulty, deck, tags, and citation provenance, featuring optimistic UI updates and deletion controls.

## Boundaries & Constraints

**Always:**
- Support updating all mutable flashcard attributes: `question`, `answer`, `difficulty`, `targetDeck`, `tags`, and `sourceQuote`.
- Provide direct card deletion with confirmation.
- Persist updates immediately into the underlying SQLite database.
- Refresh the active explorer grid and KPI statistics dynamically after updates.
- Keep editing completely local with zero third-party telemetry.

**Ask First:**
- Adding rich-text WYSIWYG editor libraries (standard clean textareas are preferred for lightweight local operation).

**Never:**
- Allow saving empty questions or answers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Update Card | `PATCH /api/cards/c-123` `{ question: "Updated?" }` | Updates SQLite record, returns updated JSON | 404 if not found, 400 if invalid |
| Delete Card | `DELETE /api/cards/c-123` | Deletes record from SQLite, returns `{ success: true }` | 404 if not found |
| Open Slide-Over Drawer | Click `✏️ Edit` on card | Drawer slides in from right with pre-filled fields | Handles missing card safely |
| Save Changes Click | Submits valid edits | Drawer closes, card in grid updates, stats refresh | Displays error message on failure |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` -- `PATCH /api/cards/:id` and `DELETE /api/cards/:id` REST endpoints, Slide-over Drawer HTML/CSS/JS
- `packages/web/test/server.test.ts` -- Integration tests for card updates and deletion

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/server.ts` -- Implement `PATCH /api/cards/:id` and `DELETE /api/cards/:id` REST endpoints
- [x] `packages/web/src/server.ts` -- Implement Slide-over Drawer component in SPA with pre-filled inputs, save action, and delete button
- [x] `packages/web/test/server.test.ts` -- Integration tests verifying card patch and delete endpoints

**Acceptance Criteria:**
- **Given** an existing flashcard
- **When** `PATCH /api/cards/:id` is sent with updated fields
- **Then** the record in SQLite is updated and returned.
- **Given** the Question Explorer
- **When** a user clicks `✏️ Edit` on any card
- **Then** the slide-over drawer opens, allowing editing and saving with immediate reflection in the UI.

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: Web server integration tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Slide-Over Drawer & Card Mutation REST Endpoints**

- REST endpoints for card fetch, patch update (PATCH /api/cards/:id), deletion (DELETE /api/cards/:id), and slide-over drawer SPA interface:
  [packages/web/src/server.ts#L442](../../packages/web/src/server.ts#L442)

**Integration Test Suite**

- Integration tests verifying card patch updates, deletion cascade, and drawer DOM elements:
  [packages/web/test/server.test.ts#L1](../../packages/web/test/server.test.ts#L1)
