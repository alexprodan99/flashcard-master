# Epic 20 Context: Open-Source Foundations, Community Documentation & Cross-Platform Desktop Distribution

<!-- Compiled from user requirements and design elicitation. -->

## Goal

Solidify Flashcard Master as a production-grade, community-ready, and independently distributed open-source learning application. Establish legal copyleft protection against proprietary SaaS exploitation via AGPL-3.0 with sponsorship channels; provide a published online documentation hub (User Guide, architecture, GitHub Pages); deliver friendly contextual onboarding and non-technical setup UX for AI providers, AnkiConnect, and Notion; implement reusable cross-platform GitHub issue and PR automation in TypeScript with an in-repo workflow skill; institute community contribution standards (CONTRIBUTING.md, templates, Code of Conduct); and package the application into standalone, signed desktop releases for Windows, macOS, and Linux using Electron and automated GitHub Actions.

## Stories

- **Story 20.1:** Model Documentation Audit & In-Repo LLM Model Advisor Skill
  - ID: `20-1-model-documentation-audit-and-model-advisor-skill`
- **Story 20.2:** AGPL-3.0 Licensing & Open-Source Foundation
  - ID: `20-2-agpl-licensing-and-open-source-foundation`
- **Story 20.3:** Public Documentation Hub & GitHub Pages CI/CD Pipeline
  - ID: `20-3-public-documentation-hub-and-github-pages-pipeline`
- **Story 20.4:** Contextual Setup UX & Human-Centric Onboarding
  - ID: `20-4-contextual-setup-ux-and-human-centric-onboarding`
- **Story 20.5:** Cross-Platform GitHub Issue & PR Automation Engine
  - ID: `20-5-cross-platform-github-automation-engine`
- **Story 20.6:** Open-Source Contribution Standards & Community Health
  - ID: `20-6-open-source-contribution-standards-and-community-health`
- **Story 20.7:** Electron Desktop Packaging & Multi-OS Release Pipeline
  - ID: `20-7-electron-desktop-packaging-and-multi-os-release-pipeline`

## Requirements & Design Decisions

1. **Default Model Auditing & Model Advisor Skill:**
   - Retain current cutting-edge defaults for the 4 providers: Gemini (`gemini-3.6-flash`), Anthropic (`claude-haiku-4-5-20251001`), OpenAI (`gpt-4o-mini`), Ollama (`phi4-mini`).
   - Strictly keep to the 4 existing providers (no new providers added).
   - Audit `README.md`, `docs/settings-configuration.md`, and UI strings to purge all references to older legacy models (e.g. `gemini-1.5-pro`).
   - Implement an in-repo advisor skill (`.agent/skills/model-advisor/`) that evaluates user criteria (cost/efficiency, offline privacy, deep synthesis) to recommend optimal model pairings.

2. **AGPL-3.0 Licensing & Open-Source Foundation:**
   - Adopt GNU Affero General Public License v3 (AGPL-3.0) to ensure 100% free community use while legally prohibiting proprietary closed-source SaaS clones over network services.
   - Add root `LICENSE` file and set `"license": "AGPL-3.0"` in `package.json`.
   - Update `README.md` with the official AGPL-3.0 license badge and copyleft summary.
   - Sponsorship channels (`.github/FUNDING.yml`) deferred until active funding accounts (GitHub Sponsors, Buy Me a Coffee) are created.

3. **Public Documentation Hub & GitHub Pages CI/CD:**
   - Author structured User Guide in `docs/user-guide/` covering: Quickstart (3 min), Ingestion Playbook (Web, RSS, Notion, EPUB/PDF slicing), Card Synthesis Tuning, Study & Export Workflows, and Troubleshooting/FAQ.
   - Distill completed BMad architecture and decisions from `_bmad-output/` into public documentation.
   - Configure modern static docs site (VitePress/Starlight) with automated GitHub Actions deployment to GitHub Pages.
   - Add direct in-app links in navigation header to the published documentation site.

4. **Contextual Setup UX & Human-Centric Onboarding:**
   - Preserve standard, professional labels for LLM providers (API Key, Base URL) while adding lightweight contextual tooltips and direct console links (`Get API Key`).
   - Create an interactive 3-step Notion permissions walkthrough modal/card highlighting the need to explicitly invite the integration to target pages via the `•••` menu, with access diagnosis.
   - Implement Desktop Anki setup card with live status indicator (`🟢 Anki Ready` / `⚪ Anki Not Running`), 1-click add-on code `2055492159`, and friendly connection error diagnosis.
   - Replace technical document slicing terms with plain-English options (`Split by Chapters & Outline`, `Split by Page Blocks`, `Keep as Single Document`).
   - Add welcoming first-run onboarding empty state when no sources or keys exist.

5. **Cross-Platform GitHub Issue & PR Automation Engine:**
   - Build a unified TypeScript / Node.js automation script under `scripts/github-workflow.ts` (invocable via `npm run gh:issues` and `npm run gh:pr`), eliminating separate PowerShell and Bash scripts.
   - Support batch issue creation for any epic (master Epic issue + child Story issues) with standard labels (`epic`, `story`).
   - Support automated PR opening from current branch, extracting story descriptions and acceptance criteria, with auto-linking `Closes #<id>`.
   - Wrap workflow in `.agent/skills/github-workflow/`.

6. **Open-Source Contribution Standards:**
   - Revamp `CONTRIBUTING.md` with Ports & Adapters architecture primer, environment setup, and strict test gates (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`).
   - Create GitHub templates: `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, and `.github/PULL_REQUEST_TEMPLATE.md`.
   - Add standard `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1) and `SECURITY.md` vulnerability reporting policy.

7. **Electron Desktop Packaging & Multi-OS Releases:**
   - Package desktop application using Electron with `electron-builder`, wrapping `@flashcard-master/web` (Node.js server, Svelte 5 frontend, and native C++ `better-sqlite3` bindings) with zero backend rewrites.
   - Store SQLite database automatically in native OS user data directory (`app.getPath('userData')`).
   - Provide custom dark slate window header and system tray minimize support.
   - Configure cross-platform build targets: Windows (`.exe` NSIS installer / portable), macOS (`.dmg` Universal/arm64), Linux (`.AppImage` / `.deb`).
   - Implement automated GitHub Actions release workflow triggered on release git tag push to build, package, and publish signed release assets.
