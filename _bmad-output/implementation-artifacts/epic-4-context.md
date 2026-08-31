# Epic 4 Context: User Interfaces (Interactive CLI & Local Web UI)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide intuitive, human-centered user interfaces for both terminal power users (scriptable CLI with an interactive setup wizard) and visual learners (a responsive local Web UI dashboard powered by Express / Fastify / Node HTTP with card review, source management, inline flashcard editing, and 1-click export).

## Stories

- Story 4.1: Interactive Terminal Setup Wizard & Scriptable CLI
- Story 4.2: Local Web UI Dashboard Server & Design System Foundation
- Story 4.3: Sources Manager UI with Live Sync Status
- Story 4.4: Question Explorer Filter Chips & Visual Card Grid
- Story 4.5: Inline Card Editor Slide-Over Drawer
- Story 4.6: 1-Click Export Center & AnkiConnect Badging

## Requirements & Constraints

- **CLI Framework (FR-401, AD-7):** Built using `commander` in `packages/cli`, supporting commands:
  - `flashcard-master sources add <name> <type> <uri>`
  - `flashcard-master sources list`
  - `flashcard-master sync [source-id]`
  - `flashcard-master generate [source-id]`
  - `flashcard-master export <format> [options]`
  - `flashcard-master init` (interactive setup wizard using `@inquirer/prompts` or `inquirer` / `prompts`)
- **Local Web UI (FR-402 .. FR-406, AD-7):** Embedded web application served locally on `http://localhost:3000` via Express / Node HTTP API connecting to `@flashcard-master/core` and `@flashcard-master/adapters`.
- **Zero Cloud & Zero Telemetry (NFR-201, NFR-202):** Local-only execution; UI runs completely on `localhost` against the local SQLite database.
- **Fast Startup & Response (NFR-101, NFR-102):** CLI cold start under 200ms, Web UI page load under 500ms.

## Technical Decisions

- **CLI Package (`packages/cli`):** Uses `commander`, `chalk` / `kleur` or ANSI styling, and interactive prompts. Executable bin: `flashcard-master`.
- **Web UI Package (`packages/web`):** Embedded local server with REST API endpoints (`/api/sources`, `/api/cards`, `/api/decks`, `/api/export`, `/api/settings`) and lightweight responsive HTML5/vanilla JS or React/Vite front-end.
