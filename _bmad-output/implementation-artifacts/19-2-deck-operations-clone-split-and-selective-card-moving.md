---
title: 'Story 19.2: Deck Operations: Clone, Batch Split & Selective Card Moving'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: '9fd0f0b40eb9d612e6bf54d2459b152d0fa733d3'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Currently, decks are static labels assigned to flashcards at generation time without any lifecycle management tools. Users cannot duplicate an existing deck for experimentation, divide large monolithic decks into manageable study batches (e.g. 20-30 cards per study unit), or selectively reorganize cards between decks from the UI without manual individual card edits.

**Approach:** Implement transactional deck lifecycle operations in `@flashcard-master/core` (`FlashcardRepository`) and corresponding REST endpoints in `@flashcard-master/web`:
1. **Clone Deck (`POST /api/decks/clone`)**: Atomically duplicates all flashcards from a source deck under a new deck name with fresh UUIDs and preserved metadata.
2. **Batch Split Deck (`POST /api/decks/split`)**: Atomically divides a deck into equal-sized sub-decks with a configurable batch size (e.g., 25 cards per sub-deck named `Deck - Part 1`, `Deck - Part 2`).
3. **Selective Card Move (`POST /api/decks/move-cards`)**: Atomically updates the `target_deck` of selected card IDs in Question Explorer to a target deck (existing or newly created).
In the Web UI, add interactive modals in `QuestionExplorer.svelte` ("Deck Operations" menu and "Move to Deck..." bulk selection action), and update client API client and stores with optimistic cache refreshes.

## Boundaries & Constraints

**Always:**
- Execute deck cloning, splitting, and card movement inside SQLite transactions (`db.transaction`) so operations either succeed completely or roll back without orphaned cards.
- Validate inputs rigorously: reject empty deck names, reject cloning to an identical deck name, reject splitting with batch size < 2 or on empty decks, and reject moving an empty card ID list.
- When cloning cards, generate fresh UUIDs, duplicate all attributes (including quotes, tags, keywords, difficulty, persona, source locator, origin URL), and assign the new deck name.
- When moving cards, update `target_deck` and set `updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`.
- After deck operations complete in the UI, reactively reload available decks (`fetchDecks()`) and refresh active card lists so chip selectors reflect new or split decks immediately.
- Preserve selection state safety: if moved cards no longer match active deck filter, prune them from the current view and selection list.

**Ask First:**
- Automatically deleting original cards when splitting (default behavior: reassigns cards from the original deck into the numbered sub-decks).
- Changing default split naming convention (`${sourceDeck} - Part ${index}`).

