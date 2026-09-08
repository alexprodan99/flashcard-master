---
title: 'Monorepo Verification & Automated Regression Test Suite'
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
  - _bmad-output/implementation-artifacts/13-1-epub-ebook-export-engine.md
  - _bmad-output/implementation-artifacts/13-2-epub-export-ui-and-endpoints.md
  - _bmad-output/implementation-artifacts/13-3-mixed-difficulty-flashcard-category-and-synthesis.md
  - _bmad-output/implementation-artifacts/13-4-question-explorer-refresh-button.md
  - _bmad-output/implementation-artifacts/13-5-interactive-local-file-picker-source.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 13 introduces cross-cutting modifications across `@flashcard-master/core` (domain models, export format union, SQLite schema CHECK constraint), `@flashcard-master/adapters` (EPUB exporter engine, LLM prompt adapters for mixed difficulty), `@flashcard-master/cli` (CLI `--difficulty mixed` validation), and `@flashcard-master/web` (streaming endpoints, upload route, Svelte 5 components). A dedicated verification suite is required to guarantee 100% test coverage, build integrity, and zero regressions across all workspaces.

**Approach:** Execute comprehensive automated test suites across all packages. Verify that `npm test` runs with 100% test pass rate across all test files (in `core`, `adapters`, `cli`, and `web`), and ensure `npm run build` succeeds cleanly with zero TypeScript errors or Svelte component warnings.

## Boundaries & Constraints

**Always:**
- Ensure all 4 monorepo packages (`core`, `adapters`, `cli`, `web`) compile cleanly via `npm run build`.
- Maintain 100% test pass rate with zero skipped critical tests and zero regression failures.
- Verify cross-platform path handling (Windows backslashes vs POSIX slashes) across all new file upload and EPUB generation routines.

**Ask First:**
- Modifying global test configurations or lowering test coverage thresholds.

**Never:**
- Never merge or mark Epic 13 complete with failing tests or unhandled TypeScript errors.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full Monorepo Test | `npm test` | All packages execute tests; 100% pass | Immediate test failure report |
| Full Monorepo Build | `npm run build` | All packages compile; `dist/` generated with types | Non-zero exit on compile error |
| Cross-Platform Paths | Windows & Linux path tests | File uploads and EPUB paths normalize cleanly | No path separator mismatches |

</frozen-after-approval>

## Code Map

- `packages/core/test/` -- All core unit and integration tests (domain, schema, storage).
- `packages/adapters/test/` -- All adapter tests (EPUB exporter, LLM adapters, ingestion strategies).
- `packages/cli/test/` -- CLI command tests (generate with mixed difficulty, options parsing).
- `packages/web/test/` -- WebServer REST tests (EPUB export, source file upload, cards refresh).

## Tasks & Acceptance

**Execution:**
- [x] Run `npm test -w @flashcard-master/core` and confirm all domain and repository tests pass.
- [x] Run `npm test -w @flashcard-master/adapters` and confirm all exporter and LLM tests pass.
- [x] Run `npm test -w @flashcard-master/cli` and confirm all command parsing tests pass.
- [x] Run `npm test -w @flashcard-master/web` and confirm all REST server and export tests pass.
- [x] Run `npm run build` across the entire monorepo and verify zero TypeScript or Vite build errors.
- [x] Execute `npm test` across all workspaces to confirm end-to-end suite health.

**Acceptance Criteria:**
- Given the complete codebase with all Epic 13 features implemented
- When `npm test` is executed
- Then all test suites pass with 100% success rate across all 4 packages.
- When `npm run build` is executed
- Then all workspaces build with 0 errors.

## Spec Change Log

_None._

## Verification

**Commands:**
- `npm run build` -- expected: all packages compile with 0 errors.
- `npm test` -- expected: 100% of monorepo tests pass.

## Suggested Review Order

1. Full test run output across monorepo
2. Build artifacts and bundle sizes in `dist/`
