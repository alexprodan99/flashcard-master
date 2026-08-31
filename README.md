# 🎴 Flashcard Master

> **Local-First, Grounded AI Flashcard Generation & Study Knowledge Base**

Flashcard Master automatically turns your learning materials—RSS/Atom feeds, web articles, and local Markdown notes—into high-quality, hallucination-free active-recall flashcards with cognitive personas, multi-tier difficulty scaling, a local Web UI dashboard, and 1-click export to Anki, CSV, Markdown, and printable study sheets.

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
  PersonaStudioService,
  GroundingGuard,
} from "@flashcard-master/core";
import { OllamaAdapter } from "@flashcard-master/adapters";

const db = createDatabaseClient({ inMemory: true });
const cardRepo = new FlashcardRepository(db);
const llm = new OllamaAdapter({ model: "llama3.2" });
const personaStudio = new PersonaStudioService();
const groundingGuard = new GroundingGuard();

const cardGen = new CardGenerationService(llm, personaStudio, groundingGuard, cardRepo);
```

---

### 🛠️ Option 4: Build & Run from Source (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/flashcard-master.git
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
  - **RSS / Atom Feeds:** Ingest technical blogs, newsletters, and release feeds.
  - **Web Articles (Reader Mode):** Extract clean, ad-free article text from URLs using readability algorithms.
  - **Local Markdown & Text Folders:** Crawl local note repositories (e.g. Obsidian vaults, documentation folders).
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
  - **🌐 Data Sources Manager:** Add, configure, and synchronize sources with live spinner feedback.
  - **🗂️ Question Explorer:** Search bar, interactive filter chips (Decks, Difficulties, Tag clouds), and click-to-reveal flashcards with source grounding callouts.
  - **✏️ Slide-Over Card Editor:** Smooth slide-in drawer to edit questions, answers, difficulty, tags, and citations with instant optimistic updates.
  - **🚀 1-Click Export Center:** Scoped deck/tag filters, direct browser file downloads, and real-time desktop AnkiConnect status badging with 1-click push sync.

- **📦 Multi-Format Export & Local Sync:**
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
2. **🌐 Data Sources:** Click `+ Add Data Source` to register an RSS feed (e.g. `https://martinfowler.com/feed.atom`), a web article URL, or a local Markdown directory. Click `🔄 Sync` to ingest documents.
3. **🗂️ Question Explorer:** Search your knowledge base, filter with deck or tag chips, click `👁️ Reveal Answer` for self-testing, and click `✏️ Edit` on any card to open the slide-over editor.
4. **🚀 Export Center:** Filter cards by Deck and Tag, download your `.apkg`, `.csv`, `.tsv`, `.md`, or `.html` file with 1-click, or click `🚀 Push to Anki` if Anki desktop is open with AnkiConnect!

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
  --model llama3.2 \
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

## ⚙️ Supported LLM Providers

You can switch between local and cloud AI providers seamlessly via CLI flags or environment variables:

| Provider | Model Flag / Default | Configuration / API Key | Privacy |
|---|---|---|---|
| **Ollama** *(Default)* | `--provider ollama` (`llama3.2`) | `OLLAMA_HOST` (default: `http://127.0.0.1:11434`) | 🟢 **100% Local & Offline** |
| **OpenAI** | `--provider openai` (`gpt-4o-mini`) | `export OPENAI_API_KEY="sk-..."` | 🟡 Cloud API |
| **Anthropic** | `--provider anthropic` (`claude-3-5-sonnet-latest`) | `export ANTHROPIC_API_KEY="sk-ant-..."` | 🟡 Cloud API |
| **Google Gemini** | `--provider gemini` (`gemini-1.5-flash`) | `export GEMINI_API_KEY="AIza..."` | 🟡 Cloud API |

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
# Run all 23 test suites and 99 unit & integration tests
npm test

# Build all packages with strict TypeScript type-checking
npm run build
```

---

## 📄 License

MIT © 2026 Flashcard Master Contributors.
