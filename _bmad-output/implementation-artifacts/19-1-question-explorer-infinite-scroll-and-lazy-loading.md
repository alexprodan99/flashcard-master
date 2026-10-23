---
title: 'Story 19.1: Question Explorer Infinite Scroll & Backend Pagination'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: '124ec36228f06be3df08c4a03f7204bb8b49dc91'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Question Explorer currently fetches and renders the entire flashcard collection into memory at once via `fetchCards()`. As users generate hundreds or thousands of flashcards across multiple data sources, this causes severe UI rendering latency, high memory usage, and laggy DOM performance. Furthermore, filtering was previously performed client-side on the full array rather than utilizing SQLite indexes.

**Approach:** Implement scalable offset/limit backend pagination in `@flashcard-master/core` (`FlashcardRepository`) and `GET /api/cards`, returning paginated card slices along with total matching count and pagination metadata. In `QuestionExplorer.svelte` and `explorerStore`, transition to server-side query/deck/difficulty filtering and infinite scrolling backed by an `IntersectionObserver`, fetching successive batches of 25–50 cards as the user scrolls while maintaining scroll position, filters, and selection states.

## Boundaries & Constraints

**Always:**
- Maintain 100% backward compatibility for callers of `cardRepo.list(filter)` and `GET /api/cards` that omit `limit`/`offset` (return flat `Flashcard[]` array).
- When `limit` or `offset` query parameters are provided to `GET /api/cards`, return `{ cards: Flashcard[], total: number, limit: number, offset: number, hasMore: boolean }`.
- Execute filtering (deck, difficulty, search query) at the SQLite level so that `total` count and paginated slices reflect exact matching records across the entire database.
- Debounce search input (250–300ms) before issuing paginated fetch requests to prevent query thrashing.
- Reset pagination (`offset = 0`, clear accumulated card list) immediately when any filter (deck chip, difficulty chip, or search query) changes.
- Retain card selection IDs across pagination appends, and prune selection IDs when cards are deleted.
- Load all unique decks via `GET /api/decks` independently so deck filter chips remain complete and accurate regardless of the current paginated card slice.

**Ask First:**
- Changing default page batch size (default: 25 cards per batch).
- Altering the core `Flashcard` domain entity schema.

