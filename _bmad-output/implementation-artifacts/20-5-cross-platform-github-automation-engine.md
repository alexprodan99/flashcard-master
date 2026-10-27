---
title: 'Story 20.5: Cross-Platform GitHub Issue & PR Automation Engine'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_commit: '3263741'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Manual GitHub issue and pull request authoring across epics and stories introduces human friction, inconsistent labeling (`epic`, `story`), omitted issue linkages (`Closes #<id>`, `Part of Epic #<id>`), platform incompatibilities between Bash and PowerShell scripts, and workflow overhead for both developers and autonomous AI agents.

**Approach:**
Implement a unified, cross-platform TypeScript automation engine (`scripts/github-workflow.ts`) with top-level NPM script commands (`npm run gh:issues`, `npm run gh:pr`) and a dedicated in-repo agent workflow skill (`.agent/skills/github-workflow/`). Support batch creation of master Epic and child Story issues with deduplication, and automated PR generation linking the active story branch to its tracking issue and epic.

## Boundaries & Constraints

**Always:**
- Execute natively on Windows, macOS, and Linux without shell-specific dependencies.
- Use `tsx` to run TypeScript scripts directly without manual compilation steps.
- Provide a `--dry-run` flag for all subcommands (`issues`, `pr`) to safely simulate and preview operations without network mutations.
- Check GitHub before creating issues or PRs to guarantee idempotency and prevent duplicate issues.
- Provide friendly, actionable diagnostics when GitHub CLI (`gh`) is missing or unauthenticated.
- Ensure all TypeScript typechecks, linting, and unit test suites pass cleanly.

**Ask First:**
- Deleting or closing existing GitHub issues or PRs.
- Automatically force-pushing or pushing branches to origin without user visibility.

**Never:**
- Never use shell-specific syntax, platform-specific line endings (`\r\n`), or hardcoded OS binary names (`cmd.exe`, `powershell.exe`, `/bin/bash`).
- Never spawn untyped or unescaped shell strings directly subject to command injection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Batch issues creation | `npm run gh:issues -- --epic 20` | Finds existing Epic #44 and Stories 20.1–20.4; creates missing Story issues (20.5, 20.6, 20.7) with `story` label and `Part of Epic #44` | Logs duplicates as skipped; reports created issue URLs |
| Batch issues dry-run | `npm run gh:issues -- --epic 20 --dry-run` | Prints parsed Epic and Story titles, labels, and issue bodies without executing `gh issue create` | Validates input format; reports validation errors if files missing |
| PR creation on story branch | `npm run gh:pr` on branch `feat/story-20-5-cross-platform-github-automation-engine` | Extracts story 20.5 spec, finds issue `[Story 20.5]`, compiles conventional title and PR body with `Closes #<id>`, creates or updates PR | If PR already exists, displays PR URL and details |
| PR creation dry-run | `npm run gh:pr -- --dry-run` | Previews conventional commit PR title, body, and issue linkages to stdout without calling `gh pr create` | Validates branch and spec existence |
| PR on non-story branch | `npm run gh:pr` on `main` or unparseable branch | Halts with error explaining a valid story branch (e.g. `feat/story-20-5-...`) is required | Exit code 1 with actionable guidance |
| Missing `gh` CLI or auth | `gh` not found in PATH or unauthenticated | Detects missing binary or unauthenticated exit code | Prints instructions: install `gh` and run `gh auth login` |

</frozen-after-approval>

## Code Map

- `package.json` -- Root scripts `"gh:issues"` and `"gh:pr"`, `"tsx"` devDependency, and test script integration.
- `scripts/github-workflow.ts` -- Cross-platform TypeScript automation engine with `issues` and `pr` subcommands, parsing, formatting, and GitHub CLI orchestration.
- `scripts/github-workflow.test.ts` -- Vitest unit tests verifying epic/story parsing, issue body generation, PR title/body formatting, dry-run mode, and error handling.
- `.agent/skills/github-workflow/SKILL.md` -- In-repo AI agent skill providing complete instructions for automated issue tracking and PR generation.
- `.agents/skills/github-workflow/SKILL.md` -- Mirrored agent skill for IDE and agent workspace discovery.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Sprint status tracker reflecting Story 20.5 progress.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- Add `tsx` to devDependencies, add scripts `"gh:issues": "tsx scripts/github-workflow.ts issues"` and `"gh:pr": "tsx scripts/github-workflow.ts pr"`, and update `"test"` to include script tests.
- [x] `scripts/github-workflow.ts` -- Implement cross-platform automation engine with modular functions (`parseEpicData`, `parseStorySpec`, `getCurrentBranchInfo`, `formatIssueBody`, `formatPrTitleAndBody`, `runGh`, `executeIssuesCommand`, `executePrCommand`).
- [x] `scripts/github-workflow.test.ts` -- Add unit test suite testing parser functions, deduplication detection, dry-run simulation, and PR template generation with mock runner.
- [x] `.agent/skills/github-workflow/SKILL.md` & `.agents/skills/github-workflow/SKILL.md` -- Create comprehensive agent skill documentation covering command arguments, workflow integration, and troubleshooting.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep sprint status synchronized.

