---
title: 'Story 22.1: Unified ~/.flashcard-master/ Data Directory Across Desktop, Web, and CLI'
type: 'feature'
created: '2026-11-18'
status: 'ready-for-dev'
baseline_commit: 'main'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-22-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Currently, the Electron Desktop app (`packages/desktop`) points `dbPath` and `mediaDir` to Electron's OS-specific `app.getPath("userData")` directory while leaving `localFilesDir`, `yt-dlp`, and `whisper` caches in `~/.flashcard-master/`, causing Desktop and Web/CLI (`~/.flashcard-master/`) to diverge and operate on separate databases and media folders. Additionally, `task-worker.ts` constructs `new MediaService()` without arguments, ignoring custom `mediaDir` options, and `packages/cli/src/cli.ts` hardcodes `.version("1.0.0")` instead of reading `package.json`.

**Approach:**
1. **Unify Desktop onto `~/.flashcard-master/` (`packages/desktop/src/main.ts`, `bootstrap.ts`, `server-runner.ts`)**:
   - Export/reuse canonical directory helpers (`getDefaultBaseDirectory()`, `getDefaultDatabasePath()`, `getDefaultMediaDirectory()`, `getDefaultLocalFilesDirectory()`) from `@flashcard-master/core`.
   - Point Desktop directly to `~/.flashcard-master/` by default (`bootstrapDesktopServer` / `startApplication` / `startDevServer`) without migrating legacy Electron `userData` files.
   - Pass explicit `localFilesDir` and `mediaDir` through `bootstrapDesktopServer` to `createWebServer()`.
2. **Propagate Media Directory into Workers (`packages/web/src/workers/task-types.ts`, `worker-executor.ts`, `task-worker.ts`, `server.ts`)**:
   - Pass `mediaDir` from `WebServer` -> `WorkerExecutor` -> `SyncTaskPayload` / `ExportTaskPayload` -> `task-worker.ts` so `MediaService` in worker threads always matches the host server's media directory.
3. **CLI `--data-dir` Override & Dynamic Version (`packages/cli/src/cli.ts`, `app.ts`)**:
   - Add an optional `--data-dir <path>` option on the CLI root program (resolving `data.sqlite`, `media/`, and `local-files/` inside that directory) while keeping Web and Desktop locked to `~/.flashcard-master/` with no global UI override.
   - Read CLI `.version(...)` dynamically from `packages/cli/package.json`.

## Boundaries & Constraints

**Always:**
- Point Desktop directly to `~/.flashcard-master/` for `data.sqlite`, `media/`, `local-files/`, and caches.
- Keep `userDataPath` option on `bootstrapDesktopServer` only as an explicit programmatic/test override when passed by unit tests.
- Enforce SQLite WAL mode and `busy_timeout = 5000` on all connections so Desktop and Web/CLI can safely read/write `~/.flashcard-master/data.sqlite`.

**Never:**
- Never migrate, copy, or delete existing files from Electron's legacy `app.getPath("userData")` folder.
- Never add a global directory override setting to the Web or Desktop Settings UI.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/storage/db.ts` -- Export canonical `getDefaultDataDirectory()` and `getDefaultLocalFilesDirectory()` helpers alongside `getDefaultDatabasePath()` and `getDefaultMediaDirectory()`.
- [ ] `packages/desktop/src/main.ts`, `bootstrap.ts`, `server-runner.ts` -- Use canonical `~/.flashcard-master/` paths by default (db, media, local-files) without reading `app.getPath("userData")` as the default data root or migrating legacy `userData`.
- [ ] `packages/web/src/server.ts`, `workers/task-types.ts`, `workers/worker-executor.ts`, `workers/task-worker.ts` -- Propagate `mediaDir` and `localFilesDir` consistently across `WebServer` and background worker threads.
- [ ] `packages/cli/src/cli.ts`, `app.ts` -- Add optional `--data-dir <path>` CLI override and read CLI version dynamically from `package.json`.
- [ ] `packages/desktop/test/desktop.test.ts` & `packages/cli/test/app.test.ts` -- Add tests verifying unified `~/.flashcard-master/` defaults, no legacy `userData` migration, and CLI `--data-dir` override.

**Acceptance Criteria:**
- Electron Desktop (`packages/desktop/src/main.ts`, `bootstrap.ts`, `server-runner.ts`) uses `~/.flashcard-master/` (`getDefaultDatabasePath()`, `getDefaultMediaDirectory()`, and `~/.flashcard-master/local-files`) directly by default without migrating legacy Electron `userData` directories.
- No global directory override setting is added to Desktop or Web UI; `@flashcard-master/cli` supports an optional `--data-dir <path>` override flag that resolves `data.sqlite`, `media/`, and `local-files/` under the specified directory.
- `WorkerExecutor` and `task-worker.ts` propagate `mediaDir` (and `localFilesDir` where applicable) so `MediaService` inside worker threads writes to the same canonical directory.
- `packages/cli/src/cli.ts` reads its CLI version dynamically from `package.json`, and `packages/desktop/test/desktop.test.ts` verifies both unified default paths and explicit override behavior.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors across all workspaces.
- `npm test -w @flashcard-master/core && npm test -w @flashcard-master/cli && npm test -w @flashcard-master/desktop && npm test -w @flashcard-master/web` -- expected: all tests pass.
