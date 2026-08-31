---
title: 'Story 3.4: Active Recall Collapsible Markdown Exporter'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'f700fd030a0e5bd8d674952be264f478ccf1cdf3'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/3-3-delimited-csv-tsv-exporter.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners who organize their knowledge bases in tools like Obsidian, Logseq, or GitHub need human-readable study sheets in standard Markdown that support interactive self-testing through collapsible active-recall sections and citation blockquotes (FR-304).

**Approach:** Implement `MarkdownExporter` in `packages/adapters/src/export/markdown-exporter.ts` formatting cards into Obsidian- and GitHub-compatible Markdown with YAML frontmatter, interactive `<details>` collapsible answer blocks, difficulty/tag badges, and verbatim citation callouts conforming to `ExporterPort`.

## Boundaries & Constraints

**Always:**
- Format interactive answers using HTML `<details><summary>` blocks compatible with Obsidian, GitHub Flavored Markdown, and static site generators.
- Include YAML frontmatter header (deck name, total cards, tags, generated date).
- Display metadata badges (tags, difficulty level, persona used).
- Format citations in standard markdown callouts or blockquotes.
- Write output to `options.outputPath` when supplied.
- Conforming strictly to `ExporterPort` (`format: "markdown"`).

**Ask First:**
- Adding LaTeX math block preservation options (v1 preserves all inline/block markdown as written).

**Never:**
- Output raw unescaped markdown syntax that breaks `<details>` rendering.
- Require external plugins to read or collapse answers in standard Markdown viewers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Card List | Array of valid cards | Formatted Markdown with YAML frontmatter and collapsible sections | N/A |
| Multi-line Answer / Quotes | Answer with multiple paragraphs and quotes | Cleanly blockquoted inside `<details>` block | N/A |
| Missing Citations / Tags | Cards without tags or quotes | Cleanly omits citation callout without formatting artifacts | N/A |
| Empty Card List | `cards: []` | Markdown header indicating 0 cards with `successCount: 0` | N/A |
| Output Path Provided | `outputPath: "deck.md"` | Writes UTF-8 markdown file to disk | Handles missing parent dirs |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`
- `packages/core/src/ports/index.ts` -- `ExporterPort`, `ExportOptions`, `ExportResult`
- `packages/adapters/src/export/markdown-exporter.ts` -- `MarkdownExporter` implementation
- `packages/adapters/src/index.ts` -- Export `MarkdownExporter`
- `packages/adapters/test/markdown-exporter.test.ts` -- Unit tests validating YAML frontmatter, `<details>` blocks, citation styling, and disk writing

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/export/markdown-exporter.ts` -- Implement `MarkdownExporter` (YAML frontmatter, `<details>` active recall blocks, citation callouts, disk writing)
- [x] `packages/adapters/src/index.ts` -- Export `MarkdownExporter`
- [x] `packages/adapters/test/markdown-exporter.test.ts` -- Unit tests covering YAML frontmatter, collapsible blocks, citations, and file output

**Acceptance Criteria:**
- **Given** an array of flashcards
- **When** `MarkdownExporter.export(cards)` is called
- **Then** a clean Markdown document is generated with YAML frontmatter, interactive `<details>` tags for active recall, and citation callouts.
- **Given** `outputPath` option
- **When** export is called
- **Then** the markdown file is saved to disk at the specified location.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter unit tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Markdown Active Recall Exporter**

- YAML frontmatter generator, <details><summary> active recall blocks, and citation callouts
  [packages/adapters/src/export/markdown-exporter.ts#L1](../../packages/adapters/src/export/markdown-exporter.ts#L1)

**Unit Test Suite**

- Unit tests validating frontmatter, collapsible sections, citation blocks, and disk writing
  [packages/adapters/test/markdown-exporter.test.ts#L1](../../packages/adapters/test/markdown-exporter.test.ts#L1)
