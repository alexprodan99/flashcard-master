---
title: 'Story 4.4: Question Explorer Filter Chips & Visual Card Grid'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: '04967a71e00db397a5f9063b048c91afd621e5d5'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/implementation-artifacts/4-3-sources-manager-ui-with-live-sync-status.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners need an interactive visual card explorer in the web interface with multi-facet filter chips (by deck, tag, difficulty), real-time search, and flip/toggle answer reveals with citation provenance (FR-404, AD-7).

**Approach:** Implement `/api/tags` and search query filtering in `packages/web/src/server.ts`, and render a rich interactive Question Explorer in the embedded SPA featuring search bars, clickable deck/difficulty/tag filter chips, and a responsive CSS visual card grid with interactive revealable answers and verbatim citation callouts.

## Boundaries & Constraints

**Always:**
- Support multi-dimensional filtering by search query substring, target deck, difficulty level, and tags.
- Provide interactive reveal toggles on every card for active-recall self-testing directly in the browser.
- Display verbatim source citations (`sourceQuote`) prominently.
- Ensure filter changes update the card grid dynamically without full page reloads.
- Run completely local with zero external assets.

**Ask First:**
- Adding spaced-repetition study session timers in the browser (focus is on card exploration and curation for v1).

**Never:**
- Render unsanitized HTML in card questions or answers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search Substring | `GET /api/cards?search=raft` | Returns cards matching "raft" in question or answer | Returns matching array |
| Filter by Difficulty | Click "Intermediate" filter chip | Grid filters cards to `difficulty === 'intermediate'` | Dynamic client update |
| Filter by Tag | Click a tag chip (e.g. `sqlite`) | Grid filters cards containing that tag | Dynamic client update |
| Reveal Answer Click | User clicks "Show Answer" on card | Expands answer and citation block | Smooth CSS toggle |
| Empty Filter Matches | Search returns 0 cards | Displays clean "No flashcards match your filter" empty state | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/card-repository.ts` -- `FlashcardRepository.list()` search support and tag listing
- `packages/web/src/server.ts` -- `/api/tags` endpoint, search query parameter support in `/api/cards`, and Question Explorer SPA view
- `packages/web/test/server.test.ts` -- Integration tests for card search, tag endpoints, and explorer UI

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/card-repository.ts` -- Support search query substring filtering and tag discovery if needed
- [x] `packages/web/src/server.ts` -- Add `/api/tags` endpoint and search parameter support to `GET /api/cards`
- [x] `packages/web/src/server.ts` -- Implement Question Explorer UI in SPA (search bar, filter chips for deck/diff/tags, interactive card grid with revealable answers)
- [x] `packages/web/test/server.test.ts` -- Integration tests for search filtering and tags API

**Acceptance Criteria:**
- **Given** flashcards in the database
- **When** `GET /api/cards?search=...` or `GET /api/tags` is called
- **Then** filtered cards and distinct tag lists are returned in JSON.
- **Given** the Question Explorer tab in the Web UI
- **When** filter chips or search queries are changed
- **Then** the card grid updates dynamically and cards can be revealed interactively.

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: Web server integration tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Question Explorer UI & Tag / Search Endpoints**

- listTags() and substring query filtering in repository:
  [packages/core/src/storage/card-repository.ts#L107](../../packages/core/src/storage/card-repository.ts#L107)
- Question Explorer view with search input, deck/difficulty/tag filter chips, and interactive reveal cards in SPA:
  [packages/web/src/server.ts#L368](../../packages/web/src/server.ts#L368)

**Integration Test Suite**

- Tests validating /api/tags, substring search filtering on /api/cards, and Question Explorer HTML rendering:
  [packages/web/test/server.test.ts#L1](../../packages/web/test/server.test.ts#L1)
