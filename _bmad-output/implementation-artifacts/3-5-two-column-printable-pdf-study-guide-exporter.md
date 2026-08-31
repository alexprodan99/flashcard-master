---
title: 'Story 3.5: Two-Column Printable Study Guide & PDF Exporter'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: '47f14559b3ce05e3c5f752068cc03eb333d0e8ab'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/3-4-active-recall-collapsible-markdown-exporter.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners who prefer physical flashcard studying, offline review, or paper exams need a print-ready two-column study sheet (Questions on the left, Answers and Citations on the right with a dotted fold-over guide line) with dedicated `@media print` CSS page-break handling (FR-304, AD-6).

**Approach:** Implement `HtmlStudyGuideExporter` in `packages/adapters/src/export/html-study-guide-exporter.ts` producing standalone HTML5 documents with responsive two-column grid layouts, dashed fold lines for self-testing, and `@media print` CSS page-break optimization conforming to `ExporterPort` (`format: "html"`).

## Boundaries & Constraints

**Always:**
- Generate valid, self-contained HTML5 documents with inline CSS (zero external network CDN dependencies).
- Include dedicated `@media print` rules: A4/Letter sizing, ink-saving high-contrast colors, and `page-break-inside: avoid` on card rows.
- Format cards in two equal columns: Left = Question + Tags + Difficulty; Right = Answer + Verbatim Citation.
- Render a vertical dotted fold line between columns to enable physical fold-over active recall studying.
- Save to `options.outputPath` when supplied.
- Conforming strictly to `ExporterPort`.

**Ask First:**
- Adding headless Chromium PDF binary generation (Puppeteer / Playwright) in v1 (standalone HTML with browser print-to-PDF / CSS print media is standard zero-dependency implementation for v1).

**Never:**
- Include external fonts or scripts that break in offline environments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Card List | Array of valid cards | Valid self-contained HTML5 study sheet with inline CSS | N/A |
| Print Mode | User triggers `window.print()` / browser print | Clean two-column layout with dotted fold line and avoid-break rows | N/A |
| Special Characters | Cards with `<script>`, `&`, `<` | Safely escaped HTML in question and answer columns | N/A |
| Empty Card List | `cards: []` | Clean HTML document indicating 0 cards with `successCount: 0` | N/A |
| Output Path Provided | `outputPath: "guide.html"` | Writes HTML string to file system | Handles missing parent dirs |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`
- `packages/core/src/ports/index.ts` -- `ExporterPort`, `ExportOptions`, `ExportResult`
- `packages/adapters/src/export/html-study-guide-exporter.ts` -- `HtmlStudyGuideExporter` implementation
- `packages/adapters/src/index.ts` -- Export `HtmlStudyGuideExporter`
- `packages/adapters/test/html-study-guide-exporter.test.ts` -- Unit tests validating HTML structure, inline CSS, print media queries, and disk output

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/export/html-study-guide-exporter.ts` -- Implement `HtmlStudyGuideExporter` (two-column layout, dotted fold line, `@media print` styles, disk output)
- [x] `packages/adapters/src/index.ts` -- Export `HtmlStudyGuideExporter`
- [x] `packages/adapters/test/html-study-guide-exporter.test.ts` -- Unit tests covering HTML structure, print media queries, HTML escaping, and file writing

**Acceptance Criteria:**
- **Given** flashcards
- **When** `HtmlStudyGuideExporter.export(cards)` is called
- **Then** a self-contained HTML5 study guide is produced containing two-column layout, fold guide, and print CSS.
- **Given** an output path
- **When** export is executed
- **Then** the HTML file is written directly to disk.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter unit tests pass.
- `npm run build` -- expected: All monorepo packages compile cleanly.



## Suggested Review Order

**Printable Two-Column Study Guide Exporter**

- Self-contained HTML5 template with two-column layout, fold-over dotted line, and @media print CSS
  [packages/adapters/src/export/html-study-guide-exporter.ts#L1](../../packages/adapters/src/export/html-study-guide-exporter.ts#L1)

**Unit Test Suite**

- Unit tests validating HTML5 document structure, print CSS media queries, HTML escaping, and file writing
  [packages/adapters/test/html-study-guide-exporter.test.ts#L1](../../packages/adapters/test/html-study-guide-exporter.test.ts#L1)
