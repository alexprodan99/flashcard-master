---
name: github-workflow
description: Automates GitHub issue tracking and pull request workflows in Flashcard Master. Batch-creates Epic and Story issues with standard labels, and generates structured, conventional commit PRs linked to tracking issues.
---

# 🐙 Flashcard Master — GitHub Automation Engine Skill

## Purpose
This skill guides autonomous AI agents and developers in using Flashcard Master's unified, cross-platform GitHub automation engine (`scripts/github-workflow.ts`).

It provides shell-independent automation for:
1. **Batch Issue Creation:** Creating master Epic issues and child Story issues from planning artifacts (`_bmad-output/`) with standard `epic` and `story` labels and deduplication.
2. **Automated Pull Request Authoring:** Generating conventional commit PRs directly from the active feature branch, automatically extracting the story specification, linking `Closes #<id>`, and cross-referencing `Part of Epic #<id>`.

---

## Prerequisites

The automation engine relies on the official GitHub CLI (`gh`):
1. **Installed:** `gh --version`
2. **Authenticated:** `gh auth status`

If unauthenticated, run:
```bash
gh auth login
```

---

## 1. Batch Issue Creation (`gh:issues`)

When a new Epic is planned or beginning execution, use this command to generate GitHub tracking issues for the master Epic and each child Story.

### Command
```bash
# Preview issues to be created (safe simulation)
npm run gh:issues -- --epic <number> --dry-run

# Create master Epic and child Story issues
npm run gh:issues -- --epic <number>
```

### Options & Flags
| Option / Flag | Description |
| :--- | :--- |
| `--epic <number>` | Target epic number (e.g. `20`). Positional argument also accepted (e.g. `npm run gh:issues 20`). |
| `--dry-run` | Simulates issue creation, prints parsed data, and verifies without mutating GitHub. |

### How It Works
- **Idempotency & Deduplication:** Queries existing GitHub issues via `gh issue list --state all` before attempting to create new ones. Skips already created or closed issues to avoid duplicate entries.
- **Data Extraction:** Reads `_bmad-output/implementation-artifacts/epic-<N>-context.md` (or fallbacks to `_bmad-output/planning-artifacts/epics.md`).
- **Master Epic Issue:** Creates `[Epic <N>] <Epic Title>` with label `epic`.
- **Child Story Issues:** Creates `[Story <N>.<S>] <Story Title>` with label `story` and markdown body containing `Part of Epic #<epic_issue_number>`, deliverables, and acceptance criteria.

---

## 2. Automated Pull Request Creation (`gh:pr`)

When implementation and verification for a story are complete, use this command to open a pull request on GitHub.

### Command
```bash
# Preview PR title, body, and issue linkage without opening PR
npm run gh:pr -- --dry-run

# Open Pull Request from active branch
npm run gh:pr
```

### Options & Flags
| Option / Flag | Description |
| :--- | :--- |
| `--dry-run` | Prints generated PR title and markdown body to stdout without calling GitHub. |
| `--draft` | Creates the PR in draft mode (`--draft`). |
| `--scope <scope>` | Overrides conventional commit scope (e.g. `ui`, `scripts`, `docs`, `core`, `desktop`). |

### How It Works
1. **Branch Detection:** Inspects active git branch (must follow `feat/story-<epic>-<story>-<slug>` or `feat/<epic>-<story>-<slug>`).
2. **Spec Ingestion:** Reads the matching story artifact from `_bmad-output/implementation-artifacts/<epic>-<story>-*.md`. Extracts approach, tasks, and verification commands.
3. **Issue Linkage:** Resolves open/closed issue numbers matching `[Story <epic>.<story>]` and `[Epic <epic>]`. Formats `Closes #<story_id>` and `Part of Epic #<epic_id>`.
4. **Conventional Commit Title:** Generates `feat(<scope>): Story <epic>.<story> - <Title>`.
5. **Deduplication:** Checks if a PR already exists for the active branch to prevent duplicate PR creation.

---

## 3. Integration into the BMad Development Loop

When executing stories under BMad (`bmad-build`):
1. **Before Story Development:** If issues for the active epic have not been tracked in GitHub yet, run:
   ```bash
   npm run gh:issues -- --epic <number>
   ```
2. **During Story Development:** Work on branch `feat/story-<epic>-<story>-<slug>`.
3. **At Step-04 Review / Checkpoint 2:** Push your branch and run:
   ```bash
   git push -u origin <branch-name>
   npm run gh:pr
   ```

---

## 4. Troubleshooting & Best Practices

- **"Current branch does not match a story branch naming convention":**
  Ensure you are on a branch such as `feat/story-20-5-cross-platform-github-automation-engine`. PR creation is disallowed from `main`.
- **"Command failed: gh auth status":**
  Run `gh auth login` to refresh credentials.
- **Handling Multi-Word or Quoted Arguments:**
  The automation engine uses Node's standard `execFileSync` passing arguments as typed arrays and sending large markdown bodies via stdin (`--body-file -`). This guarantees 100% immunity from Windows CMD quote corruption or command-line buffer overflows.
