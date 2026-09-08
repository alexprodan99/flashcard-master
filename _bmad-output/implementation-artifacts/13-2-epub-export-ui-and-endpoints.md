---
title: 'EPUB Export UI Integration & Streaming Endpoints'
type: 'feature'
created: '2026-09-07'
status: 'done'
baseline_commit: 'b4c42ba59ea335977b1200dd5df08b5dde97f3f8'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-13-context.md
  - _bmad-output/implementation-artifacts/13-1-epub-ebook-export-engine.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Although the backend export engine can produce EPUB eBook buffers (Story 13.1), the web application lacks an HTTP streaming endpoint for `.epub` files and `<DocumentExportModal.svelte>` does not offer EPUB as an export format option for end-users.

**Approach:** Update `packages/web/src/server.ts` to handle `'epub'` format requests in `POST /api/documents/export`, streaming binary buffers with `application/epub+zip` MIME headers. Add "📚 EPUB eBook (.epub)" to `<DocumentExportModal.svelte>` with an e-reader compatibility badge, format description, and file download handler.

## Boundaries & Constraints

**Always:**
- Set correct HTTP headers for EPUB downloads:
  - `Content-Type: application/epub+zip`
  - `Content-Disposition: attachment; filename="<slug>-knowledge-base.epub"`
- Disable packaging mode toggle (Merged vs Split ZIP) when EPUB is selected, because an EPUB is inherently a self-contained compilation.
- Ensure the export works from both `SourceDocumentInspector.svelte` (all or selected source documents) and `DocumentPreviewModal.svelte` (single document e-reader export).

**Ask First:**
- Modifying default export modal layout or default format selection.

**Never:**
- Never serve EPUB files as generic `application/octet-stream` or `text/plain`.
- Never block the UI thread during EPUB assembly; display loading state in the export dialog.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| UI Format Selection | User selects "EPUB eBook" radio | Mode toggle disables/locks to merged book, hint mentions e-readers | Clean UI transition |
| Bulk Export Trigger | 10 selected documents in Inspector | `POST /api/documents/export` with `{ format: 'epub', documentIds: [...] }` triggers `.epub` download | Shows toast on error, stays interactive |
| Single Doc Export | Click "Export EPUB" from Preview | Downloads 1-chapter `.epub` with article title as book title | File streams immediately |
| In-Flight Assembly | User clicks "Download Export" | Button displays spinner `Generating eBook...` and disables | Button re-enables when complete |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` -- WebServer REST controller: update `POST /api/documents/export` for `format === 'epub'`.
- `packages/web/client/src/components/DocumentExportModal.svelte` -- Svelte 5 export dialog: add EPUB radio option, description, and packaging mode lock.
- `packages/web/client/src/lib/types.ts` -- Web types: extend `DocumentExportFormat` to include `'epub'`.
- `packages/web/test/server.test.ts` -- Server integration tests verifying EPUB export endpoint and MIME headers.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/lib/types.ts` -- Add `'epub'` to `DocumentExportFormat` type union.
- [x] `packages/web/src/server.ts` -- Update `POST /api/documents/export` route handler to recognize `'epub'` format and stream the resulting buffer with `Content-Type: application/epub+zip`.
- [x] `packages/web/client/src/components/DocumentExportModal.svelte` -- Add "📚 EPUB eBook (.epub)" format option with description "Compiled eBook formatted for Kindle, Apple Books, Kobo, and e-readers."
- [x] `packages/web/client/src/components/DocumentExportModal.svelte` -- Automatically lock mode to merged when `'epub'` is active and show an explanatory badge.
- [x] `packages/web/test/server.test.ts` -- Add test case asserting `POST /api/documents/export` with `format: 'epub'` returns HTTP 200, `application/epub+zip`, and valid binary content.

**Acceptance Criteria:**
- Given the Document Export Modal in the Web UI
- When the user selects "📚 EPUB eBook (.epub)" and clicks "Download Export"
- Then the browser triggers a download for `<slug>-knowledge-base.epub`.
- And the response headers contain `Content-Type: application/epub+zip`.
- And integration tests in `packages/web/test/server.test.ts` pass with 100% success.

## Spec Change Log

_None._

## Design Notes

### UI Format Option in `<DocumentExportModal.svelte>`
```svelte
<label class="format-card" class:selected={format === 'epub'}>
  <input type="radio" name="format" value="epub" bind:group={format} />
  <div class="format-info">
    <div class="format-header">
      <span class="format-icon">📚</span>
      <span class="format-name">EPUB eBook (.epub)</span>
      <span class="badge badge-popular">E-Reader</span>
    </div>
    <p class="format-desc">Standardized eBook with cover, clickable chapters, and embedded images for Kindle, Apple Books, and Kobo.</p>
  </div>
</label>
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: web server tests pass including EPUB download endpoint.
- `npm run build -w @flashcard-master/web` -- expected: Svelte 5 compilation and TypeScript checks complete with 0 errors.

## Suggested Review Order

1. Web types in `packages/web/client/src/lib/types.ts`
2. REST endpoint in `packages/web/src/server.ts`
3. UI modal in `packages/web/client/src/components/DocumentExportModal.svelte`
4. Test suite in `packages/web/test/server.test.ts`