**Acceptance Criteria:**
- Given a user running `npm run gh:issues -- --help`, when executed on Windows, macOS, or Linux, then clear CLI usage and flags are rendered.
- Given an epic number, when running `npm run gh:issues -- --epic <number>`, then the engine checks for existing issues, avoids creating duplicates, and batch-creates missing story issues labeled `story` linked to the master Epic issue.
- Given an active story branch, when running `npm run gh:pr`, then the story spec is read, tracking issue numbers are resolved via GitHub CLI, and a conventional commit PR title and body with `Closes #<id>` and `Part of Epic #<id>` are prepared.
- Given `.agent/skills/github-workflow/SKILL.md`, then autonomous agents have complete, unambiguous instructions to manage issues and PRs across sprints.
- Given `npm test`, then all workspace tests and `scripts/github-workflow.test.ts` pass with 0 errors.

## Design Notes

### Execution Model & Testability
`scripts/github-workflow.ts` abstracts CLI execution via an injectable runner:
```typescript
export interface CommandRunner {
  exec(command: string, args: string[]): string;
}
```
In production, `defaultCommandRunner` executes via `child_process.execFileSync` with `windowsHide: true`. In unit tests, a mock runner simulates `gh` and `git` command outputs without touching the network or filesystem state.

### PR Title Convention
Follows the repository's established conventional commit style:
`feat(<scope>): Story <epic>.<story> - <title>`
Scope is inferred from modified paths (e.g., `scripts`, `ui`, `core`, `docs`) or defaults to `feature`.

### Resilient Markdown Parsing
The parser extracts epic and story metadata from `_bmad-output/implementation-artifacts/epic-<N>-context.md` or `_bmad-output/planning-artifacts/epics.md` using robust heading/bullet patterns rather than rigid line numbering.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors across all monorepo packages and scripts.
- `npm test` -- expected: all vitest test suites pass, including `scripts/github-workflow.test.ts`.
- `npm run gh:issues -- --epic 20 --dry-run` -- expected: previews Epic 20 existing issues and new missing story issues.
- `npm run gh:pr -- --dry-run` -- expected: previews PR title, body, and issue linkage for `feat/story-20-5-cross-platform-github-automation-engine`.

## Suggested Review Order

**Cross-Platform Automation Engine & CLI Dispatcher**

- CLI entry point and flexible command/argument normalizer
  [`github-workflow.ts:762`](../../scripts/github-workflow.ts#L762)

- Subprocess command runner with shell-independent binary execution and stdin piping
  [`github-workflow.ts:24`](../../scripts/github-workflow.ts#L24)

- Batch issue creation with idempotency and duplicate checking
  [`github-workflow.ts:520`](../../scripts/github-workflow.ts#L520)

- Active branch parser and story issue resolution
  [`github-workflow.ts:246`](../../scripts/github-workflow.ts#L246)

- Pull request authoring with conventional commit title and issue linking
  [`github-workflow.ts:680`](../../scripts/github-workflow.ts#L680)

**Autonomous Agent Guidance**

- Complete agent instructions and troubleshooting guide for issue and PR automation
  [`SKILL.md:1`](../../.agent/skills/github-workflow/SKILL.md#L1)

**Testing & Verification**

- Unit test suite covering all matrix edge cases, parsers, and mock execution
  [`github-workflow.test.ts:1`](../../scripts/github-workflow.test.ts#L1)

- Root script aliases and workspace test runner integration
  [`package.json:14`](../../package.json#L14)

