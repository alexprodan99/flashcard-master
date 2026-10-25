# Intent: Epic 20 — Open-Source Foundations, Community Documentation & Cross-Platform Desktop Distribution

## Document Metadata & Core Intent
- **Epic**: Epic 20 — Open-Source Licensing, Documentation Hub, Setup UX, GitHub Automation & Electron Desktop Publishing
- **Target Areas**:
  1. Default LLM Model Auditing & In-Repo Model Advisor Skill
  2. Open-Source AGPL-3.0 Licensing & Sponsorship Integrations
  3. Public Documentation Hub (User Guide, Architecture distillation, GitHub Pages CI/CD & In-App Links)
  4. Contextual Setup UX (Notion 3-Step Walkthrough, Desktop Anki Diagnostics, Empty-State Onboarding)
  5. Cross-Platform GitHub Issue & PR Automation (TypeScript/Node.js Script & In-Repo Workflow Skill)
  6. Open-Source Contribution Standards (Revamped `CONTRIBUTING.md`, Issue/PR Templates, Code of Conduct, Security Policy)
  7. Standalone Desktop Packaging (Electron + `electron-builder` for Windows, macOS, Linux with Automated GitHub Releases)
- **Core Intent**: Solidify Flashcard Master as a production-grade, community-ready, and independently distributed open-source learning application. Protect author intellectual property from proprietary cloud SaaS exploitation via AGPL-3.0, empower users with published online guides and non-technical setup workflows, provide cross-platform automation tools for developers and AI agents, and package the entire stack into signed standalone desktop executables across Windows, macOS, and Linux.
- **Delivery Strategy**: Comprehensive spec breakdown into testable user stories with zero implementation execution before user review and sign-off.

---

## Pillar 1: Default Model Auditing & Model Advisor Skill
- **Current Defaults Retained**:
  - **Google Gemini**: `gemini-3.6-flash` (cutting-edge speed, ~$0.10/1M tokens, native `responseSchema`).
  - **Anthropic Claude**: `claude-haiku-4-5-20251001` (Haiku 4.5, high verbatim quote adherence).
  - **OpenAI**: `gpt-4o-mini` (cost-effective structured JSON generation, ~$0.15/1M tokens).
  - **Ollama**: `phi4-mini` (lightweight offline generation, runs under 4GB VRAM).
- **Scope Restriction**: Retain strictly the 4 established providers (Ollama, Gemini, OpenAI, Anthropic); no new providers added.
- **Documentation Audit**: Audit `README.md`, `docs/settings-configuration.md`, and UI descriptions to purge all mentions of older legacy models (e.g., `gemini-1.5-pro`).
- **In-Repo Model Advisor Skill**:
  - Implement `.agent/skills/model-advisor/` (or repository skill) that evaluates user criteria (budget/cost-per-card, offline privacy, deep reasoning) and recommends optimal provider/model pairings.

---

## Pillar 2: Open-Source Licensing & Community Sponsorship
- **License**: **GNU Affero General Public License v3 (AGPL-3.0)**.
  - **Legal Protection**: Section 13 mandates that anyone running Flashcard Master over a computer network (cloud SaaS or hosted web service) must release the complete corresponding modified source code publicly under AGPL-3.0.
  - **User Freedom**: 100% free for all students, researchers, developers, and desktop users for personal and local use.
  - **Deliverable**: Create root `LICENSE` file and update `package.json` `"license": "AGPL-3.0"`.
- **Sponsorship Integration**:
  - Add `.github/FUNDING.yml` configured for GitHub Sponsors and Buy Me a Coffee.
  - Integrate clean, optional sponsorship links in `README.md` and Documentation footer.

---

## Pillar 3: Documentation Hub & Public Publishing
- **Public Online Docs Site**:
  - Build a clean, modern documentation hub using a static generator (e.g., VitePress / Starlight) hosted on GitHub Pages via automated GitHub Actions CI/CD on pushes to `main`.
- **Structured User Guide (`docs/user-guide/`)**:
  - **Quickstart Guide (3 Minutes)**: Desktop app install, API key configuration, first card synthesis, Anki export.
  - **Data Ingestion Playbook**: Web articles, RSS feeds, Notion workspaces, and EPUB/PDF chapter slicing best practices.
  - **Card Synthesis & Prompt Tuning**: Guide to difficulty scaling (`beginner`, `intermediate`, `expert`), question depth (`atomic` vs `deep-dive`), and personas.
  - **Study & Export Workflows**: AnkiConnect live sync, Kindle/Kobo EPUBs with reveal toggles, and printable 2-column PDF sheets.
  - **Troubleshooting & FAQ**: Resolving AnkiConnect offline errors, API rate limits, database storage location.
