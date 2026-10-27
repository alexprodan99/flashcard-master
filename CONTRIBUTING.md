# 🤝 Contributing to Flashcard Master

Thank you for your interest in contributing to **Flashcard Master**!

Flashcard Master is an open-source, local-first learning platform built under the **GNU Affero General Public License v3 (AGPL-3.0)**. It transforms diverse knowledge materials (Web articles, RSS/Atom feeds, XML sitemaps, LLMs.txt catalogs, Notion workspaces, EPUBs, and local documents) into hallucination-free, verbatim-grounded active-recall flashcards with zero telemetry.

We welcome contributions from developers, technical writers, and learners of all backgrounds. This guide will walk you through our architecture, local development workflow, quality gates, and pull request procedures.

---

## 🏛️ Monorepo Architecture: Ports & Adapters

Flashcard Master follows **Clean Hexagonal Architecture (Ports & Adapters)**. Domain rules and business logic are strictly isolated from vendor SDKs, databases, and UI frameworks.

```
flashcard-master/
├── packages/
│   ├── core/           # 🧠 Domain models, repositories, ports & business services
│   │   ├── src/domain/     # Pure TypeScript models & Zod schemas
│   │   ├── src/ports/      # Interface contracts (LLMProvider, IngestionStrategy, Exporter)
│   │   ├── src/services/   # Generation, chunking, deduplication, grounding guard
│   │   └── src/storage/    # SQLite database client, migrations & repositories
│   │
│   ├── adapters/       # 🔌 Concrete external technology implementations
│   │   ├── src/ingestion/  # RSS, Web Reader, Local File, Sitemap, LLMs.txt, Notion, EPUB
│   │   ├── src/llm/        # Ollama, Gemini, OpenAI, Claude provider adapters
│   │   └── src/export/     # Anki (.apkg), AnkiConnect HTTP, CSV, TSV, Markdown, PDF, EPUB
│   │
│   ├── cli/            # 💻 Terminal interface & interactive wizards
│   │   ├── src/app.ts      # Application context & dependency injection container
│   │   └── src/cli.ts      # Commander.js CLI commands (init, source, sync, generate, export, serve)
│   │
│   └── web/            # 🌐 Local Single-Page Application (SPA) & REST backend
│       ├── src/server.ts   # Node.js HTTP REST API server
│       └── client/         # Svelte 5 + Vite reactive frontend dashboard
│           └── src/views/  # Dashboard, Sources, Generate Studio, Question Explorer, Export Center
│
├── scripts/            # 🛠️ Cross-platform TypeScript automation tooling (GitHub issue/PR engine)
├── docs/               # 📖 Public documentation hub (VitePress)
├── .github/            # 🐙 CI/CD workflows, issue templates, and PR template
└── _bmad-output/       # 📋 BMad agile planning and implementation specifications
```

### Architectural Dependency Invariants:
1. **`core` has ZERO external dependencies** on UI, CLI, or specific provider libraries. It imports only standard libraries, utilities, and schema validators (Zod).
2. **`adapters` depends only on `core`** to implement port interfaces. Adapters never import from `cli` or `web`.
3. **`cli` and `web` are composition roots**. They wire concrete adapters into core service constructors via dependency injection.
4. **Local-first & Private:** All user credentials and documents reside locally in SQLite (`flashcards.db`). No telemetry or analytics are permitted.

---

## ⚡ Quickstart: Local Setup

### 1. Prerequisites
* **Node.js:** `v20.x` or `v22.x` (LTS recommended)
* **npm:** `v10+` (monorepo workspaces enabled)
* **Git:** Installed and configured
* **GitHub CLI (`gh`):** Recommended for automated issue tracking and PR generation (`gh auth status`)

### 2. Clone & Install
```bash
# Clone repository
git clone https://github.com/alexprodan99/flashcard-master.git
cd flashcard-master

# Install all workspace dependencies
npm install

# Build all TypeScript packages and Svelte client
npm run build

# Run unit tests across all packages
npm test
```

### 3. Launch Development Environment
```bash
# Launch local Web UI dashboard server at http://localhost:3000
npm start

# Run VitePress documentation site locally
npm run docs:dev

# Run CLI commands directly
node packages/cli/dist/bin.js --help
```

---

