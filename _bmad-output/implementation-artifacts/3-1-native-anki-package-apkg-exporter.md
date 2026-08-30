---
title: 'Story 3.1: Native Anki Package (.apkg) Exporter'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '2d050881f66a63482a959d6296c27c4467a1844a'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/epic-2-retro-2026-08-30.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners who use Anki on desktop or mobile need to import their generated flashcards directly as native `.apkg` files containing deck hierarchies, styling, and card fields without manual copy-pasting or format conversion (FR-301, AD-6).

**Approach:** Implement `AnkiPackageExporter` in `packages/adapters/src/export/anki-package-exporter.ts` conforming to `ExporterPort` (`format: "apkg"`), creating an in-memory SQLite `collection.anki2` database with standard Anki note models and card schemas, and packaging it alongside a `media` manifest into a zip `.apkg` buffer using `jszip`.

## Boundaries & Constraints

**Always:**
- Conforming strictly to `ExporterPort` from `@flashcard-master/core`.
- Produce valid `.apkg` zip packages containing `collection.anki2` SQLite schema and `media` json.
- Support custom deck names (defaults to `card.targetDeck` or "Default").
- Format Front and Back card fields with clean HTML styling and optional collapsible citation footnotes.
- Serialize tags cleanly in Anki format (space-separated strings).
- Ensure valid unique note/card IDs and checksums.

**Ask First:**
- Adding custom Anki card note types (e.g. Cloze deletion) in v1 (Basic Front/Back model is standard for v1).

**Never:**
- Generate corrupted SQLite tables or malformed ZIP archives.
- Rely on external cloud services or AnkiWeb credentials.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Card List | Array of valid `Flashcard` objects | Returns valid `.apkg` `Buffer` with SQLite schema and cards | N/A |
| Cards with Citation Footnotes | `includeCitationFootnotes: true` | Injects collapsible `<details>` citation on Back of card | N/A |
| Empty Card List | `cards: []` | Returns valid empty `.apkg` package with deck schema | N/A |
| Special HTML Characters | Cards with `<script>`, `&`, `<` | Escapes or safely formats HTML in note fields | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`
- `packages/core/src/ports/index.ts` -- `ExporterPort`, `ExportOptions`
- `packages/adapters/package.json` -- Add `jszip`, `@types/jszip`
- `packages/adapters/src/export/anki-package-exporter.ts` -- `AnkiPackageExporter` implementation
- `packages/adapters/src/index.ts` -- Export `AnkiPackageExporter`
- `packages/adapters/test/anki-package-exporter.test.ts` -- Unit tests validating `.apkg` zip structure and SQLite table contents

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/ports/index.ts` -- Ensure `ExporterPort` and `ExportOptions` contracts are declared
- [x] `packages/adapters/package.json` -- Add `jszip` dependency
- [x] `packages/adapters/src/export/anki-package-exporter.ts` -- Implement `AnkiPackageExporter` creating `collection.anki2` and zip archive
- [x] `packages/adapters/src/index.ts` -- Export `AnkiPackageExporter`
- [x] `packages/adapters/test/anki-package-exporter.test.ts` -- Unit tests validating `.apkg` decompression, SQLite queries on `notes` and `cards` tables, and citation formatting

**Acceptance Criteria:**
- **Given** an array of flashcards
- **When** `AnkiPackageExporter.exportCards(cards, options)` is executed
- **Then** a binary `Buffer` is returned that is a valid ZIP archive containing `collection.anki2` and `media`.
- **Given** the generated `collection.anki2` database
- **When** queried with SQLite
- **Then** the `cards` and `notes` tables contain exact matching Front, Back, and tag records.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All exporter and adapter tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly without TypeScript errors.



## Suggested Review Order

**Anki Package Exporter Adapter**

- In-memory Anki SQLite database schema creation, note formatting, checksum calculation, and ZIP packaging
  [packages/adapters/src/export/anki-package-exporter.ts#L1](../../packages/adapters/src/export/anki-package-exporter.ts#L1)

**Unit Test Suite**

- Unit tests decompressing .apkg ZIP containers, validating SQLite table schema, notes, cards, and citation styling
  [packages/adapters/test/anki-package-exporter.test.ts#L1](../../packages/adapters/test/anki-package-exporter.test.ts#L1)
