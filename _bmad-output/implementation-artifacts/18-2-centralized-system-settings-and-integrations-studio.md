---
title: 'Story 18.2: Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)'
type: 'feature'
created: '2026-10-18'
status: 'todo'
context:
  - '_bmad-output/implementation-artifacts/epic-18-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Multiple system configurations, AI defaults, worker concurrency limits, timeouts, and AnkiConnect integration parameters are currently hardcoded or only configurable via `.env` files and environment variables. For example, AnkiConnect is hardcoded to `http://127.0.0.1:8765` without authentication support; worker concurrency is hardcoded to 2; worker task timeouts are fixed; and default AI generation parameters (default provider, model, persona, difficulty, card batch limit) are scattered across client store fallbacks. Users running the app locally or in containers cannot easily adjust or inspect these settings without modifying `.env` files or restarting the server.

**Approach:** Build a unified System Settings management architecture in `@flashcard-master/core` and the Web UI Settings panel backed by the SQLite `app_settings` key-value table. Implement the strict hierarchical fallback chain (`SQLite app_settings -> process.env fallback -> hardcoded default`). Expose REST API endpoints to read, write, and test configurations. In `SettingsView.svelte`, construct dedicated, intuitive sections for:
1. **Anki Desktop Integration:** Custom AnkiConnect endpoint URL (`ankiconnect_url`, default `http://127.0.0.1:8765`), optional API key token (`ankiconnect_api_key`), connection timeout, and a live "Test Connection" button.
2. **AI Generation Defaults:** Default LLM provider (`default_ai_provider`), default model (`default_ai_model`), default persona (`default_persona`), default difficulty (`default_difficulty`), default card batch quantity (`default_card_limit`), and grounding guard toggle (`default_grounding_enforced`).
3. **Worker Pool & Task Processing:** Generation, sync, and export concurrency limits (`max_generation_workers`, `max_sync_workers`, `max_export_workers`), and worker task execution timeout (`worker_timeout_minutes`).
4. **Document Ingestion & Slicing Defaults:** Default slicing strategy (`default_slicing_mode`: `outline` or `budget`) and default page budget size (`default_page_budget`).
5. **EPUB Publishing Metadata:** Default author (`epub_default_author`) and default publisher (`epub_default_publisher`).

## Boundaries & Constraints

**Always:**
- Use the hierarchical fallback chain: Stored SQLite settings take precedence over environment variables (`process.env`), which take precedence over code defaults.
- Mask sensitive tokens and API keys (such as AnkiConnect key or AI keys) when sending status over the wire.
- Support live connection testing for Anki Desktop via `POST /api/settings/anki/test` returning connection status, Anki version, and latency.
- Ensure updating general settings takes effect immediately in active workers, services, and client stores without requiring server restarts.
- Preserve existing secret management (OpenAI, Anthropic, Gemini, Ollama, Notion) and logging settings (verbose toggle, log level).

**Never:**
- Never crash the server or client if an environment variable is undefined or malformed.
- Never log raw API keys or passwords in console logs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Load default settings | First launch, no SQLite keys or env vars set | Returns standard defaults (Anki: `http://127.0.0.1:8765`, Provider: `ollama`, Model: `phi4-mini`, Concurrency: 2) | Fallback chain completes smoothly |
| Override via UI | User sets AnkiConnect URL to `http://192.168.1.50:8765` in UI | Persists to SQLite; all future Anki syncs/pushes connect to remote IP | Validates valid HTTP URL |
| Test Anki connection | User clicks "Test Connection" in Settings UI | Sends ping via `AnkiConnectAdapter.invoke("version")`, returns `{ online: true, version: 6 }` | Displays error badge if Anki is closed |
| Environment fallback | `ANKI_CONNECT_URL=http://localhost:9000` in env, no SQLite value | Returns `http://localhost:9000` with badge `(Env: ANKI_CONNECT_URL)` | Handled via `SettingsService` |
| Concurrency limit update | User changes generation worker limit from 2 to 4 | `JobManager` updates concurrency limit dynamically | Clamps value between 1 and 16 |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Define `GeneralSettings` and `GeneralSettingsSchema`.
- `packages/core/src/services/settings-service.ts` -- Add getters/setters for general settings and Anki configuration with env fallback.
- `packages/adapters/src/export/ankiconnect-adapter.ts` -- Accept dynamic settings resolver for endpoint URL, timeout, and API key.
- `packages/web/src/server.ts` -- Add `GET /api/settings/general`, `POST /api/settings/general`, and `POST /api/settings/anki/test`.
- `packages/web/src/jobs/job-manager.ts` -- Dynamically read concurrency limits from `SettingsService`.
- `packages/web/client/src/lib/api.ts` -- Add client endpoints `fetchGeneralSettings()`, `saveGeneralSettings()`, `testAnkiConnect()`.
- `packages/web/client/src/stores/settingsStore.svelte.ts` -- Add general settings reactive state and save handlers.
- `packages/web/client/src/views/SettingsView.svelte` -- Add dedicated UI sections for Anki Integration, AI Defaults, Worker Processing, and Slicing Defaults.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/domain/models.ts` -- Implement `GeneralSettingsSchema` and TypeScript interfaces.
- [ ] `packages/core/src/services/settings-service.ts` -- Implement `getGeneralSettings()`, `saveGeneralSettings()`, and AnkiConnect resolution.
- [ ] `packages/adapters/src/export/ankiconnect-adapter.ts` -- Enable dynamic endpoint and API key injection from settings.
- [ ] `packages/web/src/server.ts` -- Implement REST endpoints for general settings CRUD and Anki health test.
- [ ] `packages/web/src/jobs/job-manager.ts` -- Wire worker concurrency limits to settings.
- [ ] `packages/web/client/src/stores/settingsStore.svelte.ts` -- Wire client state for general settings.
- [ ] `packages/web/client/src/views/SettingsView.svelte` -- Implement intuitive settings cards and test connection buttons.

**Acceptance Criteria:**
- **Given** the Settings View in the Web UI,
  - **When** navigating to the Settings page,
  - **Then** the user sees sections for AI Providers, AI Defaults, Anki Desktop, Worker Processing, and Logging.
- **Given** Anki Desktop settings,
  - **When** the user inputs a custom AnkiConnect endpoint URL and clicks "Test Connection",
  - **Then** the system sends a live health check and renders a green connected badge with the detected Anki version or a clear error badge.
- **Given** AI generation defaults configured in Settings,
  - **When** the user opens Generate Studio for the first time,
  - **Then** the generator controls automatically populate with the configured default provider, model, persona, difficulty, and batch size.
- **Given** modified worker concurrency limits,
  - **When** background jobs are executed,
  - **Then** the job manager respects the updated concurrency boundaries.
