---
title: 'Story 3.2: Desktop AnkiConnect Live Sync Client'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'fb7b70c14be808db81d53e1c8e50c56ee333c93e'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-3-context.md
  - _bmad-output/implementation-artifacts/3-1-native-anki-package-apkg-exporter.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users with Anki Desktop running with the AnkiConnect plugin installed want direct, zero-friction card synchronization directly into their local Anki collection over HTTP without manual file exports and imports (FR-302, AD-6).

**Approach:** Implement `AnkiConnectAdapter` in `packages/adapters/src/export/ankiconnect-adapter.ts` communicating with the local AnkiConnect HTTP API (`http://127.0.0.1:8765`), implementing connection health checks (`version`), automatic deck creation (`createDeck`), batch note addition (`addNotes`), and error isolation conforming to `ExporterPort`.

## Boundaries & Constraints

**Always:**
- Target `http://127.0.0.1:8765` by default (allow custom URL configuration).
- Use AnkiConnect API version `6`.
- Implement `checkHealth()` to verify if Anki is running with AnkiConnect enabled.
- Automatically ensure target deck exists via `createDeck` before inserting notes.
- Format HTML fields with citations in `<div class="citation">`.
- Handle AnkiConnect errors (e.g. Anki closed, connection refused, duplicate notes) gracefully with clear error messages.
- Conforming to `ExporterPort` (`format: "ankiconnect"`).

**Ask First:**
- Adding GUI trigger commands (e.g. `guiBrowse` or `sync`) (planned for UI/CLI integration).

**Never:**
- Crash the process if Anki is not running. Return structured error results.
- Send credentials or data over non-local external networks.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Anki Running & Connected | Valid cards, Anki running on port 8765 | Creates deck, adds notes, returns `successCount` | N/A |
| Anki Closed / Offline | Anki not running on port 8765 | `isOnline: false`, `successCount: 0` | Returns error: "AnkiConnect is offline or unreachable" |
| Existing Deck | Deck already exists in Anki | `createDeck` succeeds idempotently, notes added | N/A |
| Duplicate Note in Anki | Card with identical Front already in Anki | Anki returns `null` for note ID | Recorded in `duplicateOrFailedCards` count |
| Empty Card List | `cards: []` | Returns immediately with `successCount: 0` | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `Flashcard`
- `packages/core/src/ports/index.ts` -- `ExporterPort`, `ExportOptions`, `ExportResult`
- `packages/adapters/src/export/ankiconnect-adapter.ts` -- `AnkiConnectAdapter` implementation
- `packages/adapters/src/index.ts` -- Export `AnkiConnectAdapter`
- `packages/adapters/test/ankiconnect-adapter.test.ts` -- Unit tests mocking `fetch` for health, deck creation, note additions, and offline failure cases

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/export/ankiconnect-adapter.ts` -- Implement `AnkiConnectAdapter` (health check, deck creation, batch note sync, error handling)
- [x] `packages/adapters/src/index.ts` -- Export `AnkiConnectAdapter`
- [x] `packages/adapters/test/ankiconnect-adapter.test.ts` -- Unit tests covering health check, successful batch sync, offline connection errors, and duplicate handling

**Acceptance Criteria:**
- **Given** flashcards and a running AnkiConnect instance
- **When** `AnkiConnectAdapter.export(cards, options)` is executed
- **Then** notes are sent to Anki via `addNotes` and `successCount` matches added note IDs.
- **Given** Anki is closed or unreachable
- **When** `AnkiConnectAdapter.checkHealth()` or `export()` is executed
- **Then** it returns an error result gracefully without throwing uncaught exceptions.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter and AnkiConnect tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.




## Suggested Review Order

**AnkiConnect Bridge Adapter**

- HTTP API client with health check, timeout management, deck creation, and batch note sync
  [packages/adapters/src/export/ankiconnect-adapter.ts#L1](../../packages/adapters/src/export/ankiconnect-adapter.ts#L1)

**Unit Test Suite**

- AnkiConnect unit tests verifying online health, offline error resilience, and batch note response parsing
  [packages/adapters/test/ankiconnect-adapter.test.ts#L1](../../packages/adapters/test/ankiconnect-adapter.test.ts#L1)
