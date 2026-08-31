---
title: 'Story 4.1: Interactive Terminal Setup Wizard & Scriptable CLI'
type: 'feature'
created: '2026-08-31'
status: 'done'
baseline_commit: 'eca0c817252ba4e1ea8a8dd126dd34f8c5e007ba'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-4-context.md
  - _bmad-output/implementation-artifacts/epic-3-retro-2026-08-31.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Terminal power users, DevOps pipelines, and automated cron jobs need a scriptable command-line interface (`flashcard-master`) with subcommands for source management, delta sync, LLM generation, and multi-format exports, alongside an interactive `init` wizard for first-time configuration (FR-401, AD-7).

**Approach:** Implement the CLI application in `packages/cli` using `commander`, wiring all core services (`DataSourceRepository`, `SyncStateRepository`, `StrategyRegistry`, `IngestionService`, `CardGenerationService`, `GroundingGuard`, `CardDeduplicationService`, `FlashcardRepository`, `ExportService`, `ExporterRegistry`) and adapters (`RssIngestionStrategy`, `WebReaderStrategy`, `LocalFileStrategy`, `createLLMAdapter`, `AnkiPackageExporter`, `AnkiConnectAdapter`, `CsvExporter`, `TsvExporter`, `MarkdownExporter`, `HtmlStudyGuideExporter`).

## Boundaries & Constraints

**Always:**
- Provide executable CLI binary named `flashcard-master`.
- Support scriptable subcommands with JSON or formatted table outputs:
  - `sources add <name> <type> <uri> [--deck <deck>] [--tags <tags>]`
  - `sources list`
  - `sources remove <id>`
  - `sync [source-id]`
  - `generate [--source <id>] [--provider <p>] [--difficulty <d>] [--persona <persona>] [--deck <deck>]`
  - `export <format> [--deck <deck>] [--tag <tag>] [--out <path>]`
  - `init` (interactive setup wizard configuring default provider and initial source)
- Maintain zero external cloud dependency (stores local SQLite DB at `~/.flashcard-master/flashcards.db` or `./flashcards.db`).
- Exit with standard exit codes (`0` for success, non-zero for errors).

**Ask First:**
- Adding interactive TUI dashboards (e.g. `blessed` / `ink`) in CLI (standard formatted terminal stdout/stderr is standard for v1).

**Never:**
- Hardcode API keys or sensitive user data in logs or stdout.
- Block non-interactive stdin in scriptable CLI commands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add Source Command | `sources add "My Feed" rss "https://example.com/rss.xml"` | Validates, saves to SQLite, outputs source ID | Validates with Zod |
| Sync Command | `sync` | Fetches delta items across all sources, returns counts | Per-source fault isolation |
| Generate Command | `generate --provider openai --deck Tech` | Generates, verifies citations, dedups, persists cards | Logs errors cleanly |
| Export Command | `export apkg --deck Tech --out ./tech.apkg` | Exports `.apkg` file to disk | Returns exit code 0 |
| Unknown Command | `flashcard-master foobar` | Displays help message and exits with code 1 | Commander error handling |

</frozen-after-approval>

## Code Map

- `packages/cli/package.json` -- `bin`, `commander` dependency
- `packages/cli/src/app.ts` -- CLI container wiring repositories and services
- `packages/cli/src/cli.ts` -- Commander program and command declarations
- `packages/cli/src/bin.ts` -- Executable bin entrypoint (`#!/usr/bin/env node`)
- `packages/cli/src/index.ts` -- Library export of CLI program
- `packages/cli/test/cli.test.ts` -- Integration tests executing subcommands against in-memory/temp SQLite databases

## Tasks & Acceptance

**Execution:**
- [x] `packages/cli/package.json` -- Configure `bin` and dependencies (`commander`)
- [x] `packages/cli/src/app.ts` -- Implement dependency container wiring core repositories and adapter exporters/strategies
- [x] `packages/cli/src/cli.ts` -- Implement `createCli()` with `sources`, `sync`, `generate`, `export`, and `init` commands
- [x] `packages/cli/src/bin.ts` -- Add executable bin runner
- [x] `packages/cli/test/cli.test.ts` -- Integration tests for sources, sync, generate, and export commands

**Acceptance Criteria:**
- **Given** the `flashcard-master` CLI
- **When** `sources add`, `sources list`, `export` commands are executed
- **Then** the operations succeed and appropriate output and exit codes are returned.
- **Given** `export apkg --out ./output.apkg`
- **When** executed
- **Then** the file is generated on disk.

## Verification

**Commands:**
- `npm test -w @flashcard-master/cli` -- expected: CLI integration tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**CLI Application Setup & Wiring**

- Dependency injection container for all core repositories, services, strategies, and exporters
  [packages/cli/src/app.ts#L1](../../packages/cli/src/app.ts#L1)

- Commander program defining sources, sync, generate, xport, and init commands
  [packages/cli/src/cli.ts#L1](../../packages/cli/src/cli.ts#L1)

- Shebang entrypoint runner
  [packages/cli/src/bin.ts#L1](../../packages/cli/src/bin.ts#L1)

**Integration Test Suite**

- Integration tests executing CLI commands against in-memory SQLite instances
  [packages/cli/test/cli.test.ts#L1](../../packages/cli/test/cli.test.ts#L1)
