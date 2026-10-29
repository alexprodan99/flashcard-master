# @flashcard-master/web

[![npm version](https://img.shields.io/npm/v/@flashcard-master/web.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/@flashcard-master/web)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-green.svg?style=flat-square)](https://alexprodan99.github.io/flashcard-master/)

Local Web UI Dashboard and REST API server for **Flashcard Master**.

---

## 🎨 Overview

`@flashcard-master/web` provides the interactive graphical user interface and local HTTP server for Flashcard Master:

- **Reactive Svelte 5 Studio**: Built using the latest Svelte 5 Runes system (`$state`, `$derived`, `$effect`) for zero-bloat state reactivity.
- **REST API Server (`server.ts`)**: Built on Node.js native `node:http`, delivering high throughput with minimal overhead.
- **Real-Time Progress Streaming**: Uses Server-Sent Events (SSE) to stream live token extraction, LLM synthesis, and grounding validation directly to the browser.
- **Question Explorer & Deck Manager**: Infinite-scroll card browser with $O(1)$ cursor-based pagination, inline editing, and atomic SQLite deck operations (cloning, splitting, and moving).
- **Settings Studio**: Dynamic configuration management with live AnkiConnect testing, API key obfuscation, and origin tracking (`database`, `env`, or `default`).

---

## 📦 Installation

```bash
npm install @flashcard-master/web @flashcard-master/core @flashcard-master/adapters
```

*(Note: If you want to run the web UI from your terminal without writing code, use [`@flashcard-master/cli`](https://www.npmjs.com/package/@flashcard-master/cli) via `npx @flashcard-master/cli serve`)*.

---

## 💻 Programmatic Usage

### Embedding the Web Server in Node.js or Electron
```typescript
import { createWebServer } from "@flashcard-master/web";
import { createDatabaseClient, FlashcardRepository, DataSourceRepository } from "@flashcard-master/core";

// 1. Initialize storage
const db = createDatabaseClient("~/.flashcard-master/flashcards.db");

// 2. Start the HTTP server
const server = createWebServer({
  db,
  port: 3088,
  host: "127.0.0.1",
});

await server.start();
console.log(`Flashcard Master Web UI listening on http://127.0.0.1:3088`);
```

---

## 🔌 Core REST API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/sources` | `GET`, `POST` | List all data sources or register a new URL, feed, or file. |
| `/api/sources/:id/sync` | `POST` | Trigger background ingestion and document extraction. |
| `/api/cards` | `GET` | Fetch cards with cursor pagination (`cursor`, `limit`, `deck`). |
| `/api/generate` | `POST` | Start grounded flashcard generation with live SSE streaming. |
| `/api/decks/clone` | `POST` | Transactionally duplicate a deck with fresh UUIDs. |
| `/api/decks/split` | `POST` | Partition a large deck into numbered study sub-decks. |
| `/api/export` | `POST` | Export to Desktop Anki, standalone `.apkg`, EPUB, CSV, or HTML. |
| `/api/settings` | `GET`, `PUT` | Read masked application settings or update configuration keys. |

---

## 📚 Documentation

For complete API walkthroughs and developer guides, visit the **[Flashcard Master Documentation](https://alexprodan99.github.io/flashcard-master/)**.

---

## 📄 License

GNU Affero General Public License v3.0 ([AGPL-3.0](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)).
