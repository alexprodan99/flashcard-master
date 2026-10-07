---
title: 'Story 17.6: UI & CLI Slicing Controls & Monorepo Test Suite'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: a238fe876f6aeb523b0c7b34bcb72bc20354beb7
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users ingesting rich documents (.pdf, .docx) lack user-interface and command-line controls to select slicing modes (semantic outline vs. page budget) or tune chunk thresholds, and discovered subdocuments do not surface their page coordinates in the Document Inspector or Generate Studio.

**Approach:** Expose slicing mode selectors and threshold inputs in `AddSourceModal.svelte` and CLI `sources add` / `sync` commands, propagate options via `api.ts`, render page coordinate badges in `SourceDocumentInspector.svelte` and `GenerateStudio.svelte`, and verify full end-to-end monorepo integration with automated test suites.

## Boundaries & Constraints

**Always:**
- Keep pure-JS constraints: do not add binary native dependencies or C++ bindings.
- Validate file types strictly: accept `.md`, `.markdown`, `.txt`, `.pdf`, `.docx`; reject `.doc` with an explicit human-readable error explaining pre-2007 Word files are unsupported.
- Preserve backward compatibility for sources without slicing (default mode "none" or omitted maintains legacy behavior).
- Ensure all 576+ existing monorepo unit and integration tests remain 100% green without regressions.

**Ask First:**
- Adding additional SQLite schema columns or tables beyond existing schema.
- Changing existing default chunking thresholds (5 pages per chunk, 1500 words per chunk, 200 min section words).

**Never:**
- Never crash or throw unhandled exceptions if a document lacks `startPage` / `endPage` metadata.
- Never block the UI thread during source synchronization or file uploads.
- Never push to `origin` without explicit user request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Legacy .doc drop in UI | User selects or drops `notes.doc` | Banner displays: "Legacy pre-2007 Word (.doc) files are not supported. Please convert to .docx or .pdf before uploading." | Upload is halted; no HTTP request sent |
| Valid PDF/Word upload | User drops `report.pdf` or `notes.docx` | File accepted; auto-populates source name; shows slicing configuration controls | N/A |
| Page budget slicing in UI | Slicing mode = "budget", pagesPerChunk = 5 | POST /api/sync sends `{ slicing: { mode: "budget", pagesPerChunk: 5, wordsPerChunk: 1500 } }` | Falls back to defaults if inputs empty/invalid |
| Outline slicing in UI | Slicing mode = "outline", minChunkWords = 250 | POST /api/sync sends `{ slicing: { mode: "outline", minChunkWords: 250, pagesPerChunk: 5 } }` | Falls back to defaults if inputs empty/invalid |
| Subdocument inspector with page bounds | DiscoveredDocument with `startPage: 14, endPage: 18` | Renders badge `📄 Pages 14-18` alongside word count | If `startPage === endPage`, renders `📄 Page 14` |
| Subdocument inspector without page bounds | DiscoveredDocument with `startPage: null, endPage: null` | Renders standard word count without page badge | Graceful omit; no visual error |
| CLI `sources add` with slicing & sync | `sources add "Book" local "./book.pdf" --slicing-mode outline --sync` | Registers source and immediately triggers ingestion with outline slicing | CLI prints progress and subdocument count |
| CLI `sources docs` display | `sources docs <sourceId>` for sliced source | Formats output showing `Pages: X-Y` or `Page: X` per document | Graceful omit if no page coordinates |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/lib/types.ts` -- Add `startPage?: number | null`, `endPage?: number | null` to `DiscoveredDocument`, export `SlicingMode` and `DocumentSlicingOptions`.
- `packages/web/client/src/lib/api.ts` -- Update `syncSource` and `syncAllSources` to accept optional `{ slicing?: DocumentSlicingOptions }` and transmit in POST JSON body.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Expand file dropzone accept list to `.md,.markdown,.txt,.pdf,.docx`, reject `.doc`, add Slicing Mode selector (`outline`, `budget`, `none`) with chunk threshold inputs, and support immediate sync on creation.
- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Render page range badges (`📄 Pages X-Y` or `📄 Page X`) in document cards.
- `packages/web/client/src/views/GenerateStudio.svelte` -- Render page range badges in source document selection accordion and document inspector modal.
- `packages/cli/src/cli.ts` -- Add `--slicing-mode`, `--pages-per-chunk`, `--words-per-chunk`, `--min-chunk-words`, and `--sync` options to `sources add` and `sync` commands; format page ranges in `sources docs`.
- `packages/cli/test/cli.test.ts` -- Add unit tests for CLI slicing flags, sync execution, and page range formatting.
- `packages/web/test/client-stores.test.ts` -- Add tests verifying slicing option structures and page bound preservation.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/lib/types.ts` -- Add `startPage` and `endPage` to `DiscoveredDocument` and export `DocumentSlicingOptions` and `SlicingMode` -- Ensure types match core domain models.
- [x] `packages/web/client/src/lib/api.ts` -- Add `options?: { slicing?: DocumentSlicingOptions }` to `syncSource` and `syncAllSources` and forward in POST payload -- Ensure backend receives slicing configuration.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Add PDF/DOCX file dropzone support, reject `.doc`, add Slicing Mode radio/dropdown with page & word threshold inputs, and trigger sync on submit -- Provide rich document onboarding UI.
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Add page range badges to document catalog cards -- Surface PDF/DOCX subdocument coordinates.
- [x] `packages/web/client/src/views/GenerateStudio.svelte` -- Add page range badges to document items in scope selector tray -- Enable targeted subdocument card generation with visual coordinates.
- [x] `packages/cli/src/cli.ts` -- Add slicing options (`--slicing-mode`, `--pages-per-chunk`, `--words-per-chunk`, `--min-chunk-words`, `--sync`) to `sources add` and `sync`, and render page bounds in `sources docs` -- Complete CLI interface parity.
- [x] `packages/cli/test/cli.test.ts` -- Add test cases covering `sources add` with slicing flags and `sources docs` page range rendering -- Verify CLI functionality without regressions.
- [x] `packages/web/test/client-stores.test.ts` -- Add test cases for client types, API serialization, and page metadata handling -- Verify web client integration.
- [x] Run full monorepo validation (`npm test`, `npm run lint`, `npm run typecheck`) -- Ensure 100% green suite across monorepo packages.