## 🌿 Git Workflow & Branching Conventions

We use structured feature branch naming and Conventional Commits to keep our release history clean and automated.

### 1. Branch Naming
Create branches off the latest `main`:
```bash
git checkout main
git pull origin main
git checkout -b <branch-type>/<description>
```

| Branch Format | Example | When to Use |
| :--- | :--- | :--- |
| `feat/story-<epic>-<story>-<slug>` | `feat/story-20-6-open-source-contribution-standards` | Sprint stories linked to BMad specifications |
| `feat/<feature-name>` | `feat/quizlet-deck-exporter` | New features outside sprint cycles |
| `fix/<bug-name>` | `fix/anki-connect-timeout` | Bug fixes and patches |
| `docs/<topic>` | `docs/notion-setup-guide` | Documentation additions and improvements |
| `chore/<maintenance>` | `chore/upgrade-vitest-v3` | Dependency upgrades, tooling, or cleanup |

### 2. Conventional Commits
All commit messages must adhere to the [Conventional Commits specification](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description in lowercase or title>
```

**Common types:**
- `feat`: A new feature or capability
- `fix`: A bug fix or patch
- `docs`: Documentation changes
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or correcting tests
- `chore`: Tooling, build scripts, or dependency updates

**Examples:**
- `feat(scripts): Story 20.5 - cross-platform GitHub issue and PR automation engine`
- `fix(web): resolve silent Anki connection test error toast on mount`
- `docs(user-guide): add illustrated 3-step Notion permissions guide`

---

## 🚀 GitHub Automation Engine (`npm run gh:*`)

Flashcard Master includes an automated, cross-platform TypeScript automation tool (`scripts/github-workflow.ts`) to manage issues and pull requests:

```bash
# Batch-create Epic and Story issues from planning artifacts
npm run gh:issues -- --epic <number>
# Or preview without making changes:
npm run gh:issues -- --epic <number> --dry-run

# Automatically generate and open a PR for your active branch
npm run gh:pr
# Or preview the PR title, body, and issue linkages:
npm run gh:pr -- --dry-run
```

---

## 🛡️ Pre-PR Quality Verification Gates

Before submitting a pull request, ensure all four verification gates pass locally:

```bash
# 1. Typecheck: Verify 0 TypeScript errors across monorepo and scripts
npm run typecheck

# 2. Lint: Check formatting and lint rules
npm run lint

# 3. Test: Run all unit and integration test suites
npm test

# 4. Build: Verify clean builds across core, adapters, cli, and web
npm run build
```

> ⚠️ **Pull requests that fail typecheck, linting, or tests will not be merged.**

---

## 🧪 Testing Guidelines

We use **Vitest** for fast, deterministic unit and integration testing.

### Test Invariants:
1. **Deterministic SQLite State:** Use in-memory SQLite instances in tests:
   ```typescript
   import { createDatabaseClient } from '@flashcard-master/core';
   const db = createDatabaseClient({ inMemory: true });
   ```
2. **Zero External Network Calls in Unit Tests:** Mock all HTTP calls (`fetch`, `http`, LLM API endpoints) using Vitest mocks (`vi.fn()`, `vi.spyOn()`).
3. **Strict Verbatim Grounding Guard:** Every generated flashcard test must verify that quotes match the source text substring exactly.
4. **Clean Tear-down:** Close database handles and server instances in `afterEach` or `afterAll` hooks to prevent open handles.

---

## 📋 Pull Request Checklist

When opening a pull request, verify the following:

- [ ] Branch is rebased onto the latest `main`.
- [ ] PR title follows Conventional Commits: `feat(scope): ...`, `fix(scope): ...`.
- [ ] PR description links the tracking issue (e.g., `Closes #123`) and epic (e.g., `Part of Epic #45`).
- [ ] All four quality gates pass cleanly: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] New features or bug fixes include corresponding unit or integration tests.
- [ ] Documentation and user guide are updated if UI, CLI, or configuration changes were introduced.

---

## 📜 Community Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) (Contributor Covenant v2.1). Please read it to understand our community standards and reporting procedures.

---

## 🔒 Security Vulnerabilities

Please do not open public GitHub issues for security vulnerabilities. Review our [Security Policy](SECURITY.md) for instructions on confidential disclosure.
