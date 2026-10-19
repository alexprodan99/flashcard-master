# ⚙️ Centralized Settings & Configuration Guide

Flashcard Master uses a **Centralized System Settings Architecture** that eliminates scattered, hardcoded configuration and replaces static `.env` dependencies with a dynamic, local-first settings studio backed by SQLite.

---

## 🏛️ 3-Tier Configuration Precedence Hierarchy

Whenever Flashcard Master resolves a setting or integration parameter, it evaluates values through a strict three-tier precedence hierarchy:

```
┌────────────────────────────────────────────────────────┐
│  Tier 1: SQLite Key-Value Table (`app_settings`)       │
│  (Configured interactively via Web UI Settings Studio) │
└──────────────────────────┬─────────────────────────────┘
                           │ Fallback if empty
                           ▼
┌────────────────────────────────────────────────────────┐
│  Tier 2: Environment Variables (`process.env`)         │
│  (Supplied via `.env` file, Docker env, or shell)      │
└──────────────────────────┬─────────────────────────────┘
                           │ Fallback if undefined
                           ▼
┌────────────────────────────────────────────────────────┐
│  Tier 3: Safe Hardcoded Code Defaults                  │
│  (Safe, resilient application fallbacks)               │
└────────────────────────────────────────────────────────┘
```

1. **SQLite Database (`app_settings`):** Any setting adjusted by the user in the Web UI or via the REST API is persisted immediately to the SQLite database. This takes the highest priority.
2. **Environment Variables (`process.env`):** If a setting has never been configured in SQLite (or was deleted/reset), Flashcard Master checks standard environment variable aliases (useful for headless servers, Docker containers, and CI pipelines).
3. **Hardcoded Defaults:** If neither SQLite nor environment variables specify a value, the system applies safe, battle-tested defaults.

### Dynamic Runtime Application (Zero Server Restarts)
Changes to general settings (such as worker pool concurrency limits, task timeouts, or AnkiConnect connection endpoints) apply **immediately at runtime**:
- Active worker managers adjust dispatch queues without dropping pending tasks.
- The AnkiConnect export adapter uses a dynamic resolver to connect to the new endpoint on the next request.
- The AI Generation Studio reads updated defaults whenever a new session starts.

---

## 📋 Comprehensive Settings Registry

The following table lists all settings managed by the Centralized Settings Service:

| Setting Key | Environment Variable(s) | Default Value | Clamping / Validation | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`ankiconnect_url`** | `ANKI_CONNECT_URL`, `ANKICONNECT_URL` | `http://127.0.0.1:8765` | Valid HTTP/HTTPS URL | Endpoint URL for the AnkiConnect desktop add-on. |
| **`ankiconnect_api_key`** | `ANKI_CONNECT_API_KEY`, `ANKICONNECT_API_KEY` | `null` | Masked token | Optional security key configured in AnkiConnect `apiKey`. |
| **`ankiconnect_timeout_ms`** | `ANKI_CONNECT_TIMEOUT_MS` | `10000` | Integer $\ge 500$ ms | Connection timeout for AnkiConnect HTTP requests. |
| **`default_ai_provider`** | `DEFAULT_AI_PROVIDER` | `ollama` | `ollama`, `openai`, `gemini`, `anthropic` | Default LLM provider pre-selected in Generate Studio. |
| **`default_ai_model`** | `DEFAULT_AI_MODEL` | `phi4-mini` | Non-empty string | Default model identifier pre-selected in Generate Studio. |
| **`default_persona`** | `DEFAULT_PERSONA` | `socratic-mentor` | Valid persona key | Default cognitive persona used for card generation prompt. |
| **`default_difficulty`** | `DEFAULT_DIFFICULTY` | `intermediate` | `beginner`, `intermediate`, `expert` | Default target difficulty level for cards. |
| **`default_card_limit`** | `DEFAULT_CARD_LIMIT` | `5` | Clamped 1–50 | Default number of flashcards to generate per batch. |
| **`default_grounding_enforced`** | `DEFAULT_GROUNDING_ENFORCED` | `true` | Boolean (`true`/`false`) | Whether strict verbatim quote verification is enabled by default. |
| **`max_generation_workers`** | `MAX_GENERATION_WORKERS`, `WORKER_CONCURRENCY` | `2` | Clamped 1–16 | Maximum simultaneous background worker threads for AI generation jobs. |
| **`max_sync_workers`** | `MAX_SYNC_WORKERS` | `2` | Clamped 1–16 | Maximum simultaneous background worker threads for source ingestion jobs. |
| **`max_export_workers`** | `MAX_EXPORT_WORKERS` | `2` | Clamped 1–16 | Maximum simultaneous background worker threads for deck/doc export jobs. |
| **`worker_timeout_minutes`** | `WORKER_TIMEOUT_MINUTES` | `15` | Clamped 1–120 min | Maximum execution duration before an unresponsive worker job is terminated. |
| **`default_slicing_mode`** | `DEFAULT_SLICING_MODE` | `outline` | `outline`, `budget` | Default slicing mode for large documents (Semantic Headings vs Page/Word Budget). |
| **`default_page_budget`** | `DEFAULT_PAGE_BUDGET` | `10` | Integer $\ge 1$ | Default page or section budget size when budget slicing is active. |
| **`epub_default_author`** | `EPUB_DEFAULT_AUTHOR` | `Flashcard Master` | Non-empty string | Default author metadata written to generated EPUB eBook study guides. |
| **`epub_default_publisher`** | `EPUB_DEFAULT_PUBLISHER` | `Flashcard Master` | Non-empty string | Default publisher metadata written to generated EPUB eBook study guides. |

