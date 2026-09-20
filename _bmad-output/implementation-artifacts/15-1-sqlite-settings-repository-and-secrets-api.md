---
title: 'SQLite Settings Repository, Fallback Chain & Secrets REST API'
type: 'feature'
created: '2026-09-09'
status: 'done'
baseline_commit: '9eb662f2055f70c41de67f24160d567f0f05685f'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** API keys and credentials for AI providers (OpenAI, Anthropic, Gemini, Ollama) and data sources (Notion) must currently be re-entered repeatedly or set purely via environment variables, with no secure local persistence, masked previews, or unified REST management.

**Approach:** Implement `app_settings` persistence via `SqliteSettingsRepository`, a hierarchical `SettingsService` resolving secrets (`SQLite -> process.env -> null`), key masking (`sk-...4a12`), and REST endpoints (`GET /api/settings/keys`, `POST /api/settings/keys`, `DELETE /api/settings/keys/:provider`) in `WebServer`.

## Boundaries & Constraints

**Always:**
- Keep all SQLite read/write operations strictly on the main thread via `SqliteSettingsRepository`.
- Enforce the fallback chain: SQLite database overrides environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NOTION_API_KEY`, `OLLAMA_HOST`).
- Always mask secrets in `GET /api/settings/keys` responses (e.g., `sk-...4a12`, `secret_...9a2f`) and indicate source origin (`database` vs `environment` vs `none`). Never return raw secret strings in API responses.
- Trim whitespace from submitted keys and endpoints in `POST /api/settings/keys`.
- Maintain Ports & Adapters: domain models and `SettingsRepository` port in `@flashcard-master/core`, SQLite implementation in `core/storage`, endpoints in `@flashcard-master/web`.

**Ask First:**
- Any expansion of settings keys beyond secrets and endpoints into user preferences before Story 15.3.

**Never:**
- Never leak unmasked raw API keys or tokens in HTTP JSON responses.
- Never write credentials into file-based logs or error messages.
- Never execute database mutations from worker threads; worker threads receive resolved credentials via payload.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Get Key Statuses (Empty) | DB empty, no env vars | `GET /api/settings/keys` -> `{ keys: { [p]: { isConfigured: false, maskedValue: "", source: "none" } } }` | 200 OK |
| Get Key Statuses (Env Fallback) | DB empty, `OPENAI_API_KEY="sk-1234567890abcdef"` | `keys.openai` has `{ isConfigured: true, maskedValue: "sk-...cdef", source: "environment" }` | 200 OK |
| Get Key Statuses (DB Override) | DB has `openai_api_key="sk-dbsecret9999"`, env has `OPENAI_API_KEY="sk-env"` | `keys.openai` has `{ isConfigured: true, maskedValue: "sk-...9999", source: "database" }` | 200 OK (DB takes precedence) |
| Save Secret | `POST /api/settings/keys` `{ provider: "notion", key: "secret_abcd1234efgh5678" }` | Persisted to DB; returns `{ success: true, provider: "notion", isConfigured: true, maskedValue: "sec...5678", source: "database" }` | 400 if invalid provider / missing key |
| Delete Secret | `DELETE /api/settings/keys/notion` | Purged from DB; returns `{ success: true, provider: "notion", isConfigured: false, source: "none" }` | 400 if invalid provider |
| Delete With Env Fallback | `DELETE /api/settings/keys/openai` when `OPENAI_API_KEY` set | Purged from DB; returns `{ success: true, provider: "openai", isConfigured: true, source: "environment" }` | 200 OK |
| Short Key Masking | Key length <= 8 (e.g. `secret`) | Masked as `****` without index out-of-bounds | Safe masking |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Add `SettingSchema`, `Setting`, `SecretProviderSchema`, `SecretProvider`, `ProviderKeyStatusSchema`, `ProviderKeyStatus`.
- `packages/core/src/ports/index.ts` -- Add `SettingsRepository` port interface (`get`, `set`, `delete`, `list`, `getAll`).
- `packages/core/src/storage/schema.sql` -- Verify `app_settings` DDL (`key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL`).
- `packages/core/src/storage/db.ts` -- Ensure `app_settings` table creation in `runMigrations(db)` for existing databases.
- `packages/core/src/storage/settings-repository.ts` -- Implement `SqliteSettingsRepository` implementing `SettingsRepository`.
- `packages/core/src/services/settings-service.ts` -- Implement `SettingsService` managing fallback resolution, secret masking, and provider status mappings.
- `packages/core/src/index.ts` -- Export `Setting`, `SettingSchema`, `ProviderKeyStatus`, `SettingsRepository`, `SqliteSettingsRepository`, `SettingsService`.
- `packages/core/test/settings-repository.test.ts` -- Unit tests for `SqliteSettingsRepository` and `SettingsService` (CRUD, precedence, masking, edge cases).
- `packages/web/src/server.ts` -- Expose `GET /api/settings/keys`, `POST /api/settings/keys`, and `DELETE /api/settings/keys/:provider`, accepting `settingsRepo` and `settingsService` in `WebServerOptions`.
- `packages/web/test/settings-api.test.ts` -- Integration tests for secrets REST API routes and security masking invariant.
- `packages/cli/src/app.ts` -- Initialize `SqliteSettingsRepository` and `SettingsService` in `AppContext`.
- `packages/cli/src/cli.ts` -- Pass `settingsRepo` and `settingsService` to `createWebServer`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Define domain models and Zod schemas for settings and provider secret statuses.
- [x] `packages/core/src/ports/index.ts` -- Define `SettingsRepository` interface.
- [x] `packages/core/src/storage/db.ts` -- Add migration check for `app_settings` in `runMigrations`.
- [x] `packages/core/src/storage/settings-repository.ts` -- Implement `SqliteSettingsRepository` with SQLite CRUD operations.
- [x] `packages/core/src/services/settings-service.ts` -- Implement `SettingsService` with hierarchical fallback resolution and secure masking.
- [x] `packages/core/src/index.ts` -- Export settings models, repository, and service.
- [x] `packages/core/test/settings-repository.test.ts` -- Create comprehensive unit tests for repository and service.
- [x] `packages/web/src/server.ts` -- Add settings endpoints (`GET`, `POST`, `DELETE`) with input validation and masking.
- [x] `packages/web/test/settings-api.test.ts` -- Create integration test suite for `/api/settings/keys`.
- [x] `packages/cli/src/app.ts` & `packages/cli/src/cli.ts` -- Wire settings repo and service into `AppContext` and `WebServerOptions`.

**Acceptance Criteria:**
- Given an initialized SQLite database, when the server starts, then `app_settings` table exists and supports atomic upsert, read, and delete.
- Given a provider secret saved in SQLite, when `SettingsService.getSecret(provider)` is called, then the SQLite value is returned even if an environment variable exists.
- Given no secret in SQLite but an environment variable exists (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NOTION_API_KEY`, `OLLAMA_HOST`), when `SettingsService.getSecret(provider)` is called, then the environment variable is returned.
- Given a request to `GET /api/settings/keys`, then the response returns provider statuses with masked values (`sk-...xxxx`, `secret_...xxxx`), never leaking raw secrets.
- Given a request to `POST /api/settings/keys` with `{ provider, key }`, then the secret is trimmed and persisted to SQLite, returning 200 with masked preview.
- Given a request to `DELETE /api/settings/keys/:provider`, then the secret is removed from SQLite and returns updated configuration status.
- Given all existing tests in `core` and `web`, all tests pass with zero regressions.

