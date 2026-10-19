---
title: 'Story 18.1: Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio'
type: 'feature'
created: '2026-10-18'
status: 'done'
baseline_commit: '3ccda4e4dccf34d1b7a9d69a0795f131af9a0347'
context:
  - '_bmad-output/implementation-artifacts/epic-18-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Flashcard Master currently forces users to define a "Target Deck" when creating or editing a Data Source (`data_sources.target_deck`), and displays deck badges on data sources. Semantically, a data source is an immutable knowledge artifact (a book, article, RSS feed, or directory), not a destination flashcard deck. Forcing deck assignment at the source level confuses users, prevents generating multiple distinct decks from the same knowledge source (e.g. "Anatomy - Basic" and "Anatomy - Advanced"), and unnecessarily duplicates deck metadata.

**Approach:** Decouple flashcard decks from data sources by making `data_sources.target_deck` optional and deprecated in SQLite schema and repository layers. Remove "Target Deck" input fields from `AddSourceModal.svelte` and `EditSourceModal.svelte`, and remove deck badges from `SourcesView.svelte`. Make `GenerateStudio.svelte` and Document Inspector the single source of truth where the destination deck is specified, enhanced with an auto-suggesting deck selector dropdown populated from `cardRepo.listDecks()` alongside custom new deck entry.

## Boundaries & Constraints

**Always:**
- Preserve all existing flashcards in the `flashcards` table with their assigned `target_deck` column values untouched.
- Maintain backward compatibility in SQLite: legacy `data_sources` rows with existing `target_deck` strings must continue to load without database errors.
- Ensure `targetDeck` in `CreateDataSourceInput` and `UpdateDataSourceInput` is optional (`z.string().optional()`).
- In `GenerateStudio.svelte` and `GenerationConfigFields.svelte`, provide a smart deck selector allowing users to either pick from existing decks via dropdown or type a new custom deck name.
- In `SourceDocumentInspector.svelte` Configure & Generate modal, provide the destination deck selector defaulting to the user's active studio selection or "Default".
- Retain deck filtering and deck aggregation in `QuestionExplorer.svelte` and `ExportCenter.svelte`.

**Never:**
- Never drop or delete the `flashcards.target_deck` column or clear users' existing card deck assignments.
- Never prevent users from creating a brand new deck on the fly directly in Generate Studio.
- Never require a `--deck` argument when adding data sources via the CLI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Creating source without deck | User adds PDF/URL in `AddSourceModal` | Source is saved with `target_deck` omitted or defaulting to "Default" internally | Validates other required fields |
| Existing legacy source | Database contains source created in Epic 1-17 with `target_deck = 'Neuroscience'` | Loads source successfully without crashing; does not display deck badge in Sources list | Gracefully ignores deck |
| Generate Studio deck suggestion | User focuses target deck input in Generate Studio | Dropdown displays all unique decks currently stored in SQLite (`cardRepo.listDecks()`) | Shows empty list if no cards exist |
| Custom new deck in Studio | User types "Midterm 2026" (not in list) and generates cards | Cards are generated and stored with `target_deck = 'Midterm 2026'` | Trims whitespace, defaults to "Default" if blank |
| CLI source creation | `cli sources add --type web --uri "https://..."` without `--deck` | Command succeeds without complaining about missing deck flag | Deprecates `--deck` flag gracefully |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/schema.sql` -- Make `target_deck` nullable or default in `data_sources` table.
- `packages/core/src/storage/source-repository.ts` -- Make `targetDeck` optional in `CreateDataSourceInput` and `UpdateDataSourceInput`.
- `packages/core/src/storage/card-repository.ts` -- Ensure `listDecks()` returns sorted list of distinct non-empty decks.
- `packages/web/src/server.ts` -- Update `/api/sources` request validation schema so `targetDeck` is optional.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Remove "Target Deck" input field.
- `packages/web/client/src/components/EditSourceModal.svelte` -- Remove "Target Deck" input field.
- `packages/web/client/src/views/SourcesView.svelte` -- Remove deck badge from source card header.
- `packages/web/client/src/views/DashboardView.svelte` -- Remove deck badge from sources list.
- `packages/web/client/src/components/GenerationConfigFields.svelte` -- Add suggestions datalist / dropdown for existing decks.
- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Remove source deck badge; ensure generation modal has deck selector.
- `packages/cli/src/cli.ts` -- Make `--deck` optional on `sources add` command.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/source-repository.ts` -- Update Zod schemas to make `targetDeck` optional on source creation and update.
- [x] `packages/core/src/storage/schema.sql` & `db.ts` -- Verify data source schema permits null/default target deck without regressions.
- [x] `packages/web/src/server.ts` -- Allow source creation without `targetDeck` payload.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` & `EditSourceModal.svelte` -- Remove target deck input fields.
- [x] `packages/web/client/src/views/SourcesView.svelte` & `DashboardView.svelte` -- Remove target deck badges from source cards.
- [x] `packages/web/client/src/components/GenerationConfigFields.svelte` -- Enhance deck selector with existing deck autocomplete options.
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Update generation modal with standalone deck input.
- [x] `packages/cli/src/cli.ts` -- Update CLI `sources add` command to make `--deck` optional.

**Acceptance Criteria:**
- **Given** the Add Source modal in the Web UI,
  - **When** the user adds a new data source (local file, RSS, Web Reader, Notion, or sitemap),
  - **Then** no Target Deck field is displayed or required, and the source persists successfully.
- **Given** the Sources View and Dashboard,
  - **When** viewing existing data sources,
  - **Then** no deck badges are displayed on the data source cards.
- **Given** Generate Studio,
  - **When** configuring flashcard generation parameters,
  - **Then** the user can choose a target deck from an autocomplete dropdown of existing decks or enter a custom deck name.
- **Given** generated flashcards,
  - **When** saved to SQLite,
  - **Then** the cards are assigned the target deck selected in Generate Studio, regardless of which data sources were used.
