---
title: 'Story 20.7: Electron Desktop Packaging & Multi-OS Release Pipeline'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_commit: '38fda48'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Flashcard Master currently runs either as a command-line utility or a local browser-bound web server (`http://localhost:3000`), requiring users to open a terminal, run Node.js commands, and manage a separate browser tab without native OS desktop integration, native window framing, system tray controls, or packaged multi-OS release installers.

**Approach:**
Create a dedicated `@flashcard-master/desktop` Electron package that wraps `@flashcard-master/web` (in-process Node.js server, Svelte 5 SPA, and native `better-sqlite3` storage) with zero backend rewrites. The desktop runtime initializes an isolated SQLite database and media store in the platform user-data directory (`app.getPath('userData')`), starts an internal web server on an ephemeral loopback port, renders a custom dark-slate frameless/styled native window, and provides system tray minimize/restore controls. Implement an automated multi-OS release CI/CD pipeline (`.github/workflows/release-desktop.yml`) with `electron-builder` targets for Windows (`.exe` NSIS/portable), macOS (`.dmg`), and Linux (`.AppImage` / `.deb`).

## Boundaries & Constraints

**Always:**
- Keep `@flashcard-master/web` and `@flashcard-master/core` backward compatible with zero backend rewrites.
- Store user data, SQLite database (`data.sqlite`), and media files strictly within `app.getPath('userData')` in desktop mode.
- Use safe Electron defaults (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`).
- Provide system tray icon, tray context menu (Show, Hide, Quit), and double-click restore.
- Gracefully shut down in-process web server and database connections upon application quit.
- Support cross-platform packaging with `electron-builder` configuration for Windows (`nsis`, `portable`), macOS (`dmg`), and Linux (`AppImage`, `deb`).
- Ensure all quality gates (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`) pass cleanly across the monorepo.

**Ask First:**
- Introducing external auto-update server dependencies (e.g. `update.electronjs.org` or proprietary S3 feeds) beyond standard GitHub Releases.
- Enforcing mandatory hardware code-signing certificates during local development builds.

**Never:**
- Never hardcode fixed ports (like 3000) that can collide with external running instances; dynamically bind to an available port.
- Never write desktop state or logs to the project root directory during production runtime.
- Never violate Hexagonal Architecture principles (core domain logic remains free of Electron/DOM dependencies).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cold Launch | User launches packaged app | Resolves `userData`, initializes SQLite DB, starts ephemeral loopback server, displays dark slate `BrowserWindow` loading Svelte client | Logs error dialog and exits cleanly if port binding or DB fails |
| Port In Use | Port 3000 is occupied by another process | Web server binds to available port (port 0 / ephemeral) and loads that URL | Displays error if loopback interface completely unavailable |
| Minimize to Tray | User minimizes window or clicks minimize | App hides to system tray; notification icon remains visible in taskbar/tray | Tray context menu provides 1-click restore |
| System Tray Interaction | Double-click tray icon or select "Show Flashcard Master" | Window unminimizes, shows, and gains OS focus | None |
| App Quit | User triggers Quit via tray or Menu (Cmd/Ctrl+Q) | `before-quit` event triggered, `server.close()` and database connections cleanly closed, app terminates | Forces exit after graceful timeout |
| Tag Push Release | Git release tag pushed (e.g. `v1.0.0`) | `.github/workflows/release-desktop.yml` builds on Windows, macOS, and Linux, producing `.exe`, `.dmg`, `.AppImage`, and `.deb` release assets | Fails job and alerts if packaging errors occur |

</frozen-after-approval>

## Code Map

- `packages/desktop/package.json` -- Package definition for `@flashcard-master/desktop`, declaring dependencies on `@flashcard-master/web`, `@flashcard-master/core`, `@flashcard-master/adapters`, `better-sqlite3`, `electron`, `electron-builder`.
- `packages/desktop/tsconfig.json` -- TypeScript compiler configuration extending root tsconfig.
- `packages/desktop/src/main.ts` -- Electron main process entrypoint: initializes user-data directory paths, configures `createAppContext` and `createWebServer`, listens on ephemeral port, creates dark-themed `BrowserWindow`, sets up system tray, and manages lifecycle events.
- `packages/desktop/src/preload.ts` -- Safe context isolation preload script (minimal surface exposing desktop window controls if needed).
- `packages/desktop/assets/icon.png` -- Application icon assets for cross-platform tray and window display.
- `packages/desktop/electron-builder.json` -- Multi-OS `electron-builder` configuration specifying targets (NSIS, portable, DMG, AppImage, DEB), output directories, and file inclusions.
- `packages/desktop/test/desktop.test.ts` -- Unit tests validating desktop initialization logic, port binding, and user-data path configuration.
- `.github/workflows/release-desktop.yml` -- Automated GitHub Actions matrix workflow (Windows, macOS, Linux) triggering on version tags to build, package, and attach release assets to GitHub Releases.
- `package.json` -- Root package scripts (`desktop:dev`, `desktop:build`, `desktop:dist`) and workspace build script integration.
- `CONTRIBUTING.md` -- Updated monorepo structure and build commands documenting the desktop package.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Sprint status tracker reflecting Story 20.7.

