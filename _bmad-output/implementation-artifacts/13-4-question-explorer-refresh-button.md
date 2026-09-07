---
title: 'Question Explorer Real-Time Refresh Action'
type: 'feature'
created: '2026-09-07'
status: 'ready-for-dev'
baseline_commit: 'b4c42ba59ea335977b1200dd5df08b5dde97f3f8'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-13-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When users synthesize new flashcards in Generate Studio, edit card details in another tab/window, or run CLI commands while the web UI is running, the Question Explorer view remains static. Currently, the user is forced to execute a full browser reload (`F5`), which wipes out active search inputs, deck selections, and scroll position.

**Approach:** Add a dedicated "🔄 Refresh" action in the filter toolbar of `QuestionExplorer.svelte`. Clicking this button triggers `loadCards()` reactively without losing the user's active filter settings (`selectedDeck`, `selectedDifficulty`, `searchQuery`). Provide an animated spinning icon during the fetch and disable the button while in-flight to prevent duplicate concurrent network requests. Display a brief confirmation toast upon completion.

## Boundaries & Constraints

**Always:**
- Retain all active UI filter state (`selectedDeck`, `selectedDifficulty`, `searchQuery`) across the refresh cycle.
- Display a spinning animation on the refresh icon while `loading === true`.
- Disable the button while an asynchronous fetch is in-flight to prevent race conditions.
- Show a brief toast notification (`"⚡ Flashcard catalog refreshed."`) or error toast if the fetch fails.

**Ask First:**
- Adding automatic background polling intervals (which would introduce unwanted background network activity).

**Never:**
- Never trigger a full page reload or reset user filters during refresh.
- Never wipe selected card IDs if the selected cards are still present in the updated list.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Active Filters Applied | Filtered by deck "Algorithms" & difficulty "expert" | `loadCards()` runs; table updates with latest cards matching active filters | Shows error banner if server fails |
| In-Flight Request | Click refresh button twice quickly | First click disables button; second click is ignored until request resolves | Debounced/disabled |
| Selected Cards | 3 cards checked for bulk action | If checked cards still exist in refreshed list, keep them checked | Selected IDs filtered to existing cards |
| Transient Confirmation | Refresh succeeds | Shows brief toast `"⚡ Flashcards catalog refreshed."` for 3 seconds | Auto-dismisses toast |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/views/QuestionExplorer.svelte` -- Question Explorer Svelte 5 component: refresh button in toolbar, spinning animation rune, and filter-preserving reload handler.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Add a "🔄 Refresh" button in the filter toolbar next to the Deck and Difficulty filters.
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Add spinning CSS animation (`@keyframes spin`) applied to the refresh icon when `loading === true`.
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Ensure `disabled={loading}` on the button prevents double-triggering.
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Retain active `searchQuery`, `selectedDeck`, and `selectedDifficulty` values upon fetch completion.
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Cleanly prune `selectedIds` to only IDs that exist in the newly fetched cards list.
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Set `toastMessage = '⚡ Flashcards refreshed.'` with a 3-second timeout on successful refresh.

**Acceptance Criteria:**
- Given the Question Explorer view with active filters
- When the user clicks the "🔄 Refresh" button
- Then the icon spins and the button is disabled while fetching.
- And all cards are re-fetched from `GET /api/cards`.
- And the active filters continue to filter the newly fetched cards without resetting.
- And a success toast is displayed for 3 seconds.

## Spec Change Log

_None._

## Design Notes

### Refresh Button Markup & Styling
```svelte
<button
  class="btn-refresh"
  onclick={handleRefresh}
  disabled={loading}
  title="Refresh flashcard catalog"
>
  <span class="refresh-icon" class:spinning={loading}>🔄</span>
  <span>Refresh</span>
</button>
```

## Verification

**Commands:**
- `npm run build -w @flashcard-master/web` -- expected: Svelte 5 Vite build succeeds with 0 errors.
- `npm test -w @flashcard-master/web` -- expected: all web tests pass.

## Suggested Review Order

1. Component logic & template in `packages/web/client/src/views/QuestionExplorer.svelte`
2. Component styling in `<style>` block of `QuestionExplorer.svelte`