**Never:**
- Never break existing exporters, CLI commands, or tests that invoke `cardRepo.list()` without pagination parameters.
- Never discard active filter parameters (deck, difficulty, search query) when fetching the next page of cards.
- Never cause infinite loop triggers in the `IntersectionObserver` when the end of the collection (`hasMore: false`) is reached.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Initial Page Load | Navigating to Question Explorer with 1,000 cards in DB | Loads first 25 cards (`offset: 0, limit: 25`), displays `total: 1000`, renders swiftly without DOM lag | Renders error banner if initial fetch fails |
| Scroll to Bottom | User scrolls near bottom of page, sentinel intersects viewport | Automatically fetches next batch (`offset: 25, limit: 25`), appends to existing cards list without scrolling jumps | Silently stops and displays retry button if next batch fails |
| Filter Change | User clicks "Intermediate" difficulty chip | Resets `offset` to 0, clears existing cards list, fetches first page of intermediate cards with updated `total` | Shows empty state if 0 matches |
| Search Query | User types "mitochondria" into search box | Debounces 250ms, queries `GET /api/cards?q=mitochondria&limit=25&offset=0`, updates count and cards | Shows "No cards found matching..." if 0 results |
| End of Dataset | User scrolls through all available pages (`hasMore: false`) | Unobserves sentinel, renders "🎉 You've reached the end of the collection" footer; no further requests sent | N/A |
| Bulk Selection Across Pages | User selects 5 cards from page 1, scrolls to load page 2, selects 3 more | Selected count correctly displays "8 Selected", bulk delete acts on all 8 IDs | N/A |
| Backward Compatibility | Caller requests `GET /api/cards` without limit/offset | Returns raw `Flashcard[]` array without pagination wrapper object | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/card-repository.ts` -- Add `limit` and `offset` to `CardFilter`. Implement `count(filter: CardFilter): number` and `listPaginated(filter: CardFilter): { cards: Flashcard[]; total: number; limit: number; offset: number; hasMore: boolean }`.
- `packages/web/src/server.ts` -- Update `GET /api/cards` endpoint to inspect `query.limit` and `query.offset`. If present, return JSON `{ cards, total, limit, offset, hasMore }`; otherwise return legacy `Flashcard[]`.
- `packages/web/client/src/lib/types.ts` -- Add `PaginatedCardsResponse` interface (`{ cards: Flashcard[]; total: number; limit: number; offset: number; hasMore: boolean }`).
- `packages/web/client/src/lib/api.ts` -- Update `fetchCards` and export `fetchCardsPaginated` accepting `limit`, `offset`, `deck`, `difficulty`, `tag`, and `q`.
- `packages/web/client/src/stores/explorerStore.svelte.ts` -- Expand store state with `total`, `limit`, `offset`, `hasMore`, `loadingMore`, `resetPagination()`, and `appendCards()`.
- `packages/web/client/src/views/QuestionExplorer.svelte` -- Implement server-side filtering, separate deck list hydration via `fetchDecks()`, intersection observer sentinel at bottom of grid, and smooth batch loading.
- `packages/core/test/card-repository.test.ts` -- Add unit tests for `count()`, `listPaginated()`, and `limit`/`offset` support in `list()`.
- `packages/web/test/server.test.ts` -- Add integration tests for `GET /api/cards` pagination and backward compatibility.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/card-repository.ts` -- Add pagination options (`limit`, `offset`) to `CardFilter`, implement `count(filter)` and `listPaginated(filter)` with SQL `COUNT(*)`, `LIMIT`, and `OFFSET`.
- [x] `packages/core/test/card-repository.test.ts` -- Add unit tests verifying `count()`, `list()` with limit/offset, and `listPaginated()` pagination metadata.
- [x] `packages/web/src/server.ts` -- Update `GET /api/cards` handler to support `limit` and `offset` query parameters, returning `PaginatedCardsResponse` when specified and flat array when omitted.
- [x] `packages/web/test/server.test.ts` -- Add tests verifying `GET /api/cards` with `limit`/`offset` returns paginated object, and without returns flat array.
- [x] `packages/web/client/src/lib/types.ts` -- Define `PaginatedCardsResponse` type.
- [x] `packages/web/client/src/lib/api.ts` -- Add `fetchCardsPaginated()` supporting `limit`, `offset`, `deck`, `difficulty`, `q`.
- [x] `packages/web/client/src/stores/explorerStore.svelte.ts` -- Add pagination state (`total`, `limit`, `offset`, `hasMore`, `loadingMore`) and mutator actions.
- [x] `packages/web/client/src/views/QuestionExplorer.svelte` -- Integrate `IntersectionObserver` sentinel for lazy loading, server-side filter debouncing, and deck list loading.

**Acceptance Criteria:**
- Given a database containing 60 flashcards, when `GET /api/cards?limit=25&offset=0` is requested, then the response contains 25 cards, `total: 60`, `limit: 25`, `offset: 0`, and `hasMore: true`.
- Given `GET /api/cards` requested with no query parameters, then the response is an array of `Flashcard[]` preserving complete backward compatibility.
- Given the Question Explorer view, when the page renders, only the initial 25 cards are mounted in the DOM.
- Given the user scrolls to the bottom of the Question Explorer card list, when the sentinel intersects the viewport, the next batch of 25 cards is fetched and appended without resetting scroll position.
- Given the user enters a search term or clicks a deck/difficulty filter chip, the pagination resets to `offset: 0` and fetches the first page matching the active filters.
- Given 100% of monorepo unit and integration tests pass with zero typecheck or build errors.

## Spec Change Log

_None._

## Design Notes

### SQL Query Generation with Pagination
In `FlashcardRepository`:
```typescript
count(filter: CardFilter = {}): number {
  const { conditions, params } = this.buildWhereClause(filter);
  let sql = "SELECT COUNT(*) as count FROM flashcards";
  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }
  const row = this.db.prepare(sql).get(...params) as { count: number };
  return row ? row.count : 0;
}
```

### Intersection Observer Sentinel in Svelte 5
In `QuestionExplorer.svelte`:
```svelte
let sentinelEl: HTMLDivElement | null = $state(null);

$effect(() => {
  if (!sentinelEl) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && explorerStore.hasMore && !explorerStore.loadingMore && !explorerStore.loading) {
        loadNextPage();
      }
    },
    { rootMargin: '300px' }
  );
  observer.observe(sentinelEl);
  return () => observer.disconnect();
});
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All card repository tests pass (including pagination unit tests).
- `npm test -w @flashcard-master/web` -- expected: All web server tests pass (including `/api/cards` pagination tests).
- `npm run typecheck` -- expected: Zero TypeScript errors across all monorepo packages.
- `npm run build` -- expected: Clean production build for client and server.