---

## 🔒 Secret Management & Tokens

API keys for external services (OpenAI, Anthropic, Google Gemini, Ollama host, and Notion) are managed in SQLite:
- **Masking:** Tokens are never transmitted to the browser in plaintext (e.g. `sk-pro...8f90` or `••••••••`).
- **Validation:** Live "Test Connection" buttons in the Web UI allow instant diagnosis of credentials without saving invalid keys.
- **Worker Injection:** Active credentials are dynamically injected into isolated worker subprocesses per job.

---

## 🖥️ Using the Settings Studio in the Web UI

Access the Settings Studio at **`http://127.0.0.1:3000/#/settings`**.

### 1. Visual Source Badges
Every configuration card displays an origin badge indicating where the current active value originated:
- 🟢 **`Database`**: Set by you and persisted in SQLite.
- 🔵 **`Env: VARIABLE_NAME`**: Sourced from an environment variable or `.env` file.
- ⚪ **`Default`**: Using the built-in system default.

### 2. Anki Desktop Integration & Live Health Check
- Change the AnkiConnect URL if running Anki on a different machine, local VM, or WSL (e.g. `http://host.docker.internal:8765`).
- Supply an optional API Key token with a convenient Show/Hide and Clear toggle.
- Click **⚡ Test Connection** to send an instant ping:
  - If Anki is running: displays **Connected** with detected version (e.g. `Version 6`) and round-trip latency (e.g. `12ms`).
  - If Anki is closed or unreachable: displays an error badge explaining that AnkiConnect was refused.

### 3. AI Generation Defaults
Adjust your preferred default Provider, Model name, Persona, Difficulty, and Batch limit. When you open **Generate Studio**, these settings automatically pre-populate the synthesizer form.

### 4. Worker Pool & Concurrency
Tune worker thread concurrency limits (1 to 16) and execution timeouts (1 to 120 minutes) based on your hardware capabilities and CPU core count.

---

## 🌐 REST API Endpoints

Programmatic access to settings is available via the REST API:

### `GET /api/settings/general`
Returns all general settings along with their effective values and source metadata:
```json
{
  "settings": {
    "ankiconnectUrl": "http://127.0.0.1:8765",
    "ankiconnectApiKey": "••••••••",
    "ankiconnectTimeoutMs": 10000,
    "defaultAiProvider": "ollama",
    "defaultAiModel": "phi4-mini",
    "defaultPersona": "socratic-mentor",
    "defaultDifficulty": "intermediate",
    "defaultCardLimit": 5,
    "defaultGroundingEnforced": true,
    "maxGenerationWorkers": 2,
    "maxSyncWorkers": 2,
    "maxExportWorkers": 2,
    "workerTimeoutMinutes": 15,
    "defaultSlicingMode": "outline",
    "defaultPageBudget": 10,
    "epubDefaultAuthor": "Flashcard Master",
    "epubDefaultPublisher": "Flashcard Master"
  },
  "sources": {
    "ankiconnectUrl": { "type": "default" },
    "defaultAiModel": { "type": "database" },
    "maxGenerationWorkers": { "type": "env", "envVar": "MAX_GENERATION_WORKERS" }
  }
}
```

### `PUT /api/settings/general`
Updates one or more general settings in SQLite:
```json
{
  "ankiconnectUrl": "http://192.168.1.100:8765",
  "defaultCardLimit": 10,
  "maxGenerationWorkers": 4
}
```

### `POST /api/settings/anki/test`
Performs an active health check ping against AnkiConnect:
```json
// Optional body override:
{ "url": "http://127.0.0.1:8765", "apiKey": "optional-key" }

// Response:
{
  "connected": true,
  "version": 6,
  "latencyMs": 14
}
```
