# Brownfield Notes & Architectural Invariants: Epic 17

## 1. Existing Infrastructure Touchpoints

### `packages/adapters/src/ingestion/local-file-strategy.ts`
- Currently accepts: `.md`, `.markdown`, `.txt`.
- Extension point: Expand glob patterns to include `**/*.{md,markdown,txt,pdf,docx}`.
- Dispatch logic: Delegate `.pdf` to `PdfParser` (`unpdf` / `pdf-parse`) and `.docx` to `DocxParser` (`mammoth`).
- Clean text extraction: Convert headings and tables into Markdown; retain start/end page numbers in `RawDocument.guid` or subdocument metadata.

### `packages/core/src/storage/schema.sql` & `db.ts`
- SQLite `documents` table currently stores:
  - `id`: TEXT PRIMARY KEY
  - `source_id`: TEXT NOT NULL
  - `title`: TEXT NOT NULL
  - `url`: TEXT
  - `text_content`: TEXT NOT NULL
  - `raw_content`: TEXT
  - `content_hash`: TEXT
  - `word_count`: INTEGER DEFAULT 0
- Sliced subdocuments insert multiple rows linked to the parent `source_id`, with titles like `Book.pdf - Chapter 1: Limits (pp. 1-24)` and `url` referencing `file:///path/to/Book.pdf#page=1`.

### `packages/adapters/src/export/document-export-service.ts`
- Currently looks only for `/api/media/<filename>` in document text.
- Extension point: Add regex detection for `https?://[^\s"'()]+(?:\.(?:png|jpe?g|webp|gif|svg)|[^\s"'()]+)` inside markdown image syntax `![alt](url)`.
- Download pipeline: Connect to `MediaService.fetchAndCacheMedia(url)` to store external media locally and register it under `OEBPS/images/` with unique content hash filenames.
- XHTML chapter rewriting: Replace remote URLs with relative local `images/<hash>.<ext>` references.

### `packages/web/client/src/stores/generateStore.svelte.ts`
- Currently persists provider, model, apiKey, persona, difficulty, depthMode to `localStorage` (`fc_generation_settings`).
- Ephemeral fields to persist:
  - `selectedDocIds: Record<string, boolean>`
  - `selectedSourceIds: string[]`
  - `expandedSources: Record<string, boolean>`
  - `sourceFilterQuery: Record<string, string>`
- Hydration invariant: Hydrate on mount; clean up dead IDs if sources/documents have been deleted.

### Database Path Unification
- `packages/core/src/storage/db.ts` default: `~/.flashcard-master/data.sqlite`.
- `packages/cli/src/app.ts` had legacy: `~/.flashcard-master/flashcards.db`.
- Invariant: Unify all references to `~/.flashcard-master/data.sqlite`. Check for legacy file existence and auto-migrate or link if present.
