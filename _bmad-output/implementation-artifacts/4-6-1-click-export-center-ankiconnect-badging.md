---
title: 'Story 4.6: 1-Click Export Center & AnkiConnect Badging'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: '91936168a2edcea76a26a0f781fe44527f6379ea'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/implementation-artifacts/4-5-inline-card-editor-slide-over-drawer.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners need a centralized Export Center in the Web UI to download flashcards in multiple formats (APKG, CSV, TSV, Markdown, HTML study guide) with deck/tag scoping, and monitor desktop AnkiConnect reachability with 1-click live sync (FR-406, AD-7).

**Approach:** Implement `/api/export`, `/api/ankiconnect/status`, and `/api/ankiconnect/sync` REST endpoints in `packages/web/src/server.ts`, and render a rich Export Center tab in the embedded SPA with scoped filter pickers, 1-click file download triggers, real-time AnkiConnect status badging, and desktop sync buttons.

## Boundaries & Constraints

**Always:**
- Support all 5 export formats: `apkg`, `csv`, `tsv`, `markdown`, `html`.
- Stream or send files with proper MIME types and `Content-Disposition: attachment; filename="flashcards.<ext>"` headers.
- Support scoping exports by target deck and tags.
- Probe desktop AnkiConnect gracefully without throwing unhandled exceptions if the Anki desktop app is closed.
- Keep operations 100% local.

**Ask First:**
- Adding cloud sync destinations (DropBox, Google Drive) — local-first design is standard.

**Never:**
- Block or hang web server requests if AnkiConnect is unreachable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Export CSV Download | `GET /api/export?format=csv&deck=Engineering` | Sends `text/csv` attachment with RFC 4180 escaped content | 400 if invalid format |
| Export APKG Download | `GET /api/export?format=apkg` | Sends `application/octet-stream` binary `.apkg` file | Returns binary payload |
| AnkiConnect Status Check | `GET /api/ankiconnect/status` | Probes `http://127.0.0.1:8765`, returns `{ reachable: boolean }` | Graceful `{ reachable: false }` if down |
| AnkiConnect Desktop Sync | `POST /api/ankiconnect/sync` | Pushes filtered cards to AnkiConnect API | Returns error message if unreachable |

</frozen-after-approval>

## Code Map

- `packages/web/src/server.ts` -- `/api/export`, `/api/ankiconnect/status`, `/api/ankiconnect/sync` endpoints, and Export Center SPA view
- `packages/web/test/server.test.ts` -- Integration tests for export downloads, AnkiConnect endpoints, and UI controls

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/src/server.ts` -- Implement `/api/export` file download endpoint supporting all 5 formats and query filters
- [x] `packages/web/src/server.ts` -- Implement `/api/ankiconnect/status` and `/api/ankiconnect/sync` REST endpoints
- [x] `packages/web/src/server.ts` -- Implement Export Center UI in SPA (scope filters, download action buttons, live AnkiConnect status badge, desktop push sync)
- [x] `packages/web/test/server.test.ts` -- Integration tests for export downloads and AnkiConnect status checks

**Acceptance Criteria:**
- **Given** flashcards in the database
- **When** `GET /api/export?format=csv` is requested
- **Then** the file is generated and returned with attachment headers.
- **Given** the Export Center tab in the Web UI
- **When** a user selects a format and clicks export
- **Then** the file download starts immediately in the browser.
- **Given** the AnkiConnect badge
- **When** Anki is reachable or unreachable
- **Then** the UI reflects the live status with appropriate indicators and sync capabilities.

## Verification

**Commands:**
- `npm test -w @flashcard-master/web` -- expected: Web server integration tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Export Center UI & File Download / AnkiConnect REST Endpoints**

- File download streaming (GET /api/export), desktop AnkiConnect health check (GET /api/ankiconnect/status), and sync trigger (POST /api/ankiconnect/sync) in WebServer:
  [packages/web/src/server.ts#L1415](../../packages/web/src/server.ts#L1415)
- Interactive 1-Click Export Center SPA tab with scope filtering and AnkiConnect badging:
  [packages/web/src/server.ts#L430](../../packages/web/src/server.ts#L430)

**Integration Test Suite**

- Integration tests verifying MIME types, attachment file downloads, and AnkiConnect sync requests:
  [packages/web/test/server.test.ts#L1](../../packages/web/test/server.test.ts#L1)
