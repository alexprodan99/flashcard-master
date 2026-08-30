---
title: 'Story 2.5: Automated Card Persistence & Metadata Tagging'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'd6bfda965f476d55bd4b8b2275fff501670f19c5'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/2-4-configurable-prompt-persona-studio-difficulty-scaling.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Grounded and verified flashcard drafts must be durably stored in the relational SQLite database with complete provenance metadata (source origin, verbatim citation, persona, difficulty, target deck, and custom tags) to support downstream study and export.

**Approach:** Implement `FlashcardRepository` in `packages/core/src/storage/card-repository.ts` providing CRUD, atomic batch persistence inside transactions, deck listing, and flexible filtering (by deck, source, difficulty, or tag) with Zod domain validation and ISO-8601 UTC timestamps.

## Boundaries & Constraints

**Always:**
- Persist cards into the SQLite `flashcards` table created in Story 1.1.
- Validate cards through `FlashcardSchema` before insertion and on retrieval.
- Serialize `tags` array to JSON string in SQLite and deserialize on read.
- Use SQLite transactions (`db.transaction`) for `createBatch` to guarantee atomic batch inserts.
- Preserve source provenance metadata (`sourceId`, `sourceOriginUrl`, `sourceQuote`, `personaUsed`).
- Cascade deletions when parent data source is removed (foreign key enforcement).

**Ask First:**
- Adding Full-Text Search (FTS5) virtual tables for cards (planned for search enhancements).

**Never:**
- Allow invalid or unvalidated flashcard records to be inserted.
- Drop foreign key constraints.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single Card Creation | Valid card properties | Generates UUID, stores in SQLite, returns `Flashcard` | Validates with Zod |
| Atomic Batch Insert | Array of 20 card drafts | Inserts all 20 inside transaction; rolls back on error | Atomicity guaranteed |
| Filter by Deck | `list({ targetDeck: "Distributed Systems" })` | Returns only cards assigned to that deck | N/A |
| Filter by Tag | `list({ tag: "consensus" })` | Returns cards containing `"consensus"` in JSON tags array | N/A |
| Delete Card | Valid UUID | Deletes row and returns `true` | Returns `false` if not found |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`, `FlashcardSchema`
- `packages/core/src/storage/db.ts` -- SQLite client
- `packages/core/src/storage/card-repository.ts` -- `FlashcardRepository` implementation
- `packages/core/src/index.ts` -- Export `FlashcardRepository`
- `packages/core/test/card-repository.test.ts` -- Unit and integration tests for CRUD and batch operations

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/card-repository.ts` -- Implement `FlashcardRepository` (create, createBatch, getById, list, update, delete, listDecks)
- [x] `packages/core/src/index.ts` -- Export `FlashcardRepository`
- [x] `packages/core/test/card-repository.test.ts` -- Unit tests verifying single insert, atomic batch insert, tag filtering, deck listing, and cascade deletion

**Acceptance Criteria:**
- **Given** a batch of verified flashcards
- **When** `FlashcardRepository.createBatch(cards)` is called
- **Then** all cards are inserted atomically into SQLite with full provenance and tags.
- **Given** cards with tags `["db", "raft"]` and `["db", "sql"]`
- **When** `FlashcardRepository.list({ tag: "raft" })` is queried
- **Then** only the card with the `"raft"` tag is returned.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All card repository and core tests pass.
- `npm run build` -- expected: All monorepo packages compile cleanly.



## Suggested Review Order

**Flashcard Persistence Repository**

- SQLite FlashcardRepository CRUD, atomic batch transactions, deck query, and tag filters
  [packages/core/src/storage/card-repository.ts#L1](../../packages/core/src/storage/card-repository.ts#L1)

**Unit Test Suite**

- Unit and integration tests for CRUD, atomic batch insert, tag queries, deck listing, and source deletion
  [packages/core/test/card-repository.test.ts#L1](../../packages/core/test/card-repository.test.ts#L1)
