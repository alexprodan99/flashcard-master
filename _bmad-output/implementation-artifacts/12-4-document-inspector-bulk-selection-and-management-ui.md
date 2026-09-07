---
title: 'Document Inspector Bulk Selection & Pruning UI'
type: 'feature'
created: '2026-09-05'
status: 'done'
baseline_commit: '2ea8ad4e525164d7df64be872ec86a111a6efceb'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When inspecting discovered source documents in the UI, users have no way to select multiple documents, prune unwanted or stale crawled articles, or delete single documents directly from the Inspector drawer or Preview modal.

**Approach:** Upgrade `<SourceDocumentInspector.svelte>` with multi-select checkboxes, master "Select All" toggle, a floating batch action toolbar with "🗑️ Delete Selected (N)", single-item deletion buttons on document cards and in `<DocumentPreviewModal.svelte>`, and informative confirmation dialogs emphasizing that generated flashcards remain safely preserved.

## Boundaries & Constraints

**Always:**
- Provide a clear confirmation before deleting documents that reminds the user their flashcards will remain safe and intact.
- Support selecting all filtered documents or deselecting all with one click.
- Show a prominent "🗑️ Delete Selected (N)" action bar when 1 or more documents are selected.
- Provide single-document delete action in both document card row and `DocumentPreviewModal`.
- Update the inspector list and metrics bar (total documents, total words) immediately after deletion.

**Ask First:**
- Deleting documents silently without user confirmation.

**Never:**
- Never delete flashcards when pruning documents.
- Never leave stale selection IDs selected after documents are deleted or filtered.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Select Single Document | User clicks checkbox on doc row | Document added to `selectedIds` set; bulk toolbar appears with "1 Selected" | Checkbox state updates |
| Select All Documents | User clicks "Select All" toggle | All currently filtered documents added to `selectedIds`; toolbar shows count | Updates master checkbox |
| Deselect All Documents | User clicks "Deselect All" / unchecks master | `selectedIds` cleared; bulk action bar disappears | Clean state |
| Bulk Delete Confirmation | User clicks "🗑️ Delete Selected (3)" | Confirms with modal/prompt: "Delete 3 documents? Note: All generated flashcards will remain safely preserved." | Abort on Cancel |
| Bulk Delete Execution | User confirms bulk deletion | Calls `deleteDocumentsBulk(ids)`, clears selection, refreshes document list and metrics | Error banner on API failure |
| Single Delete from Card | User clicks "🗑️" on document card | Confirms and calls `deleteDocument(id)`, refreshes list | Error alert on failure |
| Single Delete from Preview Modal | User clicks "🗑️ Delete" in `DocumentPreviewModal` | Confirms, calls `deleteDocument(id)`, closes preview, refreshes inspector | Error banner on failure |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Multi-select state, master checkbox with indeterminate binding, bulk action toolbar, single delete action, debounced search, deletion guards, confirmation handling, metrics update.
- `packages/web/client/src/components/DocumentPreviewModal.svelte` -- Add "🗑️ Delete Document" action button with `onDelete` and `isDeleting` props.
- `packages/web/client/src/lib/api.ts` -- API client helpers `deleteDocument` and `deleteDocumentsBulk` (implemented in 12.3).

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/components/DocumentPreviewModal.svelte` -- Add "🗑️ Delete Document" action button with `onDelete` and `isDeleting` props.
- [x] `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Add checkbox selection state (`selectedIds = new Set<string>()`), master select/deselect toggle with `indeterminate={isSomeSelected}`, floating batch action bar with "🗑️ Delete Selected", single delete button on card rows, deletion confirmation, `isDeleting` loading guards, debounced search filtering, and state synchronization.
- [x] `packages/web/test/server.test.ts` -- Verify UI and backend integration tests.

**Acceptance Criteria:**
- Given the Source Document Inspector drawer open with 5 documents
- When user checks 2 document checkboxes and clicks "🗑️ Delete Selected (2)" and confirms
- Then `deleteDocumentsBulk` is called with the 2 document IDs, the 2 documents disappear from the list, the selection resets, and the metrics bar updates.

## Spec Change Log

_None._

## Design Notes

### Confirmation Wording
To prevent any user anxiety about losing flashcards when cleaning up large web crawls, all deletion dialogs will display:
`"Are you sure you want to delete {N} document(s)? All generated flashcards will remain safely preserved in your collection."`

## Verification

**Commands:**
- `npm run build` -- expected: Vite client builds without errors.
- `npm test -w @flashcard-master/web` -- expected: all web tests pass.
- `npm test` -- expected: 100% monorepo test suite passes.

## Suggested Review Order

**Document Inspector Bulk Selection**
- Multi-selection and bulk delete action handling
  [`SourceDocumentInspector.svelte`](../../packages/web/client/src/components/SourceDocumentInspector.svelte)

**Preview Modal Delete Button**
- Single delete button in reader modal
  [`DocumentPreviewModal.svelte`](../../packages/web/client/src/components/DocumentPreviewModal.svelte)
