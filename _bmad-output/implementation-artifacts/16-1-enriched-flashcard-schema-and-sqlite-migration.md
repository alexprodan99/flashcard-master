---
title: 'Enriched Flashcard Schema & SQLite Migration'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: 'f01a8407c14f4494b8d4bd5216f9505cd92174c1'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-16-context.md
  - _bmad-output/specs/spec-structured-responses/schema-extensions.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Flashcards lack atomic semantic keywords for targeted quick-recall drills and exact document locators/coordinates for bi-directional provenance, coupling card models to coarse citation fragments only.

**Approach:** Expand `CardGenerationDraftSchema` and `FlashcardSchema` in `@flashcard-master/core` with `keywords: string[]` and `sourceLocator: string`, and implement SQLite schema migrations in `db.ts` with backward-compatible defaults (`[]` and `""`) in `FlashcardRepository`.

## Boundaries & Constraints

**Always:**
- Maintain 100% backward compatibility for existing SQLite database records where `keywords` or `source_locator` are missing or `NULL`.
- Store `keywords` as a JSON-serialized string array in SQLite (`JSON.stringify(card.keywords)`) and parse safely with fallback to `[]`.
- Store `source_locator` as a string with fallback to `""`.
- Use non-destructive schema migration checks in `db.ts` (`PRAGMA table_info(flashcards)`).

**Ask First:**
- Modifying UI components or exporters if any unexpected type mismatches occur downstream.

**Never:**
- Break existing test suites or reset/drop the database.
- Require historical cards to have non-empty keywords or source locators.
- Modify unrelated domain models or storage tables.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create card with enriched fields | `keywords: ["transformer", "attention"]`, `sourceLocator: "Section 3.2"` | Stored and returned with parsed `keywords: ["transformer", "attention"]` and `sourceLocator: "Section 3.2"` | Rejects if keywords contains non-strings |
| Create card without enriched fields | `keywords: undefined`, `sourceLocator: undefined` | Defaults applied: `keywords: []`, `sourceLocator: ""` | N/A |
| Read legacy database row | Row has `keywords: NULL` or column absent, `source_locator: NULL` | `mapRowToFlashcard` yields `keywords: []`, `sourceLocator: ""` | Safe parsing fallback without throwing |
| Update existing card fields | Update `keywords: ["deep learning"]` | `keywords` updated to `["deep learning"]`, `updated_at` refreshed | Rejects non-existent card ID with null |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Defines `FlashcardSchema`, `Flashcard`, `CardGenerationDraftSchema`, and `CardGenerationDraft`.
- `packages/core/src/ports/index.ts` -- Defines `CardGenerationDraft` interface; synchronize with domain models.
- `packages/core/src/storage/schema.sql` -- Base DDL schema for `flashcards` table; add `keywords` and `source_locator` columns.
- `packages/core/src/storage/db.ts` -- `SCHEMA_SQL` definition and `runMigrations(db)` PRAGMA check to add `keywords` and `source_locator` columns non-destructively to existing databases.
- `packages/core/src/storage/card-repository.ts` -- `FlashcardRepository`, `CreateFlashcardInputSchema`, `mapRowToFlashcard`, and CRUD SQL statements.
- `packages/core/test/card-repository.test.ts` -- Unit tests for card repository persistence, updates, and backward compatibility.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Update `FlashcardSchema` with `keywords` (`z.array(z.string().trim()).default([])`) and `sourceLocator` (`z.string().trim().default("")`). Export `CardGenerationDraftSchema` with field descriptions.
- [x] `packages/core/src/ports/index.ts` -- Update `CardGenerationDraft` interface to include `keywords: string[]` and `sourceLocator: string` (optional/defaulted for generation drafts).
- [x] `packages/core/src/storage/schema.sql` -- Add `keywords TEXT NOT NULL DEFAULT '[]'` and `source_locator TEXT NOT NULL DEFAULT ''` to the `flashcards` table definition.
- [x] `packages/core/src/storage/db.ts` -- Update `SCHEMA_SQL` and add column migration in `runMigrations()` using PRAGMA check to add `keywords` and `source_locator` if missing.
- [x] `packages/core/src/storage/card-repository.ts` -- Update `CreateFlashcardInputSchema`, `mapRowToFlashcard`, `create`, `createBatch`, and `update` queries to persist and retrieve `keywords` and `source_locator`.
- [x] `packages/core/test/card-repository.test.ts` -- Add unit tests verifying persistence of `keywords` and `sourceLocator`, update queries, and fallback behavior for rows missing these columns.

**Acceptance Criteria:**
- Given `FlashcardRepository.create()` with `keywords` and `sourceLocator`, when persisted and queried by ID, then returned card matches the input fields.
- Given a raw database row with `keywords = NULL` and `source_locator = NULL`, when mapped via `mapRowToFlashcard()`, then it returns `keywords: []` and `sourceLocator: ""` without errors.
- Given an existing SQLite database without the new columns, when `createDatabaseClient()` or `runMigrations()` executes, then `keywords` and `source_locator` columns are added non-destructively.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All unit tests in core pass, including card repository and models tests.
- `npm run typecheck` -- expected: TypeScript compiles with 0 errors across the monorepo.
