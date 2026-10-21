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

- `packages/core/src/domain/models.ts` -- Removed `targetDeck` completely from `DataSourceSchema` and `DataSource` type.
- `packages/core/src/storage/schema.sql` -- Removed `target_deck` column from `data_sources` table.
- `packages/core/src/storage/db.ts` -- Removed `target_deck` column from `SCHEMA_SQL` and added automatic migration dropping `target_deck` from existing `data_sources` tables.
- `packages/core/src/storage/source-repository.ts` -- Removed `targetDeck` from `CreateSourceInputSchema`, `UpdateSourceInputSchema`, row mapping, inserts, and updates.
- `packages/core/src/storage/card-repository.ts` -- Retained `targetDeck` on `flashcards` and ensured `listDecks()` returns sorted list of distinct non-empty decks.
- `packages/web/src/server.ts` -- Removed `targetDeck` from source templates, decoupled card generation fallback from sources, and integrated `/api/decks`.
- `packages/web/client/src/lib/types.ts` -- Removed `targetDeck` from `DataSource` interface.
- `packages/web/client/src/lib/api.ts` -- Added `fetchDecks()` and removed `targetDeck` from `createSource()`.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Removed "Target Deck" input field and payload.
- `packages/web/client/src/components/EditSourceModal.svelte` -- Removed "Target Deck" input field and payload.
- `packages/web/client/src/views/SourcesView.svelte` -- Removed deck badge and column from source table.
- `packages/web/client/src/views/DashboardView.svelte` -- Removed deck badge from sources list.
- `packages/web/client/src/components/GenerationConfigFields.svelte` -- Added suggestions datalist / dropdown for existing decks.
- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Removed source deck badge; defaulted generation modal to active studio deck.
- `packages/cli/src/cli.ts` -- Removed `--deck` option from `sources add` and removed deck prompt from `init` onboarding wizard.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Remove `targetDeck` from `DataSourceSchema`.
- [x] `packages/core/src/storage/source-repository.ts` -- Remove `targetDeck` from Zod schemas, row mapping, and SQL operations.
- [x] `packages/core/src/storage/schema.sql` & `db.ts` -- Remove `target_deck` column and provide automatic column drop migration for existing databases.
- [x] `packages/web/src/server.ts` -- Decouple generation target deck routing from parent sources.
- [x] `packages/web/client/src/lib/types.ts` & `api.ts` -- Remove `targetDeck` from client DataSource types and APIs.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` & `EditSourceModal.svelte` -- Remove target deck input fields.
- [x] `packages/web/client/src/views/SourcesView.svelte` & `DashboardView.svelte` -- Remove target deck badges from source cards.
- [x] `packages/web/client/src/components/GenerationConfigFields.svelte` -- Enhance deck selector with existing deck autocomplete options.
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Update generation modal with standalone deck input.
- [x] `packages/cli/src/cli.ts` -- Remove `--deck` option from `sources add` and interactive `init`.

**Acceptance Criteria:**
- **Given** the Add Source modal in the Web UI,
  - **When** the user adds a new data source (local file, RSS, Web Reader, Notion, or sitemap),
  - **Then** no Target Deck field is displayed or required, and the source persists successfully without any deck property.
- **Given** the Sources View and Dashboard,
  - **When** viewing existing data sources,
  - **Then** no deck badges or deck columns are displayed on data source cards or tables.
- **Given** Generate Studio,
  - **When** configuring flashcard generation parameters,
  - **Then** the user chooses the target deck from an autocomplete dropdown of existing decks or enters a custom deck name.
- **Given** generated flashcards,
  - **When** saved to SQLite,
  - **Then** the cards are assigned the target deck selected in Generate Studio, regardless of which data sources were used.

