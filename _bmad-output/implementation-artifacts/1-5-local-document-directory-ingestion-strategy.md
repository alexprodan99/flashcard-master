---
title: 'Story 1.5: Local Document & Directory Ingestion Strategy'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '19e24686e12128d9320db031f2b4f63490ad0ddb'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-1-context.md
  - _bmad-output/implementation-artifacts/1-4-web-article-reader-mode-extraction-strategy.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users need to turn their local files (e.g. Obsidian notes, Markdown documents, `.txt` files) or entire directory trees into flashcards, preserving file paths, modification timestamps, and content hashes.

**Approach:** Implement `LocalFileStrategy` in `packages/adapters/src/ingestion/local-file-strategy.ts` conforming to `IngestionStrategy` (`type: "local"`), scanning local files and directories matching `.md`, `.txt`, and `.markdown` extensions, extracting clean markdown text and YAML frontmatter, and generating unique file GUIDs and SHA-256 `contentHash`.

## Boundaries & Constraints

**Always:**
- Implement `IngestionStrategy` for `type: "local"`.
- Support single file paths (e.g. `/path/to/notes.md`) and directory paths (e.g. `/path/to/vault`).
- Support `.md`, `.markdown`, and `.txt` file extensions recursively.
- Extract title from Markdown `# Heading 1`, YAML frontmatter `title:`, or filename fallback.
- Read file modification times (`mtime`) and normalize cross-platform paths (forward slashes).
- Compute SHA-256 `contentHash` on raw file content.
- Handle missing files or permission errors gracefully without aborting execution (NFR-301).

**Ask First:**
- Adding PDF or docx binary document parsing (planned for post-v1 roadmap).

**Never:**
- Follow symlink loops indefinitely or crash on locked/unreadable files.
- Ingest binary or non-text files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single Markdown File | Path to valid `note.md` | Returns `[RawDocument]` with parsed title and file content | N/A |
| Directory of Notes | Path to directory with `.md` & `.txt` | Recursively discovers all files, returning `RawDocument[]` | Skips non-text files (.png, .bin) |
| Non-Existent Path | Invalid file/dir path | Returns empty array and logs warning | Catches `ENOENT` cleanly |
| YAML Frontmatter | Note with `---` frontmatter block | Extracts title from `title:` and content body | N/A |
| Empty Directory | Directory with no matching files | Returns empty array | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `RawDocument`, `CleanTextDocument`, `DataSource`
- `packages/core/src/ports/index.ts` -- `IngestionStrategy`
- `packages/adapters/package.json` -- Add `fast-glob` dependency
- `packages/adapters/src/ingestion/local-file-strategy.ts` -- `LocalFileStrategy` implementation
- `packages/adapters/src/index.ts` -- Export `LocalFileStrategy`
- `packages/adapters/test/local-file-strategy.test.ts` -- Unit tests with temporary file/directory fixtures

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/package.json` -- Add `fast-glob` dependency
- [x] `packages/adapters/src/ingestion/local-file-strategy.ts` -- Implement `LocalFileStrategy` with recursive scanning, title extraction, and clean text mapping
- [x] `packages/adapters/src/index.ts` -- Export `LocalFileStrategy`
- [x] `packages/adapters/test/local-file-strategy.test.ts` -- Unit tests validating single file, directory scanning, YAML frontmatter title, and error resilience

**Acceptance Criteria:**
- **Given** a data source with type "local" pointing to a file or folder
- **When** `LocalFileStrategy.fetch(source)` is executed
- **Then** all matching `.md`, `.markdown`, and `.txt` files are returned as `RawDocument[]`.
- **Given** a `RawDocument` from a local markdown note
- **When** `LocalFileStrategy.extractCleanText(rawDoc)` is called
- **Then** clean text content and SHA-256 `contentHash` are returned.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter tests pass.
- `npm run build` -- expected: All workspace packages compile without TypeScript errors.



## Suggested Review Order

**Local File Ingestion Strategy**

- Recursive file discovery, YAML frontmatter extraction, and content hashing
  [packages/adapters/src/ingestion/local-file-strategy.ts#L22](../../packages/adapters/src/ingestion/local-file-strategy.ts#L22)

- Local file test suite covering single note, directory scanning, and error handling
  [packages/adapters/test/local-file-strategy.test.ts#L1](../../packages/adapters/test/local-file-strategy.test.ts#L1)

**Adapters Index**

- Package exports for adapters
  [packages/adapters/src/index.ts#L1](../../packages/adapters/src/index.ts#L1)
