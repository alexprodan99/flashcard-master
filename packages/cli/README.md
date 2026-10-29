# @flashcard-master/cli

[![npm version](https://img.shields.io/npm/v/@flashcard-master/cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@flashcard-master/cli)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-green.svg?style=flat-square)](https://alexprodan99.github.io/flashcard-master/)

Official command-line interface and local web studio launcher for **Flashcard Master** — the local-first, grounded AI flashcard generation suite with cryptographic verbatim quote verification.

---

## ⚡ Quick Start

### 1. Run via `npx` (No installation needed)
```bash
npx @flashcard-master/cli serve
```
Open your browser at `http://localhost:3088` to access the interactive Svelte 5 studio.

### 2. Global Installation
```bash
npm install -g @flashcard-master/cli
```

Verify the installation:
```bash
flashcard-master --version
flashcard-master --help
```

---

## 🚀 Key Commands

### Start the Local Web UI Dashboard
Starts the local REST backend and serves the interactive Svelte 5 frontend studio:
```bash
flashcard-master serve
flashcard-master serve --port 3000
```

### Initialize Storage & Settings
Sets up the local SQLite database at `~/.flashcard-master/flashcards.db` and launches an interactive setup wizard:
```bash
flashcard-master init
```

### Ingest Data Sources
Add web articles, RSS feeds, Notion databases, or local files (EPUB, PDF, Markdown):
```bash
# Add a web article
flashcard-master source add https://en.wikipedia.org/wiki/Spaced_repetition

# Add an RSS / Atom feed
flashcard-master source add https://news.ycombinator.com/rss

# Sync all active data sources
flashcard-master sync
```

### Synthesize Grounded Flashcards
Generate atomic active-recall flashcards grounded with verbatim source citations:
```bash
flashcard-master generate --source-id <source-uuid> --cards 10 --difficulty intermediate --persona socratic
```

### Export to Anki & E-Readers
Export your generated cards directly into your study workflow:
```bash
# Sync live to Desktop Anki via AnkiConnect
flashcard-master export --deck "Computer Science" --format anki-connect

# Export standalone offline .apkg package
flashcard-master export --deck "Computer Science" --format apkg --output ./deck.apkg

# Export e-reader EPUB study book
flashcard-master export --deck "Computer Science" --format epub --output ./study-guide.epub
```

---

## 🔒 100% Local-First & Private

All data sources, extracted documents, and synthesized flashcards reside strictly on your local disk in SQLite with WAL mode enabled (`~/.flashcard-master/flashcards.db`). No telemetry, analytics, or user data is ever transmitted to external servers.

---

## 📚 Documentation & Ecosystem

- **[Documentation Hub](https://alexprodan99.github.io/flashcard-master/)**
- **[System Architecture](https://alexprodan99.github.io/flashcard-master/architecture)**
- **[Configuration Guide](https://alexprodan99.github.io/flashcard-master/settings-configuration)**
- **[GitHub Repository](https://github.com/alexprodan99/flashcard-master)**

### Related Packages
- [`@flashcard-master/core`](https://www.npmjs.com/package/@flashcard-master/core) — Domain kernel, SQLite repositories, and grounding verification.
- [`@flashcard-master/adapters`](https://www.npmjs.com/package/@flashcard-master/adapters) — Ingestion strategies, LLM vendor adapters, and exporters.
- [`@flashcard-master/web`](https://www.npmjs.com/package/@flashcard-master/web) — Svelte 5 client and Node.js REST server.

---

## 📄 License

GNU Affero General Public License v3.0 ([AGPL-3.0](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)).
