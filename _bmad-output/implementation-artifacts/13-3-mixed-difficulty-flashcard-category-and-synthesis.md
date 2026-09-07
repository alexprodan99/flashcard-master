---
title: 'Mixed Target Difficulty Category & Adaptive Synthesis Pipeline'
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

**Problem:** Flashcard generation only allows selecting a single fixed difficulty level (`beginner`, `intermediate`, or `expert`) for a batch. Users studying complex documentation must run three separate synthesis runs if they want a balanced mix of introductory fundamentals, intermediate concepts, and expert-level trade-off questions. Furthermore, cards cannot be filtered or tagged by a `mixed` difficulty category.

**Approach:** Expand the domain model `DifficultyLevelSchema` to include `'mixed'`, and update the SQLite schema and migrations to support `CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed'))`. Calibrate all 4 LLM adapters (OpenAI, Gemini, Anthropic, Ollama) so that when `difficulty === 'mixed'` is selected, the generation prompt directs the model to synthesize a balanced progression of beginner, intermediate, and expert cards across the material. Add "🌈 Mixed" to UI selectors, the Question Explorer filter toolbar, and card editor drawers with dedicated badge styling.

## Boundaries & Constraints

**Always:**
- Update `SCHEMA_SQL` and add an automated migration in `packages/core/src/storage/db.ts` to migrate existing databases without breaking existing flashcards.
- Update `DifficultyLevelSchema` in `@flashcard-master/core` (`z.enum(["beginner", "intermediate", "expert", "mixed"])`).
- In LLM adapters, calibrate prompts when `difficulty === 'mixed'` so the model is explicitly told:
  `"Generate a balanced progression of beginner, intermediate, and expert flashcards across the text (assign each card its appropriate difficulty: beginner, intermediate, expert, or mixed)."`
- Update CLI `--difficulty` option validation to accept `mixed`.
- In `QuestionExplorer.svelte`, add a `🌈 Mixed` filter chip and ensure cards with `difficulty === 'mixed'` display an attractive purple / gradient badge.

**Ask First:**
- Removing or altering the definitions of existing difficulty levels (`beginner`, `intermediate`, `expert`).

