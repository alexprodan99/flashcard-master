# Epic 15 Context: Centralized Secrets & Integrations Dashboard & Notion Data Source Ingestion

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide a secure, local-first centralized Secrets & Settings management repository in SQLite with environment variable fallbacks and masked UI display, along with live "Test Connection" validation pings across Notion and LLM providers. Ingest credentials automatically into card generation workflows to eliminate manual token re-entry. Implement an end-to-end Notion Ingestion Strategy via `@notionhq/client` that auto-detects Databases vs Pages, performs delta sync using `last_edited_time`, supports configurable child subpage recursion, and localizes expiring AWS S3 images to disk via `MediaService`.

## Stories

- Story 15.1: SQLite Settings Repository, Fallback Chain & Secrets REST API
- Story 15.2: Live Provider Credential Verification Endpoints
- Story 15.3: Integrations & Secrets UI Dashboard (`SettingsView`)
- Story 15.4: Automatic Credential Injection in Generation Studio & Workers
- Story 15.5: Notion Ingestion Strategy (`NotionStrategy`)
- Story 15.6: Interactive Notion Source UI & Monorepo Verification

## Requirements & Constraints

- **Persistent Settings Store**: The system stores settings and provider secrets in an `app_settings` SQLite table (`key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at TEXT NOT NULL`).
- **Hierarchical Fallback Chain**: Stored secrets take precedence over environment variables: `SettingsRepository.get(key) ?? process.env[ENV_KEY] ?? null`.
- **Zero-Telemetry & Masking Security**: Raw secrets must never be leaked over API responses. `GET /api/settings/keys` returns masked strings (e.g. `sk-...4a12`, `secret_...9a2f`) and `isConfigured: boolean`.
- **Live Connection SLA**: `POST /api/settings/keys/test` must respond with status and descriptive diagnostics in < 3 seconds with bounded timeouts and error isolation.
- **Auto-Credential Injection**: Generate Studio and background worker threads must automatically use saved credentials if manual inputs are omitted.
- **Notion Resource Auto-Detection**: The Notion strategy extracts 32-character UUIDs from Notion URLs and determines whether the resource is a `database` or `page`.
- **Notion Delta Synchronization**: Databases sync incrementally with filter `last_edited_time > lastSyncedAt`, mapping title properties to document titles and multi-select tags to document tags.
- **Notion Subpage Recursion**: Pages support a configurable `?recursive=true` flag to crawl child pages up to depth 3 as discrete `DiscoveredDocument` records.
- **S3 Image Asset Localization**: Notion's presigned S3 URLs expire in 60 minutes. The strategy must intercept all image blocks and download them via `MediaService.downloadAndSave(url, originUrl)` to local storage (`.flashcard-master/media/`), replacing links with `/api/media/<id>`.

## Technical Decisions

- **AD-23 (Secrets & Settings Architecture)**: SQLite `app_settings` table managed via `SqliteSettingsRepository` and `SettingsService` on the main thread.
- **AD-24 (NotionStrategy)**: Implements `IngestionStrategy` (`type = 'notion'`) in `packages/adapters/src/ingestion/notion-strategy.ts` using official `@notionhq/client`.
- **AD-25 (Provider Verification Protocol)**: Diagnostic test ping handlers using lightweight API checks (`notion.users.me()`, `openai.models.list()`, `ollama.tags`).
- **Database Schema**:
  - `app_settings` table (`key`, `value`, `updated_at`).
  - `data_sources` table `type` check constraint updated to include `'notion'`.
- **Worker Thread Model**: Worker threads receive resolved credentials from the main thread; no direct SQLite writes from worker threads.

## UX & Interaction Patterns

- **Settings View**: Dedicated navigation tab `⚙️ Settings` (`?tab=settings`) featuring categorized cards for Notion and LLMs with masked inputs, reveal/hide toggle (`👁️`), Save, Clear, and "Test Connection" buttons.
- **Add/Edit Source Modal**: Notion type option with live token readiness badge (`Notion Token Active` or warning with link to Settings), URL input, and `[x] Include subpages as separate documents` checkbox.
- **Generate Studio**: Displays `Using saved API key [sk-...4a12] ✓` when an LLM key is configured in Settings, removing the need for manual entry.

## Cross-Story Dependencies

- Story 15.1 provides the foundational SQLite schema, repository, and REST API needed by all subsequent stories.
- Story 15.2 builds on Story 15.1 to add the `POST /api/settings/keys/test` verification endpoint.
- Story 15.3 provides the frontend UI for the endpoints built in Stories 15.1 and 15.2.
- Story 15.4 connects Generate Studio and workers to the `SettingsService` created in Story 15.1.
- Story 15.5 implements `NotionStrategy`, retrieving the Notion token from `SettingsService` (Story 15.1).
- Story 15.6 implements the Notion UI source configuration and end-to-end monorepo verification.
