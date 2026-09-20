---
title: 'Integrations & Secrets UI Dashboard (SettingsView)'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: 'bf39c40'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users have no graphical dashboard to inspect, save, clear, or verify credentials and endpoints for Notion and AI providers (OpenAI, Anthropic, Gemini, Ollama), requiring manual environment variable configuration and blind API calls without live feedback.

**Approach:** Implement `SettingsView.svelte` in `packages/web/client/src/views/` and `settingsStore.svelte.ts` in `packages/web/client/src/stores/`. Add a persistent **⚙️ Settings** navigation tab in `Navigation.svelte` and `App.svelte` with two-way URL sync (`?tab=settings`) and keyboard shortcut (`6`). Provide dedicated cards for Notion and LLMs with password-masked inputs, interactive reveal toggles, live connection test diagnostics, and SQLite persistence.

## Boundaries & Constraints

**Always:**
- Maintain two-way browser URL and history synchronization with `?tab=settings` in `App.svelte`.
- Never display unmasked raw secrets by default; use password inputs with explicit reveal/hide toggles (`👁️` / `🔒`).
- Render connection status badges indicating origin (`🟢 Connected (Database)`, `🟢 Connected (Environment: ...)`, `⚪ Not Configured`).
- Provide live diagnostic test feedback (loading spinner, success details, error alerts) via `POST /api/settings/keys/test`.
- Maintain visual consistency with existing dark-theme UI components (Inter font, slate borders, emerald/indigo badges).

**Ask First:**
- Adding automated background sync intervals or polling for credential health checks before Story 15.4.

**Never:**
- Never log raw secrets to browser console or telemetry.
- Never break existing navigation or tab switching shortcuts (`1`–`5`, `s`, `g`, `e`, `t`).
- Never overwrite custom user input fields when background queries refresh.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open Settings Tab | Click "Settings" in sidebar or navigate to `?tab=settings` | `SettingsView` renders with Notion and LLM sections; `settingsStore.loadKeys()` populates cards | Displays error banner if API fails |
| Display Configured Badges | DB has `openai_api_key`, env has `ANTHROPIC_API_KEY` | OpenAI shows `🟢 Connected (Database)` with `sk-...xxxx`; Anthropic shows `🟢 Connected (Environment)` with `sk-...xxxx` | None |
| Save Secret | Enter `secret_1234` in Notion card, click "Save" | Calls `POST /api/settings/keys`, updates masked value to `sec...1234`, shows success toast | Shows error toast on failure |
| Clear Secret | Click "Clear" on Notion card | Calls `DELETE /api/settings/keys/notion`, resets card status to unconfigured, shows info toast | Shows error toast on failure |
| Test Connection (Success) | Click "Test Connection" on Notion card | Button shows spinner, calls `POST /api/settings/keys/test`, renders green banner with bot/workspace name | Displays error message on failure |
| Test Connection (Failure) | Invalid key entered, click "Test Connection" | Spinner resolves, renders red alert banner with error message from backend | Safe display without crash |
| Reveal/Hide Toggle | Click eye icon next to secret input | Toggles input type between `password` and `text` | Safe client state |
| Keyboard Shortcut | Press `6` while not in text input | Navigates directly to Settings tab and updates URL to `?tab=settings` | Key event ignored in inputs |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/lib/types.ts` -- Define `SecretProvider`, `KeySource`, `ProviderKeyStatus`, `ProviderVerificationResult` client types.
- `packages/web/client/src/lib/api.ts` -- Implement `fetchSettingsKeys`, `saveSettingsKey`, `deleteSettingsKey`, `testSettingsKey`.
- `packages/web/client/src/stores/settingsStore.svelte.ts` -- Implement `SettingsStore` using Svelte 5 runes managing key statuses, saving, deleting, and testing states.
- `packages/web/client/src/stores/index.ts` -- Export `settingsStore` and `SettingsStore`.
- `packages/web/client/src/components/Navigation.svelte` -- Add **⚙️ Settings** navigation item with shortcut `6`.
- `packages/web/client/src/App.svelte` -- Wire `settings` tab into `activeTab`, URL query parameter routing, keyboard shortcut `6`, and render `<SettingsView />`.
- `packages/web/client/src/views/SettingsView.svelte` -- Build comprehensive settings dashboard organized into Data Source Connections (Notion) and AI / LLM Providers (OpenAI, Anthropic, Gemini, Ollama).
- `packages/web/test/client-stores.test.ts` -- Add unit tests for `settingsStore` testing load, save, delete, and test connection flows.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/lib/types.ts` -- Add settings and verification TypeScript types.
- [x] `packages/web/client/src/lib/api.ts` -- Add REST API client helpers for `/api/settings/keys` endpoints.
- [x] `packages/web/client/src/stores/settingsStore.svelte.ts` -- Create reactive `settingsStore` managing loading, key statuses, testing, and error states.
- [x] `packages/web/client/src/stores/index.ts` -- Export `settingsStore`.
- [x] `packages/web/client/src/components/Navigation.svelte` -- Add **Settings** tab in sidebar navigation.
- [x] `packages/web/client/src/App.svelte` -- Add settings tab routing, URL sync (`?tab=settings`), shortcut `6`, and view mounting.
- [x] `packages/web/client/src/views/SettingsView.svelte` -- Implement UI dashboard with Notion and LLM cards, reveal toggles, and live connection test feedback.
- [x] `packages/web/test/client-stores.test.ts` -- Add unit tests for `settingsStore`.

