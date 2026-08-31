---
title: 'Story 3.6: Scoped Query & Filtered Export Engine'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: '80fac5d3c55257e43d445a8dcbd1f22d77addb2d'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/3-5-two-column-printable-pdf-study-guide-exporter.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Applications (CLI, Web UI) need a single, unified export coordinator that can query cards by multi-attribute scopes (deck, tag, difficulty, source), negotiate requested formats (`apkg`, `ankiconnect`, `csv`, `tsv`, `markdown`, `html`), and execute batch deck exports (FR-305, FR-306, AD-6).

**Approach:** Implement `ExporterRegistry` and `ExportService` in `packages/core/src/services/` providing format registration, format discovery, query-scoped card retrieval from `FlashcardRepository`, format negotiation, and per-deck batch exports with error isolation.

## Boundaries & Constraints

**Always:**
- Manage exporter implementations through `ExporterRegistry`.
- Support filtering by `targetDeck`, `sourceId`, `difficulty`, and `tag` via `FlashcardRepository`.
- Support multi-deck batch export (`exportAllDecks`) with automated filename generation.
- Throw `UnsupportedExportFormatError` with available format list if an unknown format is requested.
- Conforming to Hexagonal architecture: `packages/core` defines ports and orchestration, while adapters plug into the registry.

**Ask First:**
- Adding background scheduled recurring auto-export jobs (planned for CLI automation).

**Never:**
- Hardcode adapter-specific formatting logic in `packages/core`. All format serialization must delegate to `ExporterPort`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scoped Export by Tag | `format: "csv", filter: { tag: "raft" }` | Exports only cards tagged with "raft" | N/A |
| Scoped Export by Deck | `format: "markdown", filter: { targetDeck: "Databases" }` | Exports cards in "Databases" deck | N/A |
| Export All Decks | `format: "apkg", outputDir: "./exports"` | Iterates distinct decks, exports each deck to separate file | N/A |
| Unknown Format | `format: "docx"` | Throws error listing available formats | `UnsupportedExportFormatError` |
| Zero Matching Cards | Filter matches 0 cards | Calls exporter with empty card array | Returns `successCount: 0` |

</frozen-after-approval>

## Code Map

- `packages/core/src/ports/index.ts` -- `ExporterPort`, `ExportOptions`, `ExportResult`
- `packages/core/src/storage/card-repository.ts` -- `FlashcardRepository`, `CardFilter`
- `packages/core/src/services/exporter-registry.ts` -- `ExporterRegistry`
- `packages/core/src/services/export-service.ts` -- `ExportService` coordinator
- `packages/core/src/index.ts` -- Export `ExporterRegistry`, `ExportService`, `UnsupportedExportFormatError`
- `packages/core/test/export-service.test.ts` -- Unit tests for scoped filtering, format negotiation, unknown format errors, and all-deck batch exports

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/exporter-registry.ts` -- Implement `ExporterRegistry`
- [x] `packages/core/src/services/export-service.ts` -- Implement `ExportService` (scoped export, format negotiation, all-decks batch export)
- [x] `packages/core/src/index.ts` -- Export registry, service, and domain errors
- [x] `packages/core/test/export-service.test.ts` -- Unit tests verifying scoped filtering, registry integration, unknown format errors, and batch deck exports

**Acceptance Criteria:**
- **Given** a requested format and card filter
- **When** `ExportService.export({ format, filter })` is called
- **Then** only matching cards are retrieved from `FlashcardRepository` and passed to the registered exporter.
- **Given** an unregistered format
- **When** `ExportService.export({ format: "unknown" })` is called
- **Then** `UnsupportedExportFormatError` is thrown detailing available formats.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All core unit tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Export Service & Registry**

- Format registry and negotiation
  [packages/core/src/services/exporter-registry.ts#L1](../../packages/core/src/services/exporter-registry.ts#L1)

- Scoped query execution, deck iteration, and error handling
  [packages/core/src/services/export-service.ts#L1](../../packages/core/src/services/export-service.ts#L1)

**Unit Test Suite**

- Unit tests validating format discovery, scoped card queries, unknown format errors, and batch deck exports
  [packages/core/test/export-service.test.ts#L1](../../packages/core/test/export-service.test.ts#L1)
