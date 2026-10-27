---
title: 'Story 20.6: Open-Source Contribution Standards & Community Health'
type: 'chore'
created: '2026-10-27'
status: 'done'
baseline_commit: 'f0dfaa9'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Open-source contributors and community members currently lack standardized issue reporting templates, PR guidelines, code of conduct enforcement mechanisms, security reporting policies, and clear pre-PR quality verification instructions.

**Approach:**
Author comprehensive community health standards and developer contribution documentation. Revamp `CONTRIBUTING.md` with strict pre-PR verification gates, Conventional Commits guidelines, and Hexagonal Architecture walkthroughs; implement GitHub issue and pull request templates (`bug_report.md`, `feature_request.md`, `PULL_REQUEST_TEMPLATE.md`); adopt Contributor Covenant v2.1 in `CODE_OF_CONDUCT.md`; and provide responsible vulnerability disclosure guidelines in `SECURITY.md`.

## Boundaries & Constraints

**Always:**
- Use standard GitHub markdown template formats with frontmatter recognized by GitHub's New Issue chooser.
- Adopt the official Contributor Covenant v2.1 verbatim with appropriate contact channels.
- Specify explicit, executable verification commands in `CONTRIBUTING.md` (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`).
- Maintain consistency with the existing AGPL-3.0 licensing and Hexagonal Architecture principles.
- Ensure all repository tests, typechecks, and builds pass cleanly.

**Ask First:**
- Introducing mandatory external automated CI bots or Contributor License Agreements (CLA).

**Never:**
- Never include dead links or unresolved placeholder text (`[INSERT EMAIL HERE]`, `TODO`, `TBD`).
- Never contradict monorepo architecture rules (e.g. core cannot import from adapters or web).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GitHub New Issue | Contributor visits `/issues/new/choose` | Renders Bug Report and Feature Request cards with metadata, descriptions, and pre-assigned labels | Fallback to blank issue if custom issue requested |
| GitHub Pull Request | Contributor opens a new PR | Automatically populates with structured sections (Summary, Linked Issue, Verification Checklist) | PR authors can edit or check off items |
| Security Report | Security researcher finds vulnerability | `SECURITY.md` provides private disclosure instructions via GitHub Security Advisories; explicitly instructs against public issues | Clear response timeline and expectations defined |
| Code of Conduct | Community dispute or harassment incident | `CODE_OF_CONDUCT.md` provides explicit standards, positive/unacceptable behaviors, and enforcement responsibilities | Concrete enforcement guidelines and contact channels |

</frozen-after-approval>

## Code Map

- `CONTRIBUTING.md` -- Comprehensive developer guide covering architecture, local setup, git branching, conventional commits, pre-PR quality gates, and extension patterns.
- `.github/ISSUE_TEMPLATE/bug_report.md` -- Structured bug reporting template with system context (OS, Node, Browser, LLM provider).
- `.github/ISSUE_TEMPLATE/feature_request.md` -- Structured feature proposal template focusing on problem, proposed solution, and alternatives considered.
- `.github/PULL_REQUEST_TEMPLATE.md` -- Pull request template standardizing issue linkage, description, and verification checkboxes.
- `CODE_OF_CONDUCT.md` -- Standard Contributor Covenant v2.1 community guidelines and reporting procedures.
- `SECURITY.md` -- Responsible vulnerability disclosure policy and supported versions table.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Sprint status tracker reflecting Story 20.6.

## Tasks & Acceptance

**Execution:**
- [x] `CONTRIBUTING.md` -- Revamp with architecture overview, local workflow, branch naming, Conventional Commits, pre-PR checklist, and automated GitHub script commands.
- [x] `.github/ISSUE_TEMPLATE/bug_report.md` -- Create structured bug report template with YAML frontmatter.
- [x] `.github/ISSUE_TEMPLATE/feature_request.md` -- Create structured feature request template with YAML frontmatter.
- [x] `.github/PULL_REQUEST_TEMPLATE.md` -- Create PR template with conventional title prompt, issue linkage, and pre-merge verification checklist.
- [x] `CODE_OF_CONDUCT.md` -- Create Contributor Covenant v2.1 community health standard.
- [x] `SECURITY.md` -- Create security vulnerability disclosure policy and reporting process.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep sprint status synchronized.

**Acceptance Criteria:**
- Given `CONTRIBUTING.md`, when reviewed by a contributor, then it provides step-by-step setup, monorepo architecture explanation, branching conventions, and pre-PR test commands.
- Given GitHub issue creation, when a contributor opens a new issue, then bug report and feature request templates are available with structured prompts and labels.
- Given GitHub PR creation, when a contributor opens a pull request, then `PULL_REQUEST_TEMPLATE.md` automatically populates description and verification checklist.
- Given the repository root, when inspecting community health files, then `CODE_OF_CONDUCT.md` and `SECURITY.md` exist and provide clear contact and disclosure guidelines.
- Given `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`, all checks pass cleanly with 0 errors.

## Design Notes

### Hexagonal Architecture Alignment
Ensure `CONTRIBUTING.md` clearly explains the dependency inversion rules:
- `core` contains domain models and ports. It has ZERO dependencies on adapters, web, or cli.
- `adapters` implements ports (LLM vendors, ingestion strategies, exporters).
- `web` and `cli` are composition roots that wire adapters to core services.

### Issue & PR Templates
Use standard GitHub YAML frontmatter for issue templates (`name`, `about`, `title`, `labels`, `assignees`) to ensure native rendering in the GitHub Web UI.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors across monorepo and scripts.
- `npm run lint` -- expected: 0 lint errors.
- `npm test` -- expected: all vitest test suites pass.
- `npm run build` -- expected: clean compilation of all monorepo packages.

## Suggested Review Order

**Contributor Guidelines & Architecture Documentation**

- Comprehensive contributor guide, Hexagonal Architecture primer, quality gates, and branching rules
  [`CONTRIBUTING.md:1`](../../CONTRIBUTING.md#L1)

- Community documentation hub links and security reference
  [`README.md:388`](../../README.md#L388)

**GitHub Issue & Pull Request Templates**

- Defect report template with environment details
  [`bug_report.md:1`](../../.github/ISSUE_TEMPLATE/bug_report.md#L1)

- Feature proposal template with architectural impact questions
  [`feature_request.md:1`](../../.github/ISSUE_TEMPLATE/feature_request.md#L1)

- Pull request template with issue linkage and pre-merge verification checklist
  [`PULL_REQUEST_TEMPLATE.md:1`](../../.github/PULL_REQUEST_TEMPLATE.md#L1)

- Issue chooser configuration and advisory redirection
  [`config.yml:1`](../../.github/ISSUE_TEMPLATE/config.yml#L1)

**Community Health & Responsible Disclosure**

- Contributor Covenant v2.1 code of conduct and enforcement procedures
  [`CODE_OF_CONDUCT.md:1`](../../CODE_OF_CONDUCT.md#L1)

- Responsible security vulnerability disclosure policy and reporting process
  [`SECURITY.md:1`](../../SECURITY.md#L1)

**Quality Tooling & Linting**

- ESLint configuration enforcing rules with legacy regex/assignment compatibility
  [`eslint.config.js:1`](../../eslint.config.js#L1)

- Quiet lint runner script in package configuration
  [`package.json:17`](../../package.json#L17)