- **BMad Output Distillation**:
  - Distill architectural milestones from `_bmad-output/` into clean developer architecture docs (`docs/ARCHITECTURE.md`).
- **In-App Help Integration**: Direct links in Web UI / Desktop navigation to the published docs site.

---

## Pillar 4: Contextual Setup UX & Human-Centric Onboarding
- **Preserve Professional LLM Labels**: Maintain standard developer terminology (`API Key`, `Base URL`) without dumbing down labels, augmenting them with lightweight inline tooltips and direct console links (`Get API Key`).
- **Notion 3-Step Permissions Walkthrough**:
  - Interactive modal/card guiding users: (1) Create integration, (2) Copy internal secret, (3) Explicitly connect the integration to the Notion page/database via the `•••` menu.
  - Actionable diagnostics testing page access rather than just token validity.
- **Desktop Anki Diagnostics**:
  - Live status indicator (`🟢 Anki Ready` / `⚪ Anki Not Running`).
  - Clear 3-step setup guide highlighting add-on code `2055492159`.
  - Friendly connection error handling instead of raw `ECONNREFUSED`.
- **Friendly Slicing Terminology**:
  - Replace technical jargon with human-readable options: `Split by Chapters & Outline (Recommended)`, `Split by Page Blocks (e.g. 10 pages)`, `Keep as Single Document`.
- **First-Run Empty-State Onboarding**:
  - Welcoming onboarding card when zero sources or keys exist, guiding new users to configure their first AI provider and add their first document.

---

## Pillar 5: Cross-Platform GitHub Issue & PR Automation
- **TypeScript / Node.js Automation Engine (`scripts/`)**:
  - Single, portable script (`scripts/github-automation.ts` or `scripts/github-workflow.ts`) eliminating dual PowerShell/Bash maintenance.
  - **Batch Issue Creation**: `npm run gh:issues -- --epic <number>` parses epic and story markdown artifacts, creating the master Epic issue and individual Story issues with standard labels (`epic`, `story`).
  - **Formatted PR Creation**: `npm run gh:pr` parses branch name, auto-extracts story title and acceptance criteria, links `Closes #<id>`, and opens a clean PR via GitHub CLI (`gh`).
- **In-Repo Skill (`.agent/skills/github-workflow/`)**:
  - Agent workflow instructing AI assistants on pre-flight checks, issue generation, branch conventions, and automated PR generation.

---

## Pillar 6: Open-Source Contribution Standards
- **Revamped `CONTRIBUTING.md`**:
  - Ports & Adapters architectural orientation for new developers.
  - Local setup instructions and pre-commit verification gates (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`).
  - Git branching (`feat/...`, `fix/...`) and Conventional Commits format.
- **GitHub Issue & PR Templates (`.github/`)**:
  - `.github/ISSUE_TEMPLATE/bug_report.md` (environment, provider, steps, logs).
  - `.github/ISSUE_TEMPLATE/feature_request.md` (user story, motivation, acceptance ideas).
  - `.github/PULL_REQUEST_TEMPLATE.md` (description, linked issue `Closes #...`, automated checklist).
- **Community Health**:
  - `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).
  - `SECURITY.md` (Responsible disclosure policy for API keys and secrets).

---

## Pillar 7: Standalone Desktop Packaging (Electron) & Multi-OS Releases
- **Framework & Architecture**:
  - **Electron + `electron-builder`**: Wraps the existing local Node.js server (`@flashcard-master/web`), Svelte 5 frontend, and native C++ SQLite bindings (`better-sqlite3`) with zero backend rewrites.
  - Centralized SQLite database path in native OS user data directory (`app.getPath('userData')`).
  - Native window framing with dark slate styling and system tray minimize support.
- **Multi-OS Release Targets**:
  - **Windows**: `.exe` (NSIS installer) & portable `.exe`.
  - **macOS**: `.dmg` (Universal / Apple Silicon arm64 & Intel x64).
  - **Linux**: `.AppImage` & `.deb`.
- **Automated GitHub Actions Publishing Pipeline**:
  - Triggered on git release tag push (e.g. `v1.0.0`).
  - Builds, packages, and signs binaries across Windows, macOS, and Linux runners, automatically creating a GitHub Release with attached download assets.