## Tasks & Acceptance

**Execution:**
- [x] `packages/desktop/package.json` -- Define `@flashcard-master/desktop` workspace package with scripts and dependencies.
- [x] `packages/desktop/tsconfig.json` -- Setup TypeScript configuration for the desktop workspace.
- [x] `packages/desktop/src/main.ts` -- Implement Electron lifecycle, user-data SQLite connection, in-process WebServer bootstrap, dark slate window creation, and system tray minimize/restore.
- [x] `packages/desktop/src/preload.ts` -- Implement secure preload script with context isolation.
- [x] `packages/desktop/assets/` -- Add application icon assets for cross-platform desktop display.
- [x] `packages/desktop/electron-builder.json` -- Configure `electron-builder` for multi-OS packaging (`.exe`, `.dmg`, `.AppImage`, `.deb`).
- [x] `packages/desktop/test/desktop.test.ts` -- Add unit tests for desktop bootstrap functions and path resolution.
- [x] `.github/workflows/release-desktop.yml` -- Create automated GitHub Actions release workflow for tag-triggered multi-OS builds and asset publication.
- [x] `package.json` -- Add workspace build/run scripts for desktop application.
- [x] `CONTRIBUTING.md` -- Document desktop architecture, local development commands, and packaging scripts.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Track story progress.

**Acceptance Criteria:**
- Given `@flashcard-master/desktop`, when started, then it initializes an in-process local server, connects to `data.sqlite` in `app.getPath('userData')`, and loads the Svelte client seamlessly in a dark slate window.
- Given the native window, when minimized or restored, then it integrates with the OS system tray with contextual menu controls.
- Given `electron-builder`, when executing packaging, then it builds cleanly with working native `better-sqlite3` bindings.
- Given `.github/workflows/release-desktop.yml`, when a version tag (`v*`) is pushed, then GitHub Actions triggers a 3-OS matrix build attaching Windows (`.exe` NSIS and portable), macOS (`.dmg`), and Linux (`.AppImage` and `.deb`) installers to GitHub Releases.
- Given `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`, all checks pass cleanly across all workspace packages.

## Spec Change Log

## Design Notes

### User Data & Ephemeral Port Isolation
In desktop mode, Flashcard Master must not pollute the current working directory or conflict with an already-running CLI web server on port 3000. `main.ts` queries `app.getPath('userData')` to place `data.sqlite` and the `media/` directory in standard OS application data paths (e.g., `%APPDATA%/Flashcard Master` on Windows, `~/Library/Application Support/Flashcard Master` on macOS, and `~/.config/Flashcard Master` on Linux). The internal `WebServer` is instructed to listen on port `0` (or attempts port 3000 and falls back to ephemeral port `0` if in use), passing the resolved URL directly to `mainWindow.loadURL()`.

### Native Modules in Monorepo Packaging
`better-sqlite3` is a native C++ addon. When packaging with `electron-builder`, native addons must be compiled against Electron's Node ABI. `electron-builder` automatically runs native rebuilds, and `node_modules` hoisting in the root is properly mapped in `electron-builder.json` using explicit `files` globs.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript compilation errors.
- `npm run lint` -- expected: 0 ESLint warnings or errors.
- `npm test` -- expected: all vitest test suites pass across all workspaces.
- `npm run build` -- expected: clean compilation of core, adapters, web, cli, and desktop.

## Suggested Review Order

**Desktop Package Scaffolding & Configuration**

- Desktop package metadata, dependencies, and builder scripts
  [`packages/desktop/package.json:1`](../../packages/desktop/package.json#L1)

- Multi-OS packaging configuration for Windows, macOS, and Linux
  [`packages/desktop/electron-builder.json:1`](../../packages/desktop/electron-builder.json#L1)

- Monorepo package scripts and build integration
  [`package.json:13`](../../package.json#L13)

**Electron Main Process & Runtime Architecture**

- Standalone in-process server bootstrap and user-data SQLite isolation
  [`packages/desktop/src/bootstrap.ts:1`](../../packages/desktop/src/bootstrap.ts#L1)

- Electron window creation, single-instance lock, system tray, and lifecycle
  [`packages/desktop/src/main.ts:1`](../../packages/desktop/src/main.ts#L1)

- Context-isolated preload script
  [`packages/desktop/src/preload.ts:1`](../../packages/desktop/src/preload.ts#L1)

**Testing & CI/CD Release Pipeline**

- Unit tests for local server bootstrap, ephemeral ports, and storage isolation
  [`packages/desktop/test/desktop.test.ts:1`](../../packages/desktop/test/desktop.test.ts#L1)

- Automated multi-OS GitHub Actions release workflow
  [`.github/workflows/release-desktop.yml:1`](../../.github/workflows/release-desktop.yml#L1)

- Monorepo architecture documentation and developer commands
  [`CONTRIBUTING.md:33`](../../CONTRIBUTING.md#L33)
