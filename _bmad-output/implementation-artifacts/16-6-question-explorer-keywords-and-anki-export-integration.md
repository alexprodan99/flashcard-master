---
title: 'Question Explorer Keywords & Anki Export Integration'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: 'f55bfaf5ee9006bead41652432d3fcce1cb1add3'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-16-context.md
  - _bmad-output/specs/spec-structured-responses/SPEC.md
  - _bmad-output/specs/spec-structured-responses/schema-extensions.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** While Epic 16 successfully introduced structured LLM generation, SQLite storage, and live Task Center streaming for semantic `keywords` and `sourceLocator` metadata, this enriched data is currently invisible in the primary flashcard browsing views (`QuestionExplorer.svelte` and `CardEditorDrawer.svelte`) and omitted from Anki export targets (`AnkiPackageExporter` and `AnkiConnectAdapter`). Users cannot browse cards by keyword, edit card keywords, or filter by keywords in their desktop Anki collections.

**Approach:** Complete the user-facing loop for enriched metadata across the web client and export adapters:
1. Render keyword pill badges and source locator indicators on card items in `QuestionExplorer.svelte`.
2. Expand Question Explorer search filter to query `keywords` and `sourceLocator` alongside questions, answers, quotes, and tags.
3. Add interactive keyword and source locator editing to `CardEditorDrawer.svelte`.
4. Update `AnkiPackageExporter` and `AnkiConnectAdapter` to merge `card.keywords` (formatted as valid Anki tags) into Anki notes, and render keywords and source locators on the card back template.
5. Add automated unit and integration tests verifying UI search filtering and Anki export tag integration.

## Boundaries & Constraints

**Always:**
- Format `keywords` as valid Anki tags by replacing whitespace with hyphens (e.g., `"write ahead logging"` -> `"write-ahead-logging"`), preserving unique tags when merging with `card.tags`.
- Render `keywords` distinctly from macro `tags` in Question Explorer (e.g., `🏷️ keyword` vs `#tag`).
- Ensure cards with empty `keywords` (`[]`) or empty `sourceLocator` (`""`) render cleanly without broken UI placeholders or empty tag badges.
- Allow editing and saving `keywords` (comma-separated or tag list) and `sourceLocator` in `CardEditorDrawer.svelte`, passing them through `updateCardApi`.
- Maintain 100% backward compatibility for existing export workflows and existing flashcard records.

**Ask First:**
- Altering the Anki note schema (fields or templates) beyond the existing Basic model styling.

**Never:**
- Overwrite existing `tags` with `keywords`; they must be deduplicated and merged additively.
- Drop or corrupt existing card fields when updating keywords in `CardEditorDrawer`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Card with Keywords in Explorer | Card with `keywords: ["raft", "consensus"]`, `sourceLocator: "Section 2.1"` | Question Explorer renders card with `🏷️ raft` and `🏷️ consensus` badges, and `📍 Section 2.1` locator | Falls back to no badges if empty |
| Keyword Search in Explorer | User searches `"consensus"` | Card with keyword `"consensus"` is matched and displayed, even if term is absent from question/answer | Returns matching filtered cards |
| Edit Card Keywords | User modifies keywords in drawer to `"wal, sqlite, journal"` and saves | Card is updated via `PATCH /api/cards/:id` with new keywords array; UI updates reactively | Shows toast error on failure |
| Anki .apkg Export | Card with `tags: ["database"]`, `keywords: ["write ahead", "wal"]` | Notes in `.apkg` contain merged tags `database write-ahead wal`; back HTML includes keywords and locator | Valid Anki package created |
| AnkiConnect Sync | Card with `tags: ["net"]`, `keywords: ["tcp ip"]` | `addNote` / update note receives `tags: ["net", "tcp-ip"]` | Handles duplicate tags gracefully |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/views/QuestionExplorer.svelte` -- Render `keywords` pill badges and `sourceLocator` badge on card items; extend search filter to match keywords and sourceLocator.
- `packages/web/client/src/components/CardEditorDrawer.svelte` -- Add keywords and source locator inputs, parse comma-delimited keywords on save, forward to `updateCardApi`.
- `packages/adapters/src/export/anki-package-exporter.ts` -- Merge sanitized keywords into note tags, append keywords and source locator to back HTML template.
- `packages/adapters/src/export/ankiconnect-adapter.ts` -- Merge sanitized keywords into note tags, append keywords and source locator to back HTML template.
- `packages/adapters/test/anki-package-exporter.test.ts` -- Verify keywords are merged into `.apkg` note tags and back HTML.
- `packages/adapters/test/ankiconnect-adapter.test.ts` -- Verify keywords are merged into AnkiConnect note tags.
- `packages/web/test/client-stores.test.ts` (or Question Explorer tests) -- Verify keyword search filtering.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/views/QuestionExplorer.svelte` -- Display keyword pills and source locator badges; update search filter to include keywords and locator.
- [x] `packages/web/client/src/components/CardEditorDrawer.svelte` -- Add editable fields for `keywords` and `sourceLocator`, save via `updateCardApi`.
- [x] `packages/adapters/src/export/anki-package-exporter.ts` -- Merge keywords into Anki tags and render keywords/locator in card back HTML.
- [x] `packages/adapters/src/export/ankiconnect-adapter.ts` -- Merge keywords into AnkiConnect tags and back HTML.
- [x] `packages/adapters/test/` -- Add unit tests for Anki exporter and AnkiConnect keyword tag merging.
- [x] Monorepo verification -- Run full tests and typecheck across all workspaces.

**Acceptance Criteria:**
- Given a flashcard with `keywords` and `sourceLocator`, when viewed in Question Explorer, keyword pills (`🏷️`) and locator (`📍`) are rendered.
- Given a search query matching a card's keyword, the card appears in Question Explorer filtered results even if the query text does not appear in question or answer.
- Given a user editing a card in `CardEditorDrawer`, keywords and source locator can be modified and successfully persisted to SQLite.
- Given an export to `.apkg` or sync via AnkiConnect, all card keywords are converted to valid hyphenated Anki tags and included on the note.
- All monorepo tests pass cleanly (`npm test`) and `npm run typecheck` passes with 0 errors.

## Spec Change Log

_None._

## Design Notes

1. **Anki Tag Formatting:**
   Anki tags cannot contain spaces. Keywords with spaces (e.g. `"write ahead logging"`) are normalized to `"write-ahead-logging"`.
2. **Visual Hierarchy:**
   In Question Explorer, `#tags` (macro, purple) and `🏷️ keywords` (micro, indigo/blue) have distinct visual identities so users easily distinguish source categories from concept keywords.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter tests pass, including Anki export keyword tests.
- `npm test -w @flashcard-master/web` -- expected: All web tests pass.
- `npm run typecheck` -- expected: Monorepo compiles cleanly with 0 errors.

## Suggested Review Order

1. [`packages/adapters/src/export/anki-package-exporter.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/export/anki-package-exporter.ts) & [`ankiconnect-adapter.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/export/ankiconnect-adapter.ts): Inspect keyword tag merging and card template formatting.
2. [`packages/web/client/src/views/QuestionExplorer.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/views/QuestionExplorer.svelte): Inspect keyword badge rendering and search filtering.
3. [`packages/web/client/src/components/CardEditorDrawer.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/components/CardEditorDrawer.svelte): Inspect keyword and locator editing.