**Never:**
- Never perform deck operations outside of a transaction where partial failure could corrupt or split cards inconsistently.
- Never lose source citations, verbatim quotes, or source document references during deck cloning.
- Never permit moving cards to an empty or whitespace-only deck name.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Clone Deck | `sourceDeck: "Biology"`, `targetDeck: "Biology - Review"` | Duplicates all cards in "Biology" to "Biology - Review" with fresh UUIDs; returns `{ success: true, clonedCount: N, targetDeck: "Biology - Review" }` | Returns 400 if `targetDeck` equals `sourceDeck` or source deck has 0 cards |
| Split Deck | `sourceDeck: "LargeDeck"` (70 cards), `batchSize: 25` | Divides 70 cards into 3 sub-decks: `LargeDeck - Part 1` (25), `LargeDeck - Part 2` (25), `LargeDeck - Part 3` (20); returns `{ success: true, subDecks: [...], cardsMoved: 70 }` | Returns 400 if `batchSize < 2` or source deck is empty |
| Move Cards | `cardIds: ["id-1", "id-2"]`, `targetDeck: "Physics"` | Updates `target_deck = 'Physics'` on the 2 cards; returns `{ success: true, movedCount: 2, targetDeck: "Physics" }` | Returns 400 if `cardIds` is empty or `targetDeck` is blank |
| Move Non-Existent ID | `cardIds: ["valid-id", "non-existent-id"]`, `targetDeck: "Deck"` | Updates matching valid IDs; returns actual moved count | 200 with `movedCount: 1` |
| Clone to Existing Deck | `sourceDeck: "Deck A"`, `targetDeck: "Deck B"` (already has cards) | Appends cloned cards to "Deck B" seamlessly | 200 with clonedCount |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/card-repository.ts` -- Implement `cloneDeck(sourceDeck, targetDeck): number`, `splitDeck(sourceDeck, batchSize, namingPrefix?): { subDecks: string[]; cardsMoved: number }`, and `moveCards(cardIds, targetDeck): number`.
- `packages/core/test/card-repository.test.ts` -- Add unit tests for `cloneDeck`, `splitDeck`, and `moveCards` including edge cases and transactional rollback verification.
- `packages/web/src/server.ts` -- Add REST endpoints `POST /api/decks/clone`, `POST /api/decks/split`, and `POST /api/decks/move-cards`.
- `packages/web/test/server.test.ts` -- Add integration tests for all three deck endpoints.
- `packages/web/client/src/lib/api.ts` -- Add `cloneDeck()`, `splitDeck()`, and `moveCardsToDeck()`.
- `packages/web/client/src/views/QuestionExplorer.svelte` -- Add "Deck Operations" dropdown button (Clone, Split) and "Move to Deck..." button in bulk action bar with interactive confirmation modals.
- `docs/ARCHITECTURE.md` -- Document deck lifecycle operations and API contracts.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/card-repository.ts` -- Implement `cloneDeck()`, `splitDeck()`, and `moveCards()` using atomic SQLite transactions.
- [x] `packages/core/test/card-repository.test.ts` -- Add unit tests covering deck cloning, batch splitting, and selective card movement.
- [x] `packages/web/src/server.ts` -- Expose and validate `POST /api/decks/clone`, `POST /api/decks/split`, and `POST /api/decks/move-cards`.
- [x] `packages/web/test/server.test.ts` -- Add integration tests for `/api/decks/clone`, `/api/decks/split`, and `/api/decks/move-cards`.
- [x] `packages/web/client/src/lib/api.ts` -- Export client API functions `cloneDeck()`, `splitDeck()`, `moveCardsToDeck()`.
- [x] `packages/web/client/src/views/QuestionExplorer.svelte` -- Implement UI for Clone Deck modal, Split Deck modal, and Move Selected Cards modal with autocomplete deck selection.
- [x] `docs/ARCHITECTURE.md` -- Document deck management capabilities and API specifications.

**Acceptance Criteria:**
- Given a deck with 10 cards, calling `cardRepo.cloneDeck("A", "B")` creates 10 distinct duplicate cards in "B" with identical fields and fresh UUIDs.
- Given a deck with 55 cards, calling `cardRepo.splitDeck("A", 20)` reassigns cards into "A - Part 1" (20), "A - Part 2" (20), and "A - Part 3" (15).
- Given a set of selected cards in Question Explorer, user can move them to an existing or new deck, immediately updating the card grid and deck chips.
- 100% of monorepo unit and integration tests pass with zero typecheck or build errors.

## Spec Change Log

_None._

## Design Notes

### Transactional Deck Splitting
```typescript
splitDeck(sourceDeck: string, batchSize: number, customPrefix?: string): { subDecks: string[]; cardsMoved: number } {
  const cards = this.list({ targetDeck: sourceDeck });
  if (cards.length === 0) return { subDecks: [], cardsMoved: 0 };
  const prefix = customPrefix?.trim() || sourceDeck.trim();
  const subDecks: string[] = [];
  const stmt = this.db.prepare("UPDATE flashcards SET target_deck = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?");

  const runSplit = this.db.transaction(() => {
    let partIndex = 1;
    for (let i = 0; i < cards.length; i += batchSize) {
      const partDeck = `${prefix} - Part ${partIndex}`;
      subDecks.push(partDeck);
      const batch = cards.slice(i, i + batchSize);
      for (const card of batch) {
        stmt.run(partDeck, card.id);
      }
      partIndex++;
    }
  });
  runSplit();
  return { subDecks, cardsMoved: cards.length };
}
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All card repository tests pass (including clone, split, move tests).
- `npm test -w @flashcard-master/web` -- expected: All web server tests pass (including `/api/decks/*` tests).
- `npm run typecheck` -- expected: Zero errors.
- `npm run build` -- expected: Clean production build.
