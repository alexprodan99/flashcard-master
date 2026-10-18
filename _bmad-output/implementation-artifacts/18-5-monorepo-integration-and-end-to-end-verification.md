---
title: 'Story 18.5: Monorepo Integration & End-to-End Verification'
type: 'feature'
created: '2026-10-18'
status: 'todo'
context:
  - '_bmad-output/implementation-artifacts/epic-18-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 18 touches foundational boundaries across all monorepo packages: SQLite data source schemas, settings repositories, AnkiConnect adapters, EPUB file ingestion, chapter slicing, flashcard EPUB synthesis, and Web UI views (SourcesView, GenerateStudio, SettingsView, ExportCenter). We must guarantee that all new capabilities work together harmoniously, that legacy data source rows load without errors, and that the entire monorepo remains strictly type-safe with passing regression tests.

**Approach:** Implement comprehensive integration and unit tests covering:
1. **Deck Decoupling & Ingestion:** Adding sources without `targetDeck`, loading historical database records with `target_deck`, generating cards in Generate Studio with custom decks, and verifying card deck retention.
2. **Centralized Settings & AnkiConnect:** Verifying `SettingsService` hierarchical fallback chain (`SQLite -> process.env -> Default`), REST endpoints (`/api/settings/general`), and live AnkiConnect health check API.
3. **EPUB Ingestion Pipeline:** Parsing EPUB 2.0 and EPUB 3.0 fixtures, extracting chapters in spine order, converting XHTML to Markdown, storing embedded media in `MediaService`, and slicing chapters into Document Catalog subdocuments.
4. **Flashcard EPUB Publishing:** Generating card EPUBs, testing ZIP compression invariants (STORE mimetype at offset 0), validating navigation and interactive reveal markup.
5. **Monorepo Build & Lint Gate:** Verifying that `npm test`, `npm run lint`, and `npm run typecheck` execute cleanly with zero errors across all workspaces.

## Boundaries & Constraints

**Always:**
- Run complete monorepo test suite across `@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/web`, and `@flashcard-master/cli`.
- Clean up all temporary files, directories, and mock SQLite databases created during testing.
- Maintain 100% type safety with zero TypeScript errors under strict mode.

**Never:**
- Never skip tests or silence linter warnings with arbitrary `@ts-ignore` or `eslint-disable` annotations.
- Never commit broken mock fixtures or leave zombie worker threads running after test runs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Full pipeline regression | Run `npm test` across monorepo | All test suites pass (core, adapters, web, cli) | Pinpoints any regression |
| Typecheck validation | Run `npm run typecheck` | TypeScript compiler reports 0 errors | Enforces strict types |
| Linter validation | Run `npm run lint` | ESLint reports 0 errors or warnings | Enforces clean styling |

</frozen-after-approval>

## Code Map

- `packages/core/test/source-repository.test.ts` -- Verify data source creation without `targetDeck` and backward compatibility.
- `packages/core/test/settings-service.test.ts` -- Verify general settings retrieval, updates, and env variable fallback.
- `packages/adapters/test/epub-parser.test.ts` -- Verify EPUB 2/3 parsing, spine ordering, and media extraction.
- `packages/adapters/test/epub-flashcard-exporter.test.ts` -- Verify EPUB 3 flashcard compilation and formatting.
- `packages/web/test/server.test.ts` -- Verify new settings endpoints, EPUB upload endpoints, and EPUB export endpoints.
- `packages/web/test/client-stores.test.ts` -- Verify settings store and deck selector reactive states.

## Tasks & Acceptance

**Execution:**
- [ ] Add unit tests for `source-repository` verifying optional `targetDeck`.
- [ ] Add unit tests for `settings-service` verifying general settings and Anki resolution.
- [ ] Add unit and integration tests for `EpubParser` in `adapters`.
- [ ] Add unit tests for `EpubFlashcardExporter` in `adapters`.
- [ ] Add server integration tests for `/api/settings/general`, `/api/settings/anki/test`, and `/api/export/epub`.
- [ ] Run `npm run lint` and verify zero errors.
- [ ] Run `npm run typecheck` and verify zero errors.
- [ ] Run `npm test` across all monorepo packages.

**Acceptance Criteria:**
- **Given** the monorepo test suite,
  - **When** running `npm test`,
  - **Then** all test suites across `core`, `adapters`, `web`, and `cli` pass cleanly.
- **Given** static analysis checks,
  - **When** executing `npm run lint` and `npm run typecheck`,
  - **Then** zero errors and warnings are emitted.