**Never:**
- Never fail LLM response parsing if an LLM returns `mixed` as the difficulty for individual cards.
- Never crash database inserts when saving cards with `difficulty: "mixed"`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed Generation | `difficulty: "mixed"` in `POST /api/generate` | Generates cards spanning introductory to advanced concepts, tagged appropriately | Validates and persists cleanly |
| Card Parsing with "mixed" | LLM returns `{"difficulty": "mixed"}` | Parser normalizes to `"mixed"` and validates via `DifficultyLevelSchema` | Accepts without error |
| DB Migration on Existing DB | Existing SQLite file with 3-difficulty check | Migration inspects constraint, alters table, copies rows, re-enables indices | Transactional rollback on error |
| Question Explorer Filter | Click "🌈 Mixed" filter chip | Shows only cards with `difficulty === 'mixed'` | Updates table reactively |
| CLI Generation / Query | `flashcard-master generate --difficulty mixed` | Accepted by CLI argument parser, passes to generator | Helpful error on unknown level |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Domain contracts: extend `DifficultyLevelSchema` with `"mixed"`.
- `packages/core/src/storage/schema.sql` -- Schema definition: update `CHECK(difficulty IN ('beginner', 'intermediate', 'expert', 'mixed'))`.
- `packages/core/src/storage/db.ts` -- SQLite migrations: check constraint upgrade for `flashcards` table.
- `packages/adapters/src/llm/types.ts` -- Prompt types & response parsers: accept `"mixed"`.
- `packages/adapters/src/llm/openai-adapter.ts`, `gemini-adapter.ts`, `anthropic-adapter.ts`, `ollama-adapter.ts` -- Prompt generation tuning for `mixed` mode.
- `packages/cli/src/cli.ts` -- CLI options: include `mixed` in `--difficulty` descriptions and validation.
- `packages/web/client/src/lib/types.ts` -- Web types: extend `DifficultyLevel` with `'mixed'`.
- `packages/web/client/src/components/GenerationConfigFields.svelte` -- Add "🌈 Mixed (Adaptive)" option to difficulty select.
- `packages/web/client/src/components/CardEditorDrawer.svelte` -- Add "Mixed" option to edit dropdown.
- `packages/web/client/src/views/QuestionExplorer.svelte` -- Add "🌈 Mixed" filter chip and badge CSS.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain/models.ts` -- Extend `DifficultyLevelSchema` to `z.enum(["beginner", "intermediate", "expert", "mixed"])`.
- [ ] `packages/core/src/storage/schema.sql` -- Update `flashcards` CHECK constraint to include `'mixed'`.
- [ ] `packages/core/src/storage/db.ts` -- Update `SCHEMA_SQL` and add migration step 7 upgrading existing `flashcards` check constraints to allow `'mixed'`.
- [ ] `packages/adapters/src/llm/types.ts` -- Update parser normalization to recognize and preserve `mixed`.
- [ ] `packages/adapters/src/llm/*-adapter.ts` -- Update prompt templates across all 4 adapters to provide specific mixed-difficulty instructions when `options.difficulty === 'mixed'`.
- [ ] `packages/cli/src/cli.ts` -- Update Commander CLI option definitions to include `mixed`.
- [ ] `packages/web/client/src/lib/types.ts` -- Add `'mixed'` to web `DifficultyLevel`.
- [ ] `packages/web/client/src/components/GenerationConfigFields.svelte` -- Add `<option value="mixed">🌈 Mixed (Adaptive Progression)</option>`.
- [ ] `packages/web/client/src/components/CardEditorDrawer.svelte` -- Add `<option value="mixed">Mixed</option>`.
- [ ] `packages/web/client/src/views/QuestionExplorer.svelte` -- Add `<span class="filter-chip" class:active={selectedDifficulty === 'mixed'} onclick={() => setFilter('difficulty', 'mixed')}>🌈 Mixed</span>` and `.badge-diff.mixed` styles.
- [ ] `packages/core/test/db.test.ts` & `card-repository.test.ts` -- Verify persisting and querying cards with `difficulty: "mixed"`.
- [ ] `packages/adapters/test/llm-adapters.test.ts` -- Verify LLM adapters produce valid prompts when `difficulty === 'mixed'`.

**Acceptance Criteria:**
- Given a generation request with `difficulty: "mixed"`
- When flashcards are generated and saved to the database
- Then the database saves the cards without CHECK constraint violations.
- And in Question Explorer, selecting the "🌈 Mixed" chip correctly filters to mixed-difficulty flashcards.
- And existing cards with beginner, intermediate, and expert remain 100% intact and functional.

## Spec Change Log

_None._

## Design Notes

### Prompt Tuning Directive for Mixed Difficulty
```typescript
const diffInstruction = options.difficulty === 'mixed'
  ? 'Generate a balanced mixture of beginner (fundamental definitions), intermediate (mechanisms and relations), and expert (trade-offs and edge cases) flashcards. Assign each card its appropriate difficulty in the output: "beginner", "intermediate", or "expert".'
  : `Generate exactly ${count} atomic Front/Back flashcards from the provided document at a "${options.difficulty}" difficulty level.`;
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: database and repository tests pass with `mixed` difficulty.
- `npm test -w @flashcard-master/adapters` -- expected: LLM adapter and parser tests pass.
- `npm test` -- expected: all workspace test suites pass.

## Suggested Review Order

1. Domain & schema in `packages/core/src/domain/models.ts` and `db.ts`
2. LLM prompt adapters in `packages/adapters/src/llm/`
3. UI components in `packages/web/client/src/`
4. Automated tests in `core` and `adapters`
