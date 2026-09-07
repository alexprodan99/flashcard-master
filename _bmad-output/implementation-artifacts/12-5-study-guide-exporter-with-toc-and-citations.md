---
title: 'Study Guide Knowledge Base Exporter with TOC & Citations'
type: 'feature'
created: '2026-09-05'
status: 'done'
baseline_commit: '1b2983b'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Study guides exported to HTML and Markdown lack an interactive Table of Contents (TOC) and comprehensive source citations linking back to original web documents. In large decks generated from multiple crawled articles or web sources, learners have difficulty navigating topics and verifying card statements against original sources.

**Approach:** Enhance `HtmlStudyGuideExporter` and `MarkdownExporter` in `@flashcard-master/adapters` to generate structured, interactive Tables of Contents with jump anchors, group cards by document source/deck, and render rich source citations with verbatim quotes and clickable origin URL links.

## Boundaries & Constraints

**Always:**
- Generate an interactive Table of Contents (TOC) with jump anchors linking directly to individual cards.
- Group cards in the TOC hierarchically by source document title or target deck when available.
- Render verbatim source quotes (`sourceQuote`) and clickable origin URLs (`sourceOriginUrl`) with document title labels.
- Provide configuration toggles (`includeToc`, `includeCitations`, `includeFoldGuide`, `includeBadges`) with sane defaults (`true`).
- Ensure HTML exports remain completely self-contained (zero external CSS/JS dependencies) and print-ready.
- Ensure Markdown exports remain standard GitHub Flavored Markdown (GFM) compatible.

**Never:**
- Never crash on missing or null metadata (`sourceOriginUrl`, `documentTitle`, `sourceQuote`, `tags`).
- Never introduce external network script/font dependencies into the exported HTML.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HTML Export with TOC | List of 5 cards across 2 documents | Interactive `<nav class="table-of-contents">` with document groupings and `#card-N` links | Graceful fallback if no doc titles |
| Markdown Export with TOC | List of 3 cards | `## 📑 Table of Contents` with anchor links `- [Card 1: Question](#card-1)` | Escapes markdown syntax |
| Citation with URL & Title | Card with `sourceOriginUrl` and `documentTitle` | Clickable anchor `📖 Reference: <a href="url">Title ↗</a>` | Validates/escapes URL & title |
| Citation with URL only | Card with `sourceOriginUrl` without `documentTitle` | Clickable anchor `📖 Reference: <a href="url">url ↗</a>` | Validates/escapes URL |
| Citation with Title only | Card with `documentTitle` without `sourceOriginUrl` | Text display `📖 Reference: Title` | Escapes title |
| TOC Disabled via Option | `options.includeToc = false` | Exporter omits TOC section completely | Clean rendering |
| Citations Disabled via Option | `options.includeCitations = false` | Exporter omits citation callouts | Clean rendering |
| Empty Card Set | `cards = []` | Valid export structure indicating 0 flashcards | Returns 0 success count |

</frozen-after-approval>

## Code Map

- `packages/core/src/ports/index.ts` -- Add `includeToc?: boolean`, `includeCitations?: boolean`, `includeFoldGuide?: boolean`, `includeBadges?: boolean` to `ExportOptions`.
- `packages/adapters/src/export/html-study-guide-exporter.ts` -- Implement Table of Contents generator, anchor IDs, sanitized origin links, decoupled citations, and print stylesheet updates.
- `packages/adapters/src/export/markdown-exporter.ts` -- Implement Markdown Table of Contents generator, anchor tags, decoupled citation references with angle-bracket hyperlinks and bracket escaping.
- `packages/cli/src/cli.ts` -- Expose `--no-toc`, `--no-citations`, and `--no-fold-guide` flags on CLI export command.
- `packages/adapters/test/html-study-guide-exporter.test.ts` -- Unit tests for HTML TOC, anchors, citations, security sanitization, and print styles.
- `packages/adapters/test/markdown-exporter.test.ts` -- Unit tests for Markdown TOC, anchors, citations, bracket escaping, and frontmatter.
- `packages/cli/test/cli.test.ts` -- Integration tests for CLI study guide export flags.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/ports/index.ts` -- Update `ExportOptions` interface with `includeToc?: boolean`, `includeCitations?: boolean`, `includeFoldGuide?: boolean`, `includeBadges?: boolean`.
- [x] `packages/adapters/src/export/html-study-guide-exporter.ts` -- Implement TOC grouping, card jump anchors, conditional back-to-top links, semantic headings, URL sanitization, and rich citation links.
- [x] `packages/adapters/src/export/markdown-exporter.ts` -- Implement GFM TOC grouping, card jump anchors, TOC anchor tag, bracket escaping, angle-bracket links, and rich citation links.
- [x] `packages/cli/src/cli.ts` -- Add `--no-toc`, `--no-citations`, `--no-fold-guide` CLI flags.
- [x] `packages/adapters/test/html-study-guide-exporter.test.ts` -- Expand test coverage for TOC, security sanitization, and citation links.
- [x] `packages/adapters/test/markdown-exporter.test.ts` -- Expand test coverage for TOC, link protection, and citation links.
- [x] `packages/cli/test/cli.test.ts` -- Expand test coverage for CLI export flags.

**Acceptance Criteria:**
- Given a list of flashcards generated from web sources with source quotes and origin URLs
- When exported to HTML study guide
- Then the HTML contains an interactive Table of Contents with jump links to cards and clickable origin citation links.
- When exported to Markdown study guide
- Then the Markdown contains a `# Table of Contents` section with jump links to cards and clickable citation links.

## Verification

**Commands:**
- `npm run build` -- PASS: All packages compile cleanly with 0 TypeScript errors.
- `npm test -w @flashcard-master/adapters` -- PASS: 70/70 adapter tests pass.
- `npm test -w @flashcard-master/cli` -- PASS: 5/5 CLI tests pass.
- `npm test` -- PASS: 166/166 monorepo tests pass.
