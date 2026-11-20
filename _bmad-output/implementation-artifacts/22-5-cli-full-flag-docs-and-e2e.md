---
title: 'Story 22.5: CLI --full Sync Flag, Documentation & End-to-End Verification Suite'
type: 'feature'
created: '2026-11-18'
status: 'review'
baseline_commit: 'main'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-22-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
CLI `sync` and `sources sync` commands currently always trigger full ingestion without a `--full` flag or clear skipped-item reporting, and User Guide documentation still needs updates reflecting the unified `~/.flashcard-master/` directory across Desktop/Web/CLI, `--data-dir`, Sync New Only default behavior (`--full` to override), and YouTube metadata/item visibility.

**Approach:**
1. **CLI `--full` Flag & Output (`packages/cli/src/cli.ts`)**:
   - Make `flashcard-master sync [sourceId]` and `flashcard-master sources sync [sourceId]` default to `syncMode: 'new-only'`.
   - Add `--full` flag to force `syncMode: 'full'` (re-syncing all items).
   - Display both newly ingested and skipped counts in CLI sync output.
2. **Documentation Updates (`docs/user-guide/quickstart.md`, `docs/user-guide/ingestion-playbook.md`, `docs/user-guide/desktop-app.md` if applicable)**:
   - Document unified `~/.flashcard-master/` storage across Desktop, Web, and CLI (and CLI `--data-dir`).
   - Document **Sync New Only** default behavior, split-button **Full Re-sync**, CLI `--full`, and YouTube metadata/item status badges.
3. **Full Monorepo End-to-End Verification**:
   - Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` across all workspaces.

## Boundaries & Constraints

**Always:**
- Default CLI `sync` and `sources sync` to `'new-only'` unless `--full` is explicitly passed.
- Keep all existing CLI slicing and export flags compatible.

**Never:**
- Never merge or release before `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all pass cleanly.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] `packages/cli/src/cli.ts` -- Add `--full` flag to `sync` and `sources sync` (defaulting to `syncMode: 'new-only'`), and print new + skipped counts clearly.
- [x] `packages/cli/test/cli.test.ts` -- Add tests verifying default `new-only` sync invocation, `--full` flag behavior, and output reporting.
- [x] `docs/user-guide/` -- Update documentation for unified `~/.flashcard-master/` storage across Desktop/Web/CLI, `--data-dir`, Sync New Only vs. `--full`, and YouTube metadata/item visibility.
- [x] Monorepo verification -- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` across all 5 packages.

**Acceptance Criteria:**
- `flashcard-master sync` and `flashcard-master sources sync` default to `syncMode: 'new-only'` and support `--full` for full re-sync, reporting new and skipped item counts clearly.
- User Guide documentation accurately explains the unified `~/.flashcard-master/` directory across Desktop/Web/CLI, `--data-dir`, Sync New Only vs. `--full`, and YouTube metadata identification.
- Full monorepo `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass with zero errors or regressions.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm run lint` -- expected: 0 ESLint errors.
- `npm test` -- expected: all workspace & script tests pass.
- `npm run build` -- expected: all 5 packages build cleanly.