## Design Notes

Key mapping and fallback conventions:
- Supported providers:
  - `openai`: DB key `openai_api_key`, Env `OPENAI_API_KEY`; Endpoint DB key `openai_endpoint`, Env `OPENAI_BASE_URL`
  - `anthropic`: DB key `anthropic_api_key`, Env `ANTHROPIC_API_KEY`; Endpoint DB key `anthropic_endpoint`, Env `ANTHROPIC_BASE_URL`
  - `gemini`: DB key `gemini_api_key`, Env `GEMINI_API_KEY`; Endpoint DB key `gemini_endpoint`, Env `GEMINI_BASE_URL`
  - `notion`: DB key `notion_api_key`, Env `NOTION_API_KEY`
  - `ollama`: Endpoint DB key `ollama_host`, Env `OLLAMA_HOST` (or `OLLAMA_BASE_URL`, default: `http://localhost:11434`)

Masking function:
- Length <= 8: `"****"`
- Length > 8: `${str.slice(0, 3)}...${str.slice(-4)}` (e.g. `sk-12345678` -> `sk-...5678`)

## Verification

**Commands:**
- `npm test` in `packages/core` -- expected: All core unit tests pass including `settings-repository.test.ts`.
- `npm test` in `packages/web` -- expected: All web integration tests pass including `settings-api.test.ts`.
- `npm run build` at root -- expected: Monorepo TypeScript compilation succeeds with zero errors.

