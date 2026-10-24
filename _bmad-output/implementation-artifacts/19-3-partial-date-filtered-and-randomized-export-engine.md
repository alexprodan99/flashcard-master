---
title: 'Story 19.3: Partial, Date-Filtered & Randomized Export Engine'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: '185f4007b7193f350ba2bca470c1969a538221b2'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Flashcard Master currently exports entire decks without granular scoping. Users preparing for targeted study sessions cannot export cards generated within a specific timeframe (e.g. today's or this week's synthesis batch), take a randomized subset of $N$ cards for quick review, or enforce a maximum card budget when exporting to Anki, EPUB, Markdown, PDF, CSV, or TSV.

**Approach:**
1. **Core Filtering Extensions (`CardFilter`)**:
   - Add `createdAfter?: string`, `createdBefore?: string`, `shuffle?: boolean` to `CardFilter`.
   - In `FlashcardRepository.buildFilterConditions`, query `created_at >= ?` and `created_at <= ?`.
   - In `FlashcardRepository.list`, support `ORDER BY RANDOM()` when `filter.shuffle` is enabled, respecting `limit`.
2. **Export Service & Adapters (`ExportService`)**:
   - Seamlessly pass `filter` through `ExportRequest` into `cardRepo.list(filter)`. All existing exporters (`apkg`, `epub`, `markdown`, `html`, `pdf`, `csv`, `tsv`) automatically receive the filtered/randomized subset.
3. **Web Server REST Endpoints (`GET /api/export` & `POST /api/ankiconnect/sync`)**:
   - Extract `after` / `createdAfter`, `before` / `createdBefore`, `limit`, and `shuffle` query/body parameters and feed into the card filter.
4. **CLI `export` Command (`packages/cli/src/cli.ts`)**:
   - Add `--after <date>`, `--before <date>`, `--limit <number>`, and `--shuffle` options.
5. **Web UI (`ExportCenter.svelte`)**:
   - Add a "Time & Scope Filter" accordion component allowing:
     - Preset Date Ranges ("All Time", "Last 24 Hours", "Last 7 Days", "Last 30 Days", "Custom Range").
     - Custom start and end date pickers.
     - Partial Card Limit number input.
     - "Randomize / Shuffle Cards" toggle switch.
     - Live card count preview indicating how many cards match the active scope.
     - Carry the time and scope parameters into package download URLs and Anki live sync.

## Boundaries & Constraints

**Always:**
- Use ISO 8601 string comparisons (`YYYY-MM-DDTHH:mm:ssZ` or `YYYY-MM-DD`) in SQLite for reliable date filtering against `flashcards.created_at`.
- When `shuffle: true` is specified with `limit: N`, use SQLite `ORDER BY RANDOM() LIMIT N` to ensure true uniform random subsampling.
- Retain backward compatibility: omitting date range, limit, or shuffle maintains default behavior (all cards in deck sorted by `created_at DESC, id DESC`).
- Keep all existing export formats working without format-specific changes since they consume the pre-filtered `cards: Flashcard[]` array.

**Never:**
- Never mutate or alter cards in the database during export.
- Never crash when a date filter yields 0 cards; return a clear 404 or notification indicating no cards match the filter criteria.

## I/O & Edge-Case Matrix

| Scenario | Input Parameters | Expected Behavior | Error / Fallback |
|---|---|---|---|
| Date Preset: "Last 7 Days" | `createdAfter = now - 7d` | Returns only cards with `created_at >= now - 7d` | If 0 cards, informs user no cards in date range |
| Custom Date Range | `createdAfter = 2026-10-01`, `createdBefore = 2026-10-15` | Returns cards between Oct 1 and Oct 15 | Validates start <= end |
| Random Subsample | `limit = 20`, `shuffle = true` | Returns 20 randomly chosen cards in shuffled order | Returns all cards if total <= 20 |
| Combined Deck + Date + Shuffle | `deck = "Bio"`, `createdAfter = 2026-10-20`, `limit = 10`, `shuffle = true` | Returns up to 10 random cards from "Bio" deck created since Oct 20 | Zero matches handled gracefully |
| CLI Export | `flashcard-master export csv --deck Bio --after 2026-10-01 --limit 25 --shuffle` | Generates CSV file containing 25 random cards from Bio deck created after Oct 1 | Exits with error message if invalid parameters |

</frozen-after-approval>

## Code Map

- `packages/core/src/storage/card-repository.ts` -- Extend `CardFilter` with `createdAfter`, `createdBefore`, `shuffle`. Update `buildFilterConditions` and `list`.
- `packages/core/test/card-repository.test.ts` -- Add unit tests for date range and shuffle filtering.
- `packages/core/src/services/export-service.ts` -- Verify filter forwarding to exporter registry.
- `packages/cli/src/cli.ts` -- Add `--after`, `--before`, `--limit`, `--shuffle` options to `export <format>`.
- `packages/web/src/server.ts` -- Extract partial export query parameters in `GET /api/export` and `POST /api/ankiconnect/sync`.
- `packages/web/client/src/views/ExportCenter.svelte` -- Implement "Time & Scope Filter" accordion with presets, date inputs, card limit, and shuffle toggle.
- `packages/web/client/src/lib/api.ts` -- Update `pushToAnki` options signature.
- `docs/ARCHITECTURE.md` -- Update documentation with export filtering capabilities.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/storage/card-repository.ts` -- Extend `CardFilter` and implement date range & random shuffle filtering in `buildFilterConditions` and `list`.
- [x] `packages/core/test/card-repository.test.ts` -- Add unit tests asserting date range filtering and random ordering.
- [x] `packages/cli/src/cli.ts` -- Add CLI options `--after`, `--before`, `--limit`, `--shuffle` to `export`.
- [x] `packages/cli/test/cli.test.ts` -- Add test coverage for filtered CLI export.
- [x] `packages/web/src/server.ts` -- Update `GET /api/export` and `POST /api/ankiconnect/sync` to handle date range, limit, and shuffle query parameters.
- [x] `packages/web/test/server.test.ts` -- Add integration tests for filtered export and sync endpoints.
- [x] `packages/web/client/src/lib/api.ts` -- Update client API helpers for scoped exports and Anki sync.
- [x] `packages/web/client/src/views/ExportCenter.svelte` -- Add "Time & Scope Filter" UI with preset shortcuts, custom dates, limit budget, and shuffle toggle.
- [x] `docs/ARCHITECTURE.md` -- Document partial and time-scoped export parameters.

**Acceptance Criteria:**
- Given a deck of cards created across multiple dates, filtering by `createdAfter` / `createdBefore` exports only the matching cards across all formats.
- Given a deck of 100 cards, requesting `limit = 25` and `shuffle = true` exports exactly 25 cards in random order.
- In Export Center UI, selecting "Last 7 Days" or "Custom Range" updates the matching card count and scopes file downloads and Anki pushes.
- CLI command `flashcard-master export csv --limit 10 --shuffle` outputs a file with 10 random cards.
- 100% of monorepo tests, typechecks, and builds pass.
