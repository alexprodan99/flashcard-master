---
title: 'Story 3.3: Delimited CSV & TSV Exporter'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '2192a4a122a966a814671be282bf40e26471cbac'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/3-2-desktop-ankiconnect-live-sync-client.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners need to export generated flashcards into third-party study tools (Quizlet, Brainscape, Notion, Spreadsheets) that accept delimited plain text files (CSV / TSV) with RFC 4180 compliant escaping (FR-303).

**Approach:** Implement `DelimitedExporter` in `packages/adapters/src/export/delimited-exporter.ts` supporting configurable delimiters (comma `,` or tab `\t`), RFC 4180 quotation and newline escaping, customizable column headers, tag serialization, and direct file output conforming to `ExporterPort`.

## Boundaries & Constraints

**Always:**
- Conform to RFC 4180 CSV standard: fields containing the delimiter, double quotes, or newlines must be enclosed in double quotes, with internal quotes escaped as `""`.
- Provide `CsvExporter` (`format: "csv"`, comma-delimited) and `TsvExporter` (`format: "tsv"`, tab-delimited).
- Support standard columns: `Front`, `Back`, `Tags`, `Source Quote`, `Difficulty`, `Deck`.
- Support configurable `includeHeaders` (defaults to `true`).
- Write output to `options.outputPath` when supplied.
- Conforming strictly to `ExporterPort`.

**Ask First:**
- Adding custom column order or user-defined column mappings (v1 includes standard columns).

**Never:**
- Generate malformed unescaped CSV lines when cards contain commas, quotation marks, or multiline answers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Card List | Array of valid cards | Valid CSV string with headers and escaped rows | N/A |
| TSV Export | `TsvExporter.export(cards)` | Tab-delimited plain text string | N/A |
| Multi-line / Quote content | Question with `"quotes"` and `\n` | Properly escaped as `"""quotes"""` with enclosing quotes | RFC 4180 |
| Empty Card List | `cards: []` | Returns header-only row or empty string with `successCount: 0` | N/A |
| Output Path Provided | `outputPath: "cards.csv"` | Writes UTF-8 string to file system | Handles missing parent dirs |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`
- `packages/core/src/ports/index.ts` -- `ExporterPort`, `ExportOptions`, `ExportResult`
- `packages/adapters/src/export/delimited-exporter.ts` -- `DelimitedExporter`, `CsvExporter`, `TsvExporter`
- `packages/adapters/src/index.ts` -- Export CSV & TSV exporters
- `packages/adapters/test/delimited-exporter.test.ts` -- Unit tests verifying comma, tab, quote escaping, multiline handling, and file output

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/export/delimited-exporter.ts` -- Implement `DelimitedExporter`, `CsvExporter`, `TsvExporter` (RFC 4180 escaping, headers, file output)
- [x] `packages/adapters/src/index.ts` -- Export `DelimitedExporter`, `CsvExporter`, `TsvExporter`
- [x] `packages/adapters/test/delimited-exporter.test.ts` -- Unit tests covering CSV and TSV output, RFC 4180 escaping, and disk writing

**Acceptance Criteria:**
- **Given** flashcards containing quotes, commas, and newlines
- **When** `CsvExporter.export(cards)` is called
- **Then** RFC 4180 compliant CSV string is generated with all special characters correctly escaped.
- **Given** flashcards
- **When** `TsvExporter.export(cards)` is called
- **Then** tab-delimited text is generated.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter unit tests pass.
- `npm run build` -- expected: All packages compile cleanly.



## Suggested Review Order

**Delimited Exporters (CSV & TSV)**

- RFC 4180 quotation and delimiter escaping, header toggling, and file writing
  [packages/adapters/src/export/delimited-exporter.ts#L1](../../packages/adapters/src/export/delimited-exporter.ts#L1)

**Unit Test Suite**

- Unit tests validating comma/tab formatting, quote escaping, multiline field handling, and disk output
  [packages/adapters/test/delimited-exporter.test.ts#L1](../../packages/adapters/test/delimited-exporter.test.ts#L1)
