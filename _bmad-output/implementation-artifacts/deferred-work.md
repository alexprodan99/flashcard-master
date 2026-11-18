- source_spec: `_bmad-output/implementation-artifacts/17-3-configurable-document-slicing-engine-and-catalog-integration.md`
  summary: Purge or replace previously generated subdocuments in SQLite documents table when a data source is re-synced with altered slicing parameters.
  evidence: If a user re-syncs a source after switching from budget mode to outline mode, newly shaped subdocuments are inserted under new IDs, but old subdocument rows remain in the catalog.
- source_spec: `_bmad-output/implementation-artifacts/17-5-decoupled-async-background-worker-ingestion-pipeline.md`
  summary: Support Base64 content decoding for binary files uploaded through JSON payload in POST /api/sources/upload.
  evidence: The upload endpoint currently decodes JSON content payloads with utf-8, which corrupts binary PDF/DOCX files if sent in JSON format rather than binary or multipart upload.
- source_spec: `_bmad-output/implementation-artifacts/17-6-ui-and-cli-slicing-controls-and-monorepo-test-suite.md`
  summary: Index subdocument page coordinates (startPage, endPage) in Generate Studio text search filter.
  evidence: `matchesDocQuery` currently filters by document title, URL, and text snippet but ignores page numbers when filtering subdocument choices.

- source_spec: `_bmad-output/implementation-artifacts/22-1-unified-desktop-web-directory.md`
  summary: Forward coverImage, includeTableOfContents, includeCitations, imageQuality, and grayscale in task-worker executeExport and implement async card exports.
  evidence: Pre-existing in `packages/web/src/workers/task-worker.ts:648-655` where `DocumentExportService.export` omits `coverImage` and other options passed in `ExportTaskPayload`.
- source_spec: `_bmad-output/implementation-artifacts/22-1-unified-desktop-web-directory.md`
  summary: Enforce trailing path.sep or path.relative containment check in POST /api/sources/upload when verifying targetFilePath stays inside localFilesDir.
  evidence: Pre-existing in `packages/web/src/server.ts:2777` where `targetFilePath.startsWith(resolvedDir)` lacks a trailing separator boundary check.
