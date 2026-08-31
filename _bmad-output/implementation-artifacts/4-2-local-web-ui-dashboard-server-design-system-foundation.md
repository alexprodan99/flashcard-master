---
title: 'Story 4.2: Local Web UI Dashboard Server & Design System Foundation'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: 'f85eceb89d42ba0beece0c8bf02fefbfcc95c2f1'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/implementation-artifacts/4-1-interactive-terminal-setup-wizard-scriptable-cli.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Visual learners and web-first users need a fast, local dashboard server (`http://localhost:3000`) that displays aggregate statistics (cards count, active sources, decks breakdown), provides REST API endpoints, and delivers a clean, responsive single-page design system foundation (FR-402, AD-7).

**Approach:** Implement `WebServer` in `packages/web/src/server.ts` powered by Node HTTP with REST endpoints (`/api/stats`, `/api/sources`, `/api/cards`, `/api/decks`) and an embedded modern responsive HTML/CSS/JS single-page dashboard foundation with KPI cards, navigation sidebar, and sub-100ms startup times. Add `flashcard-master serve` command in `packages/cli`.

## Boundaries & Constraints

**Always:**
- Run completely local on `http://localhost:3000` (or user-specified `--port`) with zero external telemetry (NFR-201, NFR-202).
- Ensure server startup time is under 200ms (NFR-101).
- Provide REST endpoints with standard JSON responses:
  - `GET /api/health`
  - `GET /api/stats`
  - `GET /api/sources`
  - `GET /api/cards`
  - `GET /api/decks`
- Serve self-contained HTML/CSS/JS frontend with responsive CSS grid, KPI stat widgets, and navigation tabs.
- Enable `flashcard-master serve` in `packages/cli` to launch the local web server.

**Ask First:**
- Introducing heavy multi-gigabyte client-side bundling pipelines for the embedded server (v1 embeds clean modern vanilla JS/CSS web foundation for instant loading and zero build complexity).

**Never:**
- Make external network requests or CDN dependencies in the local Web UI.
- Expose the web server outside `localhost` / `127.0.0.1` by default.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GET /api/stats | Valid request | JSON object with `totalCards`, `totalSources`, `totalDecks`, `decks` list | Returns HTTP 200 |
| GET /api/health | Valid request | `{ status: "ok", version: "1.0.0" }` | Returns HTTP 200 |
| GET / (Root Page) | Browser requests `/` | Serves complete responsive HTML5 dashboard with CSS & client JS | Returns HTTP 200 with `text/html` |
| Unknown API Route | `GET /api/unknown` | `{ error: "Not Found" }` | Returns HTTP 404 |
| CLI Serve Command | `flashcard-master serve --port 3000` | Starts WebServer on port 3000 and logs URL | Handles port binding errors |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` -- `WebServer` implementation with REST router & embedded SPA dashboard
- `packages/web/src/index.ts` -- Export `WebServer`, `createWebServer`, `WebServerOptions`
- `packages/cli/src/cli.ts` -- Add `serve` command launching `WebServer`
- `packages/web/test/server.test.ts` -- Integration tests verifying `/api/health`, `/api/stats`, `/api/sources`, and HTML page serving

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/server.ts` -- Implement `WebServer` with REST endpoints and embedded dashboard SPA
- [x] `packages/web/src/index.ts` -- Export `WebServer` and helpers
- [x] `packages/cli/src/cli.ts` -- Add `serve` command to CLI
- [x] `packages/web/test/server.test.ts` -- Integration tests for server REST endpoints and static HTML delivery

**Acceptance Criteria:**
- **Given** a running `WebServer`
- **When** `GET /api/stats` is called
- **Then** aggregate metrics for cards, decks, and sources are returned in JSON.
- **When** `GET /` is requested in a browser
- **Then** the responsive web dashboard is served with HTTP 200.

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: Web server integration tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Web Server & Responsive Dashboard**

- Native Node HTTP server, REST endpoints, and embedded Single Page Application dashboard
  [packages/web/src/server.ts#L1](../../packages/web/src/server.ts#L1)

- CLI serve command integration
  [packages/cli/src/cli.ts#L22](../../packages/cli/src/cli.ts#L22)

**Integration Test Suite**

- Integration tests validating REST API endpoints (/api/health, /api/stats, /api/sources, /api/cards) and SPA serving
  [packages/web/test/server.test.ts#L1](../../packages/web/test/server.test.ts#L1)
