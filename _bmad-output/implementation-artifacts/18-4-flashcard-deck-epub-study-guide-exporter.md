---
title: 'Story 18.4: Flashcard Deck EPUB Study Guide Exporter'
type: 'feature'
created: '2026-10-18'
status: 'todo'
context:
  - '_bmad-output/implementation-artifacts/epic-18-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users can currently export their knowledge base documents to EPUB 3.0 (from Epics 13 & 17), but they cannot export their curated flashcard decks to EPUB. Learners who study on dedicated e-ink devices (Kindle, Kobo, Boox) or eBook readers (Apple Books, Calibre) cannot take their generated flashcards on the go in a structured, interactive eBook format. The only offline flashcard exports currently supported are APKG (which requires Anki software), Markdown, PDF, CSV, and TSV.

**Approach:** Implement `EpubFlashcardExporter` in `@flashcard-master/adapters` conforming to `ExporterPort`. Synthesize flashcard decks into a standards-compliant EPUB 3.0 study guide eBook:
1. Format each flashcard into an e-reader friendly layout with clear typography, high contrast, and interactive HTML5 collapsible reveal blocks (`<details class="flashcard"><summary class="card-question">Q: ... (Tap to reveal answer)</summary><div class="card-answer">...</div></details>`).
2. Group cards logically by Deck and Difficulty, with an automated Table of Contents (`nav.xhtml` and `toc.ncx`) enabling seamless jumping between chapters/decks.
3. Include rich card metadata: difficulty badges (Beginner, Intermediate, Advanced), persona tags, verbatim grounding quotes, and exact source locator references.
4. Adhere strictly to the IDPF / W3C EPUB 3.0 specification: uncompressed `mimetype` at byte offset 0 (STORE method), valid OPF manifest, spine, metadata, and container.
5. Expose in `ExportCenter.svelte` under "Curated Flashcard Exports" with a 1-click download button, filterable by target deck, calling `/api/export/epub?deck=...` or `/api/export?format=epub`.
6. Add `--format epub` support to the CLI `flashcards export` command.

## Boundaries & Constraints

**Always:**
- Generate valid EPUB 3.0 packages that pass ePubCheck validation without warnings.
- The first entry in the ZIP container MUST be the uncompressed `mimetype` file with content `application/epub+zip` and compression method 0 (STORE).
- Ensure e-ink readability: high-contrast dark text on clean white backgrounds, readable typography sizes, and no fragile CSS animations.
- Include interactive reveal mode using native HTML5 `<details>` and `<summary>` elements, natively supported by modern e-readers (Apple Books, Kobo, Calibre, Kindle KF8/KFX).
- Allow exporting a single deck or all decks combined into a structured compendium.
- Pull publisher and author metadata from `SettingsService` (`epub_default_author`, `epub_default_publisher`) with clean fallbacks.

**Never:**
- Never omit the answer or source grounding citation from exported cards.
- Never crash on cards containing markdown code fences, math formulas, or HTML special characters; properly escape and format them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Single deck export | User selects deck "Biology 101", clicks EPUB export | Generates `biology-101-flashcards.epub` with cards from that deck | Sets appropriate HTTP MIME headers |
| All decks export | User exports "All Decks" (50 cards across 3 decks) | Creates EPUB with 3 chapters (one per deck), Table of Contents | Renders empty TOC if no cards |
| Interactive reveal | User opens EPUB on Apple Books or Kobo | Tapping the question summary smoothly reveals the answer block | Degrades gracefully on older readers |
| Grounding citations | Card includes `sourceLocator` and `sourceQuote` | Displays citation footnote box under the answer | Hides citation box if quote is empty |
| CLI export command | `cli export --format epub --deck "Medicine" -o "./med.epub"` | Compiles and writes EPUB directly to specified output file path | Validates output path permissions |

</frozen-after-approval>

## Code Map

- `packages/adapters/src/export/epub-flashcard-exporter.ts` -- Implement `EpubFlashcardExporter` class with EPUB 3 packaging, HTML template generation, and ZIP serialization.
- `packages/core/src/ports/index.ts` -- Ensure `ExporterPort` and `ExportFormat` include `"epub"`.
- `packages/core/src/services/export-service.ts` -- Ensure export registry dispatches flashcard export to `epub` exporter.
- `packages/web/src/server.ts` -- Add `/api/export/epub` endpoint supporting `?deck=` query parameter and streaming `application/epub+zip`.
- `packages/web/client/src/views/ExportCenter.svelte` -- Add "EPUB Flashcard eBook" download card with format badge and deck selection.
- `packages/cli/src/cli.ts` -- Add `epub` option to CLI export command.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/adapters/src/export/epub-flashcard-exporter.ts` -- Build `EpubFlashcardExporter` synthesizing cards into interactive EPUB 3.0 packages.
- [ ] `packages/core/src/ports/index.ts` & `export-service.ts` -- Register `EpubFlashcardExporter` in Monorepo ExporterRegistry.
- [ ] `packages/web/src/server.ts` -- Add REST endpoints for downloading flashcard EPUBs.
- [ ] `packages/web/client/src/views/ExportCenter.svelte` -- Implement UI card and download handler for EPUB flashcards.
- [ ] `packages/cli/src/cli.ts` -- Add EPUB format to CLI export flags.
- [ ] `packages/adapters/test/epub-flashcard-exporter.test.ts` -- Write unit tests checking ZIP compression, STORE mimetype, OPF manifest, and card markup.

**Acceptance Criteria:**
- **Given** flashcards in the database,
  - **When** the user clicks "Download EPUB" in Export Center,
  - **Then** the browser downloads a valid `.epub` file named after the selected deck (or `all-decks-flashcards.epub`).
- **Given** the exported EPUB file,
  - **When** inspected with an EPUB validator or ZIP inspection,
  - **Then** the first file is uncompressed `mimetype` (`application/epub+zip`), followed by `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/nav.xhtml`, and chapter files.
- **Given** the eBook viewed in an e-reader (Apple Books, Calibre, Kindle),
  - **When** viewing a flashcard,
  - **Then** the question is displayed with a reveal toggle, and revealing it shows the answer, difficulty tag, and grounding quote.