**Acceptance Criteria:**
- Given `AddSourceModal.svelte`, when selecting `.pdf` or `.docx`, then the file is accepted and slicing controls (outline, budget, none) appear with threshold inputs.
- Given `AddSourceModal.svelte`, when selecting a legacy `.doc` file, then an explicit rejection message appears and upload is prevented.
- Given `SourceDocumentInspector.svelte` and `GenerateStudio.svelte`, when documents have `startPage` and `endPage`, then page range badges (`📄 Pages X-Y` or `📄 Page X`) are displayed.
- Given the CLI, when running `sources add <name> local <path> --slicing-mode outline --sync`, then the source is registered and synced with outline slicing.
- Given the CLI, when running `sources docs <sourceId>`, then page coordinates are printed for subdocuments with page bounds.
- Given the entire monorepo, when executing `npm test`, then all test suites pass with zero regressions.

## Spec Change Log

- 2026-10-07: Completed all tasks for Story 17.6. Implemented UI slicing controls, .doc rejection banner, page badge formatting in SourceDocumentInspector and GenerateStudio, CLI flags for slicing and sync, and comprehensive test suite across web and cli packages. All 583 tests passing.

## Design Notes

- In `AddSourceModal.svelte`, slicing options are only shown when `type === 'local'` (or can default to collapsed for other types). Default mode for local files is `outline` with fallback `pagesPerChunk: 5`, `wordsPerChunk: 1500`, and `minChunkWords: 200`.
- Page badge formatting helper:
  `doc.startPage != null ? (doc.endPage != null && doc.endPage !== doc.startPage ? \`Pages ${doc.startPage}-${doc.endPage}\` : \`Page ${doc.startPage}\`) : null`
- CLI Commander options parse numeric string flags into numbers before passing to `ingestionService.syncSource(sourceId, { slicing })`.

## Verification

**Commands:**
- `npm test` -- expected: All unit & integration tests pass across all packages (core, adapters, web, cli).
- `npm run typecheck` -- expected: TypeScript compiles with 0 errors across monorepo.
- `npm run lint` -- expected: Lint checks pass cleanly.


## Suggested Review Order

**UI Slicing & Format Controls**

- File picker accepts PDF/Word; early rejection of legacy .doc with custom alert banner.
  [`AddSourceModal.svelte:72`](../../packages/web/client/src/components/AddSourceModal.svelte#L72)

- Slicing mode radio selector with clamped page and word threshold inputs.
  [`AddSourceModal.svelte:46`](../../packages/web/client/src/components/AddSourceModal.svelte#L46)

- Triggers background sync with configured slicing options upon source creation.
  [`AddSourceModal.svelte:204`](../../packages/web/client/src/components/AddSourceModal.svelte#L204)

**Subdocument Page Coordinates & Display**

- Shared page range badge formatter with multi-page and single-page bounds handling.
  [`formatters.ts:7`](../../packages/web/client/src/lib/formatters.ts#L7)

- Subdocument page coordinate badge rendered in source document catalog card.
  [`SourceDocumentInspector.svelte:390`](../../packages/web/client/src/components/SourceDocumentInspector.svelte#L390)

- Page range badges displayed in Generate Studio document selection tray item rows.
  [`GenerateStudio.svelte:870`](../../packages/web/client/src/views/GenerateStudio.svelte#L870)

- Styled cyan page pill in reader preview modal header.
  [`DocumentPreviewModal.svelte:175`](../../packages/web/client/src/components/DocumentPreviewModal.svelte#L175)

**CLI Slicing Controls & Validation**

- CLI options for slicing modes, threshold inputs, validation, and warning if sync omitted.
  [`cli.ts:134`](../../packages/cli/src/cli.ts#L134)

- Slicing options and mode validation for standalone CLI sync command.
  [`cli.ts:348`](../../packages/cli/src/cli.ts#L348)

- Formats and displays document page coordinates in CLI source document listings.
  [`cli.ts:241`](../../packages/cli/src/cli.ts#L241)

**Types & Verification Suite**

- DiscoveredDocument page metadata and DocumentSlicingOptions interface types.
  [`types.ts:28`](../../packages/web/client/src/lib/types.ts#L28)

- Unit tests for CLI slicing flags, sync execution, and invalid mode rejection.
  [`cli.test.ts:338`](../../packages/cli/test/cli.test.ts#L338)

- Client tests verifying page badge formatting rules and API payload transmission.
  [`client-stores.test.ts:972`](../../packages/web/test/client-stores.test.ts#L972)