**Acceptance Criteria:**
- Given the web UI dashboard, when user clicks "Settings" or navigates to `?tab=settings`, then `SettingsView` renders with Notion and LLM cards.
- Given `SettingsView`, when loaded, then provider cards display masked values (`sk-...xxxx`, `secret_...xxxx`) and source badges (`Database` vs `Environment`).
- Given a user entering a new key and clicking "Save", then `POST /api/settings/keys` is called, state updates, and a success toast appears.
- Given a user clicking "Clear", then `DELETE /api/settings/keys/:provider` is called, clearing the secret.
- Given a user clicking "Test Connection", then `POST /api/settings/keys/test` is triggered with an inline spinner, displaying live diagnostic results upon completion.
- Given pressing keyboard shortcut `6` outside an input field, then the active tab transitions to Settings.
- Given all existing tests and builds, `npm test` and `npm run build` pass across all workspace packages.

## Design Notes

Layout Structure:
1. Header:
   - Title: Settings & Integrations
   - Description: Manage API credentials and endpoints with local-first SQLite persistence and environment variable fallback.
2. Data Source Connections section:
   - Notion integration card with guide link, secret input, masked preview, and Test/Save/Clear actions.
3. AI / LLM Providers section:
   - 2-column or responsive grid of cards for OpenAI, Anthropic, Google Gemini, and Ollama.
   - Each card provides API key (with reveal toggle), optional Base URL override, status badge, test diagnostics banner, and action buttons.

## Verification

**Commands:**
- `npm test --workspace=@flashcard-master/web` -- expected: All web tests pass including `client-stores.test.ts`.
- `npm run build --workspace=@flashcard-master/web` -- expected: Vite client build and TypeScript server compilation succeed with zero errors.
- `npm run build` at root -- expected: Monorepo build passes without errors.


## Suggested Review Order

**Client Store & Reactive State Management**

- Svelte 5 runes store managing key statuses, saving, deleting, and live connection test diagnostics:
  [`settingsStore.svelte.ts:53`](../../packages/web/client/src/stores/settingsStore.svelte.ts#L53)

- Store exports in central client store bundle:
  [`index.ts:7`](../../packages/web/client/src/stores/index.ts#L7)

**REST API Client Helpers & Domain Types**

- Settings REST API endpoints (`GET /api/settings/keys`, `POST /api/settings/keys`, `DELETE /api/settings/keys/:provider`, `POST /api/settings/keys/test`):
  [`api.ts:373`](../../packages/web/client/src/lib/api.ts#L373)

- Client TypeScript types for providers, key sources, and verification results:
  [`types.ts:111`](../../packages/web/client/src/lib/types.ts#L111)

**UI Views & Navigation Integration**

- Settings and Integrations dashboard view with Notion integration card, LLM provider cards, masked previews, and live test diagnostics banners:
  [`SettingsView.svelte:1`](../../packages/web/client/src/views/SettingsView.svelte#L1)

- Navigation sidebar item with shortcut `6`:
  [`Navigation.svelte:17`](../../packages/web/client/src/components/Navigation.svelte#L17)

- Application routing, URL search parameter synchronization (`?tab=settings`), and keyboard shortcut handling:
  [`App.svelte:31`](../../packages/web/client/src/App.svelte#L31)

**Unit Test Suite**

- SettingsStore unit tests verifying provider initial state, API loading, persistence, deletion, error handling, and live diagnostics:
  [`client-stores.test.ts:450`](../../packages/web/test/client-stores.test.ts#L450)
