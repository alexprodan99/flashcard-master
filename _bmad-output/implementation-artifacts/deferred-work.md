- source_spec: `_bmad-output/implementation-artifacts/17-3-configurable-document-slicing-engine-and-catalog-integration.md`
  summary: Purge or replace previously generated subdocuments in SQLite documents table when a data source is re-synced with altered slicing parameters.
  evidence: If a user re-syncs a source after switching from budget mode to outline mode, newly shaped subdocuments are inserted under new IDs, but old subdocument rows remain in the catalog.
