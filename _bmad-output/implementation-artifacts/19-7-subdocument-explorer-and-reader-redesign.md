---
title: 'Story 19.7: Generate Studio Target Scope Redesign & Modal Document Picker'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: 'fb8be0262fabe39012a9b4c2845281815465345c'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
In Generate Studio (`GenerateStudio.svelte`), the Target Scope section previously relied on a nested accordion/dropdown tree where each data source had to be manually expanded via small arrow icons to view and select individual documents. This created multiple usability problems:
1. **Low Visibility:** Documents were hidden behind collapsed accordions, making it difficult to see what content exists or which documents are active.
2. **Nested Scroll Traps:** Expanding sources created nested scrollbars within scrollbars inside the generation form, causing layout friction and awkward page scrolling.
3. **Cluttered Form on Large Catalogs:** Sources containing dozens or hundreds of subdocuments (like EPUB chapters or sliced PDFs) overwhelmed the studio form when expanded, pushing generation settings and the "Start Generation" button far down the screen.

**Approach:**
1. **Source Scope Cards**:
   - Replace the collapsible accordion tree with prominent visual **Source Scope Cards** in Generate Studio.
   - Each card prominently displays:
     - A source inclusion checkbox (toggle entire source).
     - Source type badge (`EPUB`, `PDF`, `Web Article`, etc.) and clear source name.
     - Document selection status pill (`All 42 documents selected`, `15 of 42 documents selected`, or `0 of 42 selected`).
     - Total word count estimate for selected documents.
     - Inline quick actions: `Select All`, `Clear`.
     - A dedicated `📑 Select Documents...` button that opens a focused curation modal.
2. **Document Selector Modal (`SourceDocumentPickerModal.svelte`)**:
   - Provide a spacious, focused modal dialog for granular document selection within a source.
   - Search input to filter documents by title or topic.
   - Status filters (`All`, `Selected`, `Unselected`).
   - Quick selection helpers (`Select All Visible`, `Clear Visible`).
   - Clean scannable document rows displaying checkboxes, title, page coordinates, word count, and cards generated.
   - Confirm / Apply button that updates `generateStore.selectedDocIds` seamlessly.
3. **Testing & Architectural Documentation**:
   - Add unit tests verifying source card selection state calculations, modal document selection, and store synchronization.
   - Update `docs/ARCHITECTURE.md` to document the Generate Studio Target Scope architecture.

## Boundaries & Constraints

**Always:**
- Preserve bidirectional document and source selection synchronization in `generateStore`.
- Keep overall word count and selected document count reactive in the Studio header badge.
- Ensure the modal handles large catalogs (100+ documents) with smooth scrolling and instant search filtering.
- Adapt fluidly to mobile displays (`max-width: 640px`) without horizontal overflow.

**Never:**
- Never lose existing selections when opening, filtering, or closing the document curation modal.
- Never trigger unexpected full-page scroll jumps when selecting documents.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output | Fallback |
|---|---|---|---|
| Select entire source | User checks source checkbox on card | All documents in source are marked selected; pill shows "All N docs selected" | Selecting updates store state |
| Fine-grained selection | User clicks "Select Documents..." on EPUB source with 50 chapters | Opens Document Picker modal; user selects Chapters 1-5 and clicks "Apply" | Card updates to "5 of 50 docs selected" |
| Filter within modal | User searches "architecture" in picker modal | Shows only matching documents with "Select All Visible" helper | Clear search restores all rows |
| Zero sources active | No sources configured in database | Clean empty warning banner prompting user to add a source | Studio form remains disabled |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/views/GenerateStudio.svelte` -- Replace accordion tree with Source Scope Cards and modal trigger.
- `packages/web/client/src/components/SourceDocumentPickerModal.svelte` -- Focused modal for searching and selecting documents for a given source.
- `packages/web/test/client-stores.test.ts` -- Unit tests for source scope selection and modal picker logic.
- `docs/ARCHITECTURE.md` -- Document Generate Studio Target Scope and Document Picker architecture.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/components/SourceDocumentPickerModal.svelte` -- Create modal component for searching, filtering, and curating subdocuments.
- [x] `packages/web/client/src/views/GenerateStudio.svelte` -- Replace accordion dropdown tree with prominent Source Scope Cards and picker modal integration.
- [x] `packages/web/test/client-stores.test.ts` -- Add unit tests verifying source selection state, document picker filtering, and store updates.
- [x] `docs/ARCHITECTURE.md` -- Document the Generate Studio Target Scope and Document Picker architecture.

**Acceptance Criteria:**
- Generate Studio Target Scope displays clean, prominent Source Scope Cards without collapsed accordion dropdowns.
- Each source card clearly shows its selection state (all, partial, or none) and estimated word count.
- The `Select Documents...` modal enables effortless searching, filtering, and selecting individual documents from large sources.
- Full monorepo verification passes (`npm test`, `npm run typecheck`, `npm run build`).
