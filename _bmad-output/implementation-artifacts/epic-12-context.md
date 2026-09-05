# Epic 12 Context: Multi-URL Web Ingestion, Document Pruning & Knowledge Base Exporter

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Empower users to curate and batch-ingest collections of web URLs under single web sources with bounded concurrency, prune unwanted/empty documents from local storage with guaranteed 100% preservation of all generated flashcards, and export compiled clean document knowledge bases to Markdown, HTML, Plain Text, and JSON in Merged (with clickable Table of Contents and source citations) or Split ZIP formats.

## Stories

- Story 12.1: Multi-URL Storage & Concurrent WebReader Ingestion Engine
- Story 12.2: Interactive Dynamic URL List Manager in UI (Add & Edit Source)
- Story 12.3: Document Repository Deletion & Safe Flashcard Preservation
- Story 12.4: Document Inspector Bulk Selection & Management UI
- Story 12.5: Document Knowledge Base Export Engine (`DocumentExportService`)
- Story 12.6: Document Export UI Modal & Streaming Download Endpoints
- Story 12.7: Monorepo Verification & Automated Test Suites

## Requirements & Constraints

- **Multi-URL Format & Concurrency:** `data_sources.uri` for `type = 'web'` accepts a serialized JSON array string `["https://url1", "https://url2"]` or single-URL string. Multi-URL fetching executes with bounded concurrency (3–5 concurrent requests) and isolated failure handling.
- **Smart URL Parsing:** Input URLs are parsed from multiline or comma-separated text, validated for `http://` / `https://` protocol, stripped of trailing slashes, and deduplicated.
- **Incremental Sync:** Syncing an existing multi-URL source ingests only new/modified URLs based on hash/URL tracking.
- **Safe Document Pruning:** Deleting document records (`DELETE /api/documents/:id` and `POST /api/documents/bulk-delete`) removes the document text from SQLite without cascade-deleting or corrupting any associated flashcards.
- **Document Export Formats:** Clean extracted document text can be exported to Markdown (`.md`), HTML (`.html`), Plain Text (`.txt`), and JSON (`.json`).
- **Merged Mode:** Master compilation includes a document header, auto-generated clickable Table of Contents with jump links, and formatted sections with origin URL citation links and word count metadata.
- **Split Mode:** Packages individual slugified document files (e.g. `01-getting-started.md`) inside a `.zip` archive via `jszip`.

## Technical Decisions

- **AD-11 (Multi-URL Web Ingestion):** `WebReaderStrategy` decodes JSON array URIs and executes parallel fetches with `Promise.allSettled` (concurrency limit = 3–5).
- **AD-12 (Non-Destructive Deletion):** `DocumentRepository.delete()` and `DocumentRepository.deleteBulk()` remove rows from `documents` table while keeping `flashcards` intact with their self-contained metadata.
- **AD-13 (Document Export Service):** `DocumentExportService` coordinates format generation in `@flashcard-master/core` and streams binary/text output through `POST /api/documents/export`.

## UX & Interaction Patterns

- **`<UrlListManager.svelte>`:** Interactive URL chips with single add, bulk paste, duplicate detection warnings, and per-item remove (`✕`).
- **`SourceDocumentInspector.svelte` Bulk Actions:** Row checkboxes, "Select All", "Select Unused (0 cards)", selected count pill, and bulk delete button with confirmation dialog.
- **`<DocumentExportModal.svelte>`:** Modal with format selection, packaging mode toggle (Merged vs. Split ZIP), and scope selection (All vs. Selected).

## Cross-Story Dependencies

- Story 12.1 establishes multi-URL engine before Story 12.2 builds the UI.
- Story 12.3 establishes deletion backend before Story 12.4 builds bulk deletion UI.
- Story 12.5 establishes export engine before Story 12.6 builds the export modal and endpoints.
- Story 12.7 validates the full end-to-end suite.
