# 🎴 Flashcard Master

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-blue.svg)](https://alexprodan99.github.io/flashcard-master/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)

> **Local-First, Grounded AI Flashcard Generation & Study Knowledge Base**  
> **[📖 Documentation Hub](https://alexprodan99.github.io/flashcard-master/)** • **[🚀 3-Minute Quickstart](https://alexprodan99.github.io/flashcard-master/user-guide/quickstart)** • **[🏛️ System Architecture](https://alexprodan99.github.io/flashcard-master/ARCHITECTURE)**

Flashcard Master automatically turns your learning materials—RSS/Atom feeds, web articles, EPUB e-books, and local Markdown notes—into high-quality, hallucination-free active-recall flashcards with cognitive personas, multi-tier difficulty scaling, a local Web UI dashboard, and 1-click export to Anki, CSV, Markdown, and printable study sheets.

---

## 📦 Installation & Getting Started

### ⚡ Option 1: Instant Zero-Install (Recommended)

You can run Flashcard Master immediately without installing anything:

```bash
# Launch the interactive setup wizard:
npx @flashcard-master/cli init

# Or launch the local Web UI Dashboard directly:
npx @flashcard-master/cli serve
```

---

### 🌐 Option 2: Global CLI Installation

Install Flashcard Master globally to have the `flashcard-master` command available anywhere in your terminal:

```bash
# Using npm:
npm install -g @flashcard-master/cli

# Using pnpm:
pnpm add -g @flashcard-master/cli

# Using yarn:
yarn global add @flashcard-master/cli

# Using bun:
bun add -g @flashcard-master/cli
```

Once installed, simply run:
```bash
flashcard-master serve
flashcard-master --help
```

---

### 🧩 Option 3: Use as a Node.js Library in Your Own Projects

Import the domain logic or adapters directly into your own TypeScript / JavaScript applications:

```bash
npm install @flashcard-master/core @flashcard-master/adapters
```

```typescript
import {
  createDatabaseClient,
  FlashcardRepository,
  CardGenerationService,
  PromptBuilder,
  GroundingGuard,
} from "@flashcard-master/core";
import { OllamaAdapter } from "@flashcard-master/adapters";

const db = createDatabaseClient({ inMemory: true });
const cardRepo = new FlashcardRepository(db);
const llm = new OllamaAdapter({ model: "phi4-mini" });
const promptBuilder = new PromptBuilder();
const groundingGuard = new GroundingGuard();

const cardGen = new CardGenerationService(llm, undefined, promptBuilder, groundingGuard);
```

---

### 🛠️ Option 4: Build & Run from Source (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/alexprodan99/flashcard-master.git
cd flashcard-master

# 2. Install dependencies & build all workspace packages
npm install
npm run build

# 3. Run the test suite
npm test

# 4. Launch the local Web UI Dashboard immediately:
npm start

# 5. (Optional) Link the CLI globally so 'flashcard-master' works everywhere:
npm link -w @flashcard-master/cli
flashcard-master serve
flashcard-master init

# 6. (Optional) Run CLI commands directly without global linking:
npm run cli -- init
npm run cli -- sync
npm run cli -- generate --provider ollama
npm run cli -- export -f apkg -o ./flashcards.apkg
npm run cli -- stats
```

---

## ✨ Features

- **🌐 Multi-Source Ingestion Engine:**
  - **EPUB E-Books (EPUB 2 & 3):** Ingest local EPUB books, textbooks, and documentation archives with automatic container discovery, hierarchical chapter slicing (preserving book & chapter provenance in card source citations), pure-JS parsing (zero external dependencies), and embedded media localization.
  - **Notion Pages & Databases:** Ingest Notion notes, workspaces, and databases with recursive subpage crawling (up to 3 levels) and automatic expiring S3 media localization into permanent local WebP assets.
  - **RSS / Atom Feeds:** Ingest technical blogs, newsletters, and release feeds.
  - **XML Sitemaps (`<urlset>` & `<sitemapindex>`):** Ingest entire publication archives (e.g. 300+ blog articles) with recursive discovery and concurrency limits.
  - **LLMs.txt Catalogs (`/llms.txt` & `/llms-full.txt`):** Ingest structured AI documentation catalogs with auto-categorized topic tagging.
  - **Web Articles (Reader Mode):** Extract clean, ad-free article text from URLs using readability algorithms.
  - **Local Markdown, PDF, Word & EPUB Files/Folders:** Crawl local note repositories (e.g. Obsidian vaults, documentation folders, or `.epub`/`.pdf`/`.docx`/`.md` files).
  - **Incremental Delta Sync:** SHA-256 content hashing guarantees zero duplicate document processing.

- **🤖 Hallucination-Free AI Card Generation:**
  - **Verbatim Grounding Guard:** Every generated question-answer pair must cite a verbatim substring from the source document—any ungrounded hallucination is rejected before saving.
  - **Cognitive Persona Studio:** Select distinct prompting personas:
    - `socratic-mentor` — Deep conceptual questions emphasizing *why* and *how*.
    - `strict-examiner` — Rigorous, definition-precise technical examination.
    - `analogy-builder` — Real-world metaphors and structural parallels for complex topics.
  - **Difficulty Scaling:** Target cards across `beginner`, `intermediate`, or `expert` tiers.
  - **Smart Deduplication:** Normalized Jaccard and Levenshtein similarity filters eliminate redundant cards across sync cycles.

- **🗂️ Embedded Web UI Dashboard:**
  - **Zero-Install SPA:** Native dark-theme Single Page Application served directly by Node.js with zero external framework dependencies or CDN tracking.
  - **📊 Dashboard Overview:** Real-time KPIs for total cards, active sources, and deck categories.
  - **⚙️ Unified Settings & Integrations Studio (`#/settings`):** Centralized control center managing 3-tier configurations (`SQLite -> .env -> defaults`), masked API credentials with live connectivity testing (OpenAI, Anthropic, Gemini, Ollama, Notion, AnkiConnect), AI generation defaults, and dynamic worker pool concurrency and execution timeout limits (see [Settings Guide](docs/settings-configuration.md)).
  - **⚡ AI Generation Studio:** In-browser flashcard synthesizer with provider switching (Ollama, Gemini, OpenAI, Anthropic), model presets (`phi4-mini`, `gemini-3.6-flash`, `gpt-4o-mini`, `claude-haiku-4-5-20251001`), custom model overrides, persona selectors, single/multi-source scope, live spinning execution feedback, and card previews.
  - **🌐 Data Sources Manager:** Add, configure, and synchronize sources with live spinner feedback.
  - **🗂️ Question Explorer:** High-performance infinite scrolling with keyset/cursor pagination, debounced search, interactive filter chips (Decks, Difficulties, Tag clouds), and click-to-reveal flashcards with source grounding callouts.
  - **✏️ Slide-Over Card Editor:** Smooth slide-in drawer to edit questions, answers, difficulty, tags, and citations with instant optimistic updates.
  - **🚀 1-Click Export & Anki Center:** Scoped deck/tag filters, direct browser file downloads (.apkg, EPUB, Markdown, PDF, CSV, TSV), and real-time desktop AnkiConnect status badging with 1-click push sync.

- **📦 Multi-Format Export & Local Sync:**
  - 📚 **Interactive EPUB 3.0 Study Guides (`.epub`):** Standards-compliant reflowable eBooks with uncompressed byte-0 STORE `mimetype`, navigation documents, and interactive `<details>/<summary>` card flipping styled for e-readers (Kindle, Kobo, Apple Books).
  - 📦 **Anki Package (`.apkg`):** Native SQLite collection with deck hierarchies, tags, and custom styling.
  - 🔄 **Desktop AnkiConnect Sync:** 1-click push directly to running Anki desktop app via `http://127.0.0.1:8765`.
  - 📄 **Spreadsheet (`.csv` / `.tsv`):** RFC 4180 compliant quote-escaped tables for Excel, Google Sheets, or Quizlet.
  - 📝 **Active-Recall Markdown (`.md`):** Notion and Obsidian compatible notes with collapsible `<details><summary>` reveal blocks.
  - 🖨️ **Printable Study Guide (`.html`):** Two-column fold-over printable layout with `@media print` CSS for physical paper flashcards.

- **🔒 100% Local-First & Private:**
  - Relational SQLite database stored locally on your machine with Write-Ahead Logging (WAL) enabled.
  - Zero cloud dependencies or telemetry. Works completely offline with local LLMs (e.g. Ollama).

---

## 🖥️ Usage Guide

### Option A: Launch the Web UI Dashboard (Recommended)

Start the local web dashboard on port `3000` (or any available port):

```bash
flashcard-master serve
# Or specify a custom port:
flashcard-master serve --port 8080
```

Open your browser at **`http://127.0.0.1:3000`** to access the dashboard.

#### 🌐 Web Dashboard Tour:
1. **📊 Dashboard:** View real-time database KPIs and recent flashcards.
2. **🌐 Data Sources:** Click `+ Add Data Source` to register an RSS feed (e.g. `https://martinfowler.com/feed.atom`), a web article URL, Notion page/database, or a local Markdown directory. Sources act as pure knowledge repositories decoupled from decks. Click `🔄 Sync` to ingest documents.
3. **⚡ Generate Studio:** Pick your target flashcard deck (with smart autocomplete over existing decks or instant creation of new ones), choose your AI provider (`Ollama`, `Gemini`, `OpenAI`, `Anthropic`), select your cognitive persona, and customize model settings (all automatically pre-populated from your configured system defaults). Choose your target data sources, and click `⚡ Start AI Generation` with live progress feedback and instant card previews!
4. **🗂️ Question Explorer:** Search your knowledge base, filter with deck or tag chips, click `👁️ Reveal Answer` for self-testing, and click `✏️ Edit` on any card to open the slide-over editor.
5. **🚀 Export & Anki:** Filter cards by Deck and Tag, download your `.apkg`, `.csv`, `.tsv`, `.md`, or `.html` file with 1-click, or click `🚀 Push to Anki` if Anki desktop is open with AnkiConnect!
6. **⚙️ Settings & Integrations:** Interactive settings studio with live origin badges (`Database`, `Env`, `Default`). Configure custom AnkiConnect endpoints with live connection testing, default AI parameters, background worker pool concurrency limits, task timeouts, document slicing strategies, and secure API key management.

---

### Option B: Interactive Terminal Setup Wizard

If you prefer terminal-driven workflows, run the interactive setup wizard:

```bash
flashcard-master init
```

The wizard will guide you through:
1. Selecting your default LLM provider (`ollama`, `openai`, `anthropic`, or `gemini`).
2. Setting your default learning persona (`socratic-mentor`, `strict-examiner`, `analogy-builder`).
3. Choosing your default study deck and target export format (`apkg`, `csv`, `tsv`, `markdown`, `html`, or `ankiconnect`).
4. Adding your initial data sources (RSS feeds, web URLs, or local directory paths).

---

### Option C: Scriptable CLI Commands

Flashcard Master includes a full CLI suite for automated scripts and cron workflows:

#### 1. Ingest Data Sources (`sync`)
```bash
# Sync all active data sources
flashcard-master sync

# Sync a specific source by UUID
flashcard-master sync <source-id>
```

#### 2. Generate AI Flashcards (`generate`)
```bash
# Generate flashcards from ingested unread documents
flashcard-master generate \
  --provider ollama \
  --model phi4-mini \
  --persona socratic-mentor \
  --difficulty intermediate \
  --deck "System Design" \
  --limit 5
```

#### 3. Export Study Deliverables (`export`)
```bash
# Export all cards to native Anki package (.apkg)
flashcard-master export -f apkg -o ./dist/flashcards.apkg

# Export a specific deck to active-recall Markdown
flashcard-master export -f markdown -d "Distributed Systems" -o ./notes/study-guide.md

# Export all cards to RFC 4180 CSV
flashcard-master export -f csv -o ./flashcards.csv

# Export two-column printable PDF/HTML study sheet
flashcard-master export -f html -o ./study-guide.html

# Sync directly to desktop Anki via AnkiConnect
flashcard-master export -f ankiconnect -d "Engineering"
```

#### 4. View Database Stats (`stats`)
```bash
flashcard-master stats
```

---

## 🎴 Anki Connection & Export Guide

Flashcard Master supports two seamless methods to get your flashcards into Anki:

### ⚡ Method 1: 1-Click Desktop Live Sync (via AnkiConnect) — *Recommended*

Push cards directly into your open Anki desktop app with zero manual file handling:

1. **Install & Configure the AnkiConnect Add-on in Anki:**
   * Open the **Anki desktop app**.
   * In the top menu, go to: **`Tools`** $\rightarrow$ **`Add-ons`** $\rightarrow$ **`Get Add-ons...`**
   * Paste the add-on code: **`2055492159`** and click **OK**.
   * Select **`AnkiConnect`** in the add-ons list, click **`Config`**, and ensure `"webCorsOriginList"` allows local web origins (or `"*"`):
     ```json
     {
       "apiKey": null,
       "apiLogPath": null,
       "webBindAddress": "127.0.0.1",
       "webBindPort": 8765,
       "webCorsOriginList": ["http://localhost", "http://127.0.0.1:3000", "*"]
     }
     ```
   * Click **OK** and restart Anki.
2. **Configure Custom Host / API Key (Optional):**
   * If Anki is running on another machine, local VM, WSL, or Docker (`http://host.docker.internal:8765`), or if you configured an `apiKey` in AnkiConnect, navigate to **⚙️ Settings** (`http://127.0.0.1:3000/#/settings`).
   * Enter your custom AnkiConnect URL or API key and click **⚡ Test Connection** for instant diagnostics (verifies version and round-trip latency). You can also set `ANKI_CONNECT_URL` or `ANKI_CONNECT_API_KEY`.
3. **Push to Anki:**
   * **In the Web UI (`http://127.0.0.1:3000`):** Navigate to the **`🚀 Export & Anki`** tab. The badge will show **`🟢 Connected (Port 8765)`**. Select your target deck and click **`🚀 Push to Anki Desktop`**.
   * **In the CLI:** Run `flashcard-master export -f ankiconnect -d "Computer Science"`.

---

### 📦 Method 2: Native `.apkg` File Export (Zero Add-ons Required)

If you prefer offline files without installing add-ons:

1. **Export the `.apkg` package:**
   * **In the Web UI:** Click **`📦 Download Anki Package (.apkg)`** in the **`🚀 Export & Anki`** tab.
   * **In the CLI:** Run `flashcard-master export -f apkg -o ./my-cards.apkg`.
2. **Import into Anki:**
   * Double-click the generated `.apkg` file, or click **`File`** $\rightarrow$ **`Import...`** in Anki.
   * All decks, tags, custom CSS styling, and active-recall cards will import instantly!

---

## 📓 Notion Ingestion & Integration Setup

Flashcard Master supports seamless, recursive ingestion of Notion pages and databases with automatic local WebP caching for expiring AWS S3 image blocks:

1. **Create an Internal Integration:** Visit [Notion Developers Integrations](https://www.notion.so/profile/integrations), create an integration named `Flashcard Master`, and copy your **Internal Integration Secret** (`ntn_...` or `secret_...`).
2. **Share Target Pages:** In Notion, open your target page or database, click `•••` $\rightarrow$ `Connections` $\rightarrow$ `Connect to...`, and select your integration.
3. **Configure Token:** Open `http://127.0.0.1:3000/#/settings`, paste your token under **Notion Integration**, click **⚡ Test Connection**, and click **Save Key** (or export `NOTION_API_KEY`).
4. **Ingest Notes:** Go to **Data Sources** $\rightarrow$ **+ Add Data Source**, select **📓 Notion**, paste your page or database URL, check "Include subpages" for recursive crawling, and click **🔄 Sync**!

👉 For detailed setup instructions and troubleshooting, see the [Notion Integration Guide](docs/notion-setup.md).

---

## ⚙️ Supported LLM Providers (Optimized for Performance-per-Dollar)

You can switch between local and cloud AI providers seamlessly via CLI flags or environment variables:

| Provider | Recommended Default | Alternatives / Supported Models | Privacy & Cost Tier |
|---|---|---|---|
| 🦙 **Ollama** *(Default)* | `--provider ollama` (**`phi4-mini`**) | `llama3.3`, `deepseek-r1`, `qwen2.5`, `mistral` | 🟢 **100% Local, Offline & Free** |
| 🔵 **Google Gemini** | `--provider gemini` (**`gemini-3.6-flash`**) | `gemini-3.6-pro`, `gemini-2.5-flash`, `gemini-2.5-pro` | 🟡 Cloud API (~$0.10 / 1M tokens) |
| 🟢 **OpenAI** | `--provider openai` (**`gpt-4o-mini`**) | `o3-mini`, `gpt-4o`, `gpt-4.5-preview` | 🟡 Cloud API (~$0.15 / 1M tokens) |
| 🟣 **Anthropic** | `--provider anthropic` (**`claude-haiku-4-5-20251001`**) | `claude-sonnet-5`, `claude-opus-5` | 🟡 Cloud API (~$1.00 / 1M tokens) |

---

## ⚙️ Centralized Settings & Configuration Hierarchy

Flashcard Master unifies application settings, AI defaults, worker concurrency limits, and integration parameters into a centralized settings studio backed by SQLite with a 3-tier fallback chain:

```
SQLite app_settings  ──▶  process.env Fallback  ──▶  Hardcoded Code Default
(Configured in Web UI)      (Configured via .env)       (Built-in Safe Fallback)
```

- **Zero Server Restarts:** Updating settings via the Web UI takes effect immediately at runtime across active background workers and AnkiConnect sync routines.
- **Visual Origin Badging:** Every setting card displays an origin badge indicating whether the value was loaded from `Database`, an `Env: ...` variable, or the built-in `Default`.
- **Secret Protection:** Sensitive API keys (OpenAI, Anthropic, Gemini, Notion, AnkiConnect) are stored securely, masked in REST payloads, and never logged to stdout.

### Key Configuration Registry:

| Setting Key | Environment Variable(s) | Default | Description |
| :--- | :--- | :--- | :--- |
| `ankiconnect_url` | `ANKI_CONNECT_URL` | `http://127.0.0.1:8765` | Desktop AnkiConnect HTTP endpoint |
| `ankiconnect_api_key` | `ANKI_CONNECT_API_KEY` | `null` | Optional AnkiConnect security key |
| `default_ai_provider` | `DEFAULT_AI_PROVIDER` | `ollama` | Default LLM provider for Generate Studio |
| `default_ai_model` | `DEFAULT_AI_MODEL` | `phi4-mini` | Default model identifier for Generate Studio |
| `default_persona` | `DEFAULT_PERSONA` | `socratic-mentor` | Default cognitive prompt persona |
| `default_difficulty` | `DEFAULT_DIFFICULTY` | `intermediate` | Default flashcard difficulty level |
| `default_card_limit` | `DEFAULT_CARD_LIMIT` | `5` | Default card batch count (1–50) |
| `default_grounding_enforced` | `DEFAULT_GROUNDING_ENFORCED` | `true` | Enforce verbatim source quote verification |
| `max_generation_workers` | `MAX_GENERATION_WORKERS` | `2` | Background AI generation worker limit (1–16) |
| `max_sync_workers` | `MAX_SYNC_WORKERS` | `2` | Background source ingestion worker limit (1–16) |
| `max_export_workers` | `MAX_EXPORT_WORKERS` | `2` | Background export worker limit (1–16) |
| `worker_timeout_minutes` | `WORKER_TIMEOUT_MINUTES` | `15` | Worker task execution timeout (1–120 min) |

👉 For full configuration details, REST API endpoints, and setup examples, see the [Centralized Settings & Configuration Guide](docs/settings-configuration.md).

---

## 🏗️ Monorepo Architecture

Flashcard Master is organized as a clean TypeScript npm workspaces monorepo following Hexagonal (Ports & Adapters) principles:

```
flashcard-master/
├── packages/
│   ├── core/           # Pure domain models, SQLite storage, Ingestion, Generation, Deduplication, & Export services
│   ├── adapters/       # RSS, Web Reader, Local Crawler, Ollama/OpenAI/Anthropic/Gemini LLMs, Anki .apkg, AnkiConnect, CSV, TSV, MD, HTML
│   ├── cli/            # Commander.js scriptable CLI application, DI container, and interactive setup wizard
│   └── web/            # Node.js HTTP server, REST endpoints, and embedded dark-theme SPA dashboard
└── _bmad-output/       # Architectural artifacts, sprint plans, story specs, and retrospectives
```

---

## 🧪 Testing & Verification

Run the full automated test suite across all workspace packages:

```bash
# Run all automated unit & integration test suites
npm test

# Build all packages with strict TypeScript type-checking
npm run build
```

---

## 📚 Documentation & Community

* 📖 **[Official Documentation Hub](https://alexprodan99.github.io/flashcard-master/)**: Complete interactive online documentation hosted on GitHub Pages.
* 🚀 **[User Guide & Tutorials](https://alexprodan99.github.io/flashcard-master/user-guide/quickstart)**: Quickstart, Ingestion Playbook (Web, RSS, Notion, EPUB/PDF), Flashcard Synthesis Tuning, and Study & Export Workflows.
* 🏛️ **[System Architecture & Design Invariants](docs/ARCHITECTURE.md)**: Detailed subsystem lifecycles, data flows, and database schemas.
* 🤝 **[Contributor Guide & Extension Playbook](CONTRIBUTING.md)**: Setup instructions, coding conventions, quality gates, and guides for adding custom ingestion strategies, LLMs, and exporters.
* 📜 **[Code of Conduct](CODE_OF_CONDUCT.md)**: Contributor Covenant v2.1 community health and participation standards.
* 🔒 **[Security Policy](SECURITY.md)**: Responsible vulnerability disclosure and private reporting procedures.

---

## 📜 License

Flashcard Master is open-source software licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.

### Summary & Principles:
- **Free for Personal, Academic & Local Use**: You can run, study, modify, and distribute Flashcard Master locally, across your desktop or home server, completely free of charge.
- **Copyleft Reciprocity (Section 13)**: If you modify Flashcard Master and run it as a network service (e.g., hosting a cloud SaaS version accessible over a computer network), you must provide the complete corresponding source code of your modified version under the AGPL-3.0 license to all users interacting with it remotely.
- **Community-First Guarantee**: Ensures Flashcard Master remains permanently open-source and prevents commercial platforms from closing source improvements or repackaging the software as a proprietary paid cloud wrapper.

Copyright © 2026 Ionut-Alexandru Prodan ([@alexprodan99](https://github.com/alexprodan99)) and Flashcard Master contributors.
