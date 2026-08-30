---
title: 'Story 2.6: Card Deduplication & Normalized Content Filter'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '2ca34d6c266ef010da33cac7a3cb917c246b8804'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/2-5-automated-card-persistence-metadata-tagging.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recurring ingestion syncs and multiple document chunks frequently produce duplicate or near-identical questions testing the same concept (e.g. "What does WAL stand for in SQLite?" vs "What is SQLite's WAL mode?"). Persisting duplicate cards clutters user decks and degrades spaced repetition efficiency (FR-206).

**Approach:** Implement `CardDeduplicationService` in `packages/core/src/services/card-deduplication-service.ts` using normalized string canonicalization, Jaccard token set similarity, and Levenshtein/Dice distance metrics to detect and filter out duplicate cards within target decks before SQLite persistence.

## Boundaries & Constraints

**Always:**
- Compare new candidate cards against existing cards in the target deck.
- Normalize question text (case folding, punctuation stripping, whitespace collapsing).
- Compute token overlap (Jaccard index) and character similarity (Dice coefficient) with configurable threshold (default: 0.85).
- Return structured deduplication result distinguishing unique drafts from discarded duplicates.
- Discard duplicate cards within the same generation batch (intra-batch deduplication) and across existing deck cards (inter-batch deduplication).

**Ask First:**
- Adding semantic vector embedding similarity (planned for local embedding extension).

**Never:**
- Discard distinctly different questions that happen to share a few common words (e.g. "What is SQLite?" vs "What is SQLite WAL?").
- Overwrite existing flashcard study stats when a duplicate is encountered.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Exact Question Duplicate | "What is Raft?" vs "what is raft?" | `isDuplicate: true`, `similarity: 1.0` | Discards duplicate |
| Near-Identical Paraphrase | "What does WAL mean in SQLite?" vs "What does WAL stand for in SQLite?" | `isDuplicate: true`, `similarity >= 0.85` | Discards duplicate |
| Distinct Questions (Same Topic) | "What is Raft leader election?" vs "What is Raft log replication?" | `isDuplicate: false`, `similarity < 0.70` | Preserves both |
| Intra-Batch Duplicates | Batch with 2 identical cards | Returns 1 unique card, flags 1 duplicate | N/A |
| Empty Deck / No Prior Cards | Target deck has 0 cards | Returns all intra-unique drafts | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`
- `packages/core/src/ports/index.ts` -- `CardGenerationDraft`
- `packages/core/src/services/card-deduplication-service.ts` -- `CardDeduplicationService` implementation
- `packages/core/src/index.ts` -- Export `CardDeduplicationService`
- `packages/core/test/card-deduplication-service.test.ts` -- Unit tests for exact, token overlap, dice similarity, and intra-batch deduplication

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/card-deduplication-service.ts` -- Implement `CardDeduplicationService` (token normalization, Jaccard/Dice similarity, batch filter)
- [x] `packages/core/src/index.ts` -- Export `CardDeduplicationService`
- [x] `packages/core/test/card-deduplication-service.test.ts` -- Unit tests verifying exact match, paraphrase detection, distinct topic preservation, and batch filtering

**Acceptance Criteria:**
- **Given** a generated card with a near-identical question to an existing card in the deck
- **When** `CardDeduplicationService.filterUnique(newDrafts, existingCards)` is executed
- **Then** the duplicate card is filtered out and recorded in `duplicates`.
- **Given** distinct questions on the same subject
- **When** deduplication runs
- **Then** all distinct questions are preserved in `unique`.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All deduplication and core tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly without TypeScript errors.



## Suggested Review Order

**Card Deduplication Service**

- Token-level Jaccard and character Dice coefficient similarity algorithm with intra- and inter-batch deduplication
  [packages/core/src/services/card-deduplication-service.ts#L1](../../packages/core/src/services/card-deduplication-service.ts#L1)

**Unit Test Suite**

- Deduplication unit tests verifying exact match, paraphrase similarity, subtopic differentiation, and batch filtering
  [packages/core/test/card-deduplication-service.test.ts#L1](../../packages/core/test/card-deduplication-service.test.ts#L1)
