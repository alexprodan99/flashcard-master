- source_spec: `_bmad-output/implementation-artifacts/22-1-unified-desktop-web-directory.md`
  summary: Forward coverImage, includeTableOfContents, includeCitations, imageQuality, and grayscale in task-worker executeExport and implement async card exports.
  evidence: Pre-existing in `packages/web/src/workers/task-worker.ts:648-655` where `DocumentExportService.export` omits `coverImage` and other options passed in `ExportTaskPayload`.