## Suggested Review Order

**Secret Fallback & Sanitization Engine**

- Hierarchical resolution: SQLite value takes precedence over environment variable fallback.
  [`settings-service.ts:62`](../../packages/core/src/services/settings-service.ts#L62)

- Zero-leak masking safely masks credentials preserving first 3 and last 4 characters.
  [`settings-service.ts:48`](../../packages/core/src/services/settings-service.ts#L48)

- Dynamic provider credential aggregation with origin tracking (`database` vs `environment` vs `none`).
  [`settings-service.ts:144`](../../packages/core/src/services/settings-service.ts#L144)

- Null-safe provider credential storage and explicit deletion command handling.
  [`settings-service.ts:99`](../../packages/core/src/services/settings-service.ts#L99)

**SQLite Storage & Schema Migration**

- Idempotent `app_settings` schema creation in migration lifecycle for zero-downtime boots.
  [`db.ts:369`](../../packages/core/src/storage/db.ts#L369)

- Atomic upsert and retrieval for app settings keys in SQLite.
  [`settings-repository.ts:24`](../../packages/core/src/storage/settings-repository.ts#L24)

- Port implementation for `SettingsRepository` fulfilling domain contract.
  [`settings-repository.ts:5`](../../packages/core/src/storage/settings-repository.ts#L5)

**Secrets Management REST Endpoints**

- Trims, validates, and persists provider API keys or custom endpoints.
  [`server.ts:2904`](../../packages/web/src/server.ts#L2904)

- Trailing-slash resilient deletion purging provider secrets from SQLite with immediate status response.
  [`server.ts:2939`](../../packages/web/src/server.ts#L2939)

- Returns masked provider key statuses guaranteeing no raw secret leakage.
  [`server.ts:2892`](../../packages/web/src/server.ts#L2892)

- Server options and dependency injection fallback for settings repository and service.
  [`server.ts:54`](../../packages/web/src/server.ts#L54)

**Application Wiring & Peripherals**

- AppContext wiring maintaining repository port and singleton service across CLI operations.
  [`app.ts:49`](../../packages/cli/src/app.ts#L49)

- Web server factory passing configured settings service and repository.
  [`cli.ts:58`](../../packages/cli/src/cli.ts#L58)

- SettingsRepository port contract specifying CRUD operations.
  [`index.ts:73`](../../packages/core/src/ports/index.ts#L73)

- Zod domain models for settings, supported secret providers, and key status.
  [`models.ts:172`](../../packages/core/src/domain/models.ts#L172)

- Unit tests verifying fallback precedence, masking, whitespace sanitization, and CRUD.
  [`settings-repository.test.ts:1`](../../packages/core/test/settings-repository.test.ts#L1)

- Integration tests validating security invariant, route handling, and edge cases.
  [`settings-api.test.ts:1`](../../packages/web/test/settings-api.test.ts#L1)

