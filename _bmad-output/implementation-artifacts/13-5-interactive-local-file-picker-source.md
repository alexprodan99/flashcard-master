---
title: 'Interactive File Picker & Upload for Local Data Sources'
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
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Adding a local Markdown or text file data source currently forces the user to manually type or copy-paste an absolute operating system filesystem path (e.g. `C:\Users\username\Documents\notes.md` or `/home/user/docs/notes.md`) into a free-text input. This is error-prone, unintuitive in web browsers, and results in broken source paths when typos occur.

**Approach:** Add a secure local file upload endpoint `POST /api/sources/upload` to `packages/web/src/server.ts` that saves uploaded files (`.md`, `.markdown`, `.txt`) into `.flashcard-master/local-files/` (or `data/uploads/`) and returns the resolved absolute file path. Upgrade `AddSourceModal.svelte` and `EditSourceModal.svelte` so that when `type === 'local'`, an interactive drag-and-drop file picker replaces the mandatory free-text path field. Choosing or dropping a file uploads it, shows a selected file chip with name and size, auto-populates the Source Name from the file name, and sets the source `uri` automatically. Provide an optional "Advanced: Specify Directory or Absolute Path" collapsible toggle for users who still want to scan arbitrary folders.

## Boundaries & Constraints

**Always:**
- Restrict file uploads to supported text file extensions: `.md`, `.markdown`, `.txt`.
- Store uploaded local files in a deterministic managed directory (e.g. `path.join(getDefaultDatabasePath(), "..", "local-files")` or `data/uploads/`).
- Sanitize uploaded filenames to prevent directory traversal attacks (`path.basename` / alphanumeric stripping).
- Automatically prefill the "Source Name" input field with the file's base name (without extension) if the name input is currently empty.
- Provide a clear visual file indicator (file icon, filename, formatted size, and remove button `✕`).
- Preserve an advanced collapsible option allowing manual path entry for users who want to point to existing multi-file directories.

**Ask First:**
- Restricting local sources exclusively to single uploaded files (preserving directory ingestion capability is critical).

**Never:**
- Never accept executable or binary file extensions (`.exe`, `.sh`, `.bat`, etc.) on the upload endpoint.
- Never crash the server if an upload payload is interrupted or exceeds size limits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drag & Drop File | Drop `kubernetes-notes.md` (15 KB) | File uploaded to local store, name pre-filled as "kubernetes-notes", URI set to stored path | Shows error if non-text file |
| File Browser Choice | Click "Browse File...", select `.txt` | File uploaded, badge displays name and size, submit button enabled | Clean upload state |
| Clear Selected File | Click `✕` on file chip | Uploaded reference cleared, file input reset, URI cleared | Returns to dropzone state |
| Advanced Folder Path | User clicks "Advanced: Directory Path" | Reveals manual text input, allows entering `C:\my-vault` for directory sync | Validated on sync |
| Non-Markdown File | Drop `image.png` or `binary.bin` | Rejects file immediately with validation warning | No server upload |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` -- WebServer upload route: implement `POST /api/sources/upload` with extension checks, path sanitization, and disk persistence.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Add Source dialog: replace free-text URI input with interactive file picker dropzone when `type === 'local'`.
- `packages/web/client/src/components/EditSourceModal.svelte` -- Edit Source dialog: support file replacement or path display for local sources.
- `packages/web/client/src/lib/api.ts` -- Client API service: add `uploadSourceFile(file: File): Promise<{ path: string; filename: string; size: number }>`.
- `packages/web/test/server.test.ts` -- Server integration tests: test file upload endpoint validation, extension filtering, and path resolution.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/server.ts` -- Implement `POST /api/sources/upload` route accepting raw file or multipart data for `.md`, `.markdown`, and `.txt` files.
- [x] `packages/web/src/server.ts` -- Store uploaded files safely in local app storage (`~/.flashcard-master/local-files/`), sanitizing filenames against path traversal.
- [x] `packages/web/client/src/lib/api.ts` -- Export `uploadSourceFile(file: File)` API function returning `{ path, filename, size }`.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Update `type === 'local'` section with an interactive drag-and-drop dropzone and file browse trigger.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- On file upload: show selected file badge (`📄 filename (size)`), auto-fill source name, and set `uri = result.path`.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Add a collapsible "Advanced: Specify Directory or Absolute Path" toggle for folder scanning.
- [x] `packages/web/test/server.test.ts` -- Add integration tests verifying successful upload of Markdown files, rejection of invalid extensions, and sanitization of filenames.

**Acceptance Criteria:**
- Given the Add Source Modal with "📁 Local" selected
- When the user selects or drops a `.md` or `.txt` file
- Then the file is automatically uploaded to the local server.
- And the UI displays a file chip with the filename and size.
- And the source name is pre-populated from the filename.
- And saving the source creates a valid local data source that syncs successfully with `LocalFileStrategy`.
- And tests in `packages/web/test/server.test.ts` pass with zero failures.

## Spec Change Log

_None._

## Design Notes

### Local Source File Picker UI
```svelte
{#if type === 'local'}
  <div class="form-group">
    <label>Local Document File</label>
    {#if selectedLocalFile}
      <div class="file-chip">
        <span class="file-icon">📄</span>
        <div class="file-details">
          <span class="file-name">{selectedLocalFile.name}</span>
          <span class="file-size">({formatFileSize(selectedLocalFile.size)})</span>
        </div>
        <button type="button" class="btn-remove-file" onclick={clearFile}>✕</button>
      </div>
    {:else}
      <div class="dropzone" ondrop={handleFileDrop} ondragover={handleDragOver}>
        <span class="drop-icon">📁</span>
        <p class="drop-text">Drag & drop Markdown/Text file here, or</p>
        <label class="btn-browse">
          Browse File...
          <input type="file" accept=".md,.markdown,.txt" onchange={handleFileSelect} hidden />
        </label>
      </div>
    {/if}
    <div class="advanced-toggle">
      <button type="button" onclick={() => showAdvancedPath = !showAdvancedPath}>
        {showAdvancedPath ? '▼ Hide Advanced Path' : '▶ Advanced: Specify Directory or Absolute Path'}
      </button>
    </div>
    {#if showAdvancedPath}
      <input type="text" placeholder="C:\path\to\notes or /home/user/docs" bind:value={uri} />
    {/if}
  </div>
{/if}
```

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: upload endpoint tests pass.
- `npm run build -w @flashcard-master/web` -- expected: full Svelte 5 and TypeScript compilation succeeds.

## Suggested Review Order

1. Endpoint in `packages/web/src/server.ts`
2. Client API method in `packages/web/client/src/lib/api.ts`
3. UI components in `packages/web/client/src/components/AddSourceModal.svelte`
4. Automated tests in `packages/web/test/server.test.ts`
