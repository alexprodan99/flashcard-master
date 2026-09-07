---
title: 'Document Repository Deletion & Safe Flashcard Preservation'
type: 'feature'
created: '2026-09-05'
status: 'done'
baseline_commit: '227fad43d11b3bc228c2e6840dca4fc69df9c748'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users need the ability to delete discovered document records (e.g. outdated, irrelevant, or duplicate scraped documents) individually or in bulk without losing any flashcards generated from those documents.

**Approach:** Implement transactional single and bulk document deletion in `DocumentRepository` and REST API (`POST /api/documents/bulk-delete` and `DELETE /api/documents/:id`), and provide client API methods. Ensure complete isolation so deleting document rows never cascades to or corrupts flashcards.

## Boundaries & Constraints

**Always:**
- Execute bulk document deletions in a SQLite transaction.
- Preserve all flashcards in SQLite when document records are deleted.
- Flashcard fields `document_title`, `source_origin_url`, `source_quote`, `target_deck`, and `tags` must remain fully intact.
- Return accurate deletion counts in bulk deletion API responses `{ success: true, deletedCount: N }`.
- Return 404 on single delete if the document does not exist, or 200 `{ success: true }` if deleted.

**Ask First:**
- Adding cascading constraints between documents and flashcards.

**Never:**
- Never delete, alter, or orphan flashcards when deleting document records.
- Never crash the server on invalid or empty array inputs for bulk deletion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single Document Deletion | `DELETE /api/documents/:id` with valid `id` | Document removed from `documents` table; returns `{ success: true }` | 404 if document ID does not exist |
| Bulk Document Deletion | `POST /api/documents/bulk-delete` with `{ ids: ["d1", "d2"] }` | Both documents deleted in transaction; returns `{ success: true, deletedCount: 2 }` | Return `deletedCount: 0` if none found |
| Empty / Invalid Bulk Deletion | `POST /api/documents/bulk-delete` with `{ ids: [] }` or invalid body | Returns `{ success: true, deletedCount: 0 }` | Handles gracefully without SQL syntax errors |
| Flashcard Preservation | Document `D` deleted after flashcards `F1`, `F2` created | `D` is deleted; `F1` and `F2` remain in `flashcards` table with valid metadata | Flashcards unaffected |
| Mixed Existing / Non-existing IDs | `POST /api/documents/bulk-delete` with 2 valid and 2 invalid IDs | Deletes the 2 valid docs; returns `deletedCount: 2` | Partial match handled safely in transaction |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/document-repository.ts` -- Add `deleteMany(ids: string[]): number` and `deleteBulk(ids: string[]): number` with SQLite transaction and input sanitization/deduplication.
- `packages/core/test/document-repository.test.ts` -- Unit tests verifying single & bulk document deletion, boundary inputs, duplicate ID batches, and asserting flashcard preservation across all deletion vectors.
- `packages/web/src/server.ts` -- Handle `POST /api/documents/bulk-delete`, `DELETE /api/documents/bulk-delete`, URI decoding for document IDs, and `DELETE /api/documents/:id`.
- `packages/web/client/src/lib/api.ts` -- Add `deleteDocumentsBulk(ids: string[])` helper and URI encoding.
- `packages/web/test/server.test.ts` -- Integration tests for document deletion endpoints, HTTP verbs, malformed bodies, and flashcard safety.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/document-repository.ts` -- Implement `deleteMany(ids: string[]): number` and `deleteBulk(ids: string[]): number` with Set deduplication, whitespace trimming, and SQLite transaction.
- [x] `packages/core/test/document-repository.test.ts` -- Add unit tests for `deleteMany`, `deleteById`, edge-case inputs, batch duplicates, and multi-vector flashcard preservation.
- [x] `packages/web/src/server.ts` -- Add `POST /api/documents/bulk-delete`, `DELETE /api/documents/bulk-delete`, and single document deletion with URI decoding.
- [x] `packages/web/client/src/lib/api.ts` -- Add `deleteDocumentsBulk(ids: string[])` helper with proper error handling.
- [x] `packages/web/test/server.test.ts` -- Add integration tests for single and bulk document deletion endpoints verifying flashcards are untouched.

**Acceptance Criteria:**
- Given 3 documents in `DocumentRepository` and 5 flashcards referencing their titles and URLs
- When calling `deleteMany(["doc-1", "doc-2"])` or `POST /api/documents/bulk-delete`
- Then `doc-1` and `doc-2` are deleted from `documents` table, `doc-3` remains, and all 5 flashcards remain completely intact in `flashcards` table.

## Spec Change Log

- Sanitized inputs and trimmed whitespace in `deleteById` and `deleteMany`.
- Added duplicate ID filtering in `deleteMany` via `Set` mapping.
- Added URI decoding `decodeURIComponent(docId)` in `server.ts` single document endpoints.
- Added URI encoding `encodeURIComponent(documentId)` in `fetchDocumentDetails` and `deleteDocument` in `api.ts`.

## Design Notes

### Safe Preservation Architecture
The `documents` table stores raw or ingested textual documents for AI card generation. The `flashcards` table stores self-contained flashcards with embedded `document_title`, `source_origin_url`, and `source_quote`. There is no cascading foreign key constraint from `flashcards` to `documents.id`. Therefore, deleting a document record from `documents` simply removes the text payload from storage while preserving all historical cards and Anki sync states.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: all core tests pass (66/66).
- `npm test -w @flashcard-master/web` -- expected: all web tests pass (25/25).
- `npm test` -- expected: 100% monorepo test suite passes (161/161).
- `npm run build` -- expected: build succeeds with 0 errors.

## Suggested Review Order

**Document Repository Batch Deletion**
- SQLite transaction implementation for multi-document deletion
  [`DocumentRepository.deleteMany`](../../packages/core/src/storage/document-repository.ts#L204)

**Server Bulk Document Deletion Route**
- REST endpoint `POST /api/documents/bulk-delete`
  [`server.ts`](../../packages/web/src/server.ts#L1870)
