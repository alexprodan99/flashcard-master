---
title: 'Notion Ingestion Strategy (NotionStrategy)'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '07ec6f1'
review_loop_iteration: 1
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-15-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users cannot ingest study content directly from Notion workspaces. Notion resources can be standalone pages or structured databases, their content is modeled as hierarchical block trees rather than plaintext, and AWS S3 presigned image assets expire after 60 minutes, causing media link rot if not immediately localized.

**Approach:**
1. Update Core Domain:
   - Add `'notion'` to `DataSourceTypeSchema` in `packages/core/src/domain/models.ts`.
   - Update `SCHEMA_SQL` and migration routines in `packages/core/src/storage/db.ts` to allow `'notion'` in the `data_sources` table `CHECK(type IN (...))` constraint.
2. Implement `NotionStrategy` in `packages/adapters/src/ingestion/notion-strategy.ts`:
   - Implement `IngestionStrategy` (`readonly type = "notion" as const`).
   - Extract canonical 32-character Notion UUIDs from URLs (`notion.so/workspace/Page-Name-32hex`, `notion.so/32hex`, `notion.site/...`) or raw UUID strings.
   - Resolve integration token via `settingsService.getSecret("notion")` or `process.env.NOTION_API_KEY`, throwing clear errors if missing.
   - Auto-detect resource type: query `databases.retrieve` first; if not found, fall back to `pages.retrieve`.
   - **Database Ingestion**:
     - Incrementally query items using `filter: { timestamp: "last_edited_time", last_edited_time: { after: lastSync.lastSyncedAt } }` when `lastSync` is provided.
     - Extract document title from title property, tags from multi-select/select properties, and page URL.
     - Recursively fetch child blocks, converting them to clean Markdown.
   - **Page Ingestion & Recursion**:
     - Retrieve page properties and child blocks.
     - When `?recursive=true` is set on the source URI or options, crawl `child_page` blocks up to depth 3 as discrete `RawDocument` records with parent provenance.
   - **Block to Markdown Engine**:
     - Convert headings (H1-H3), paragraphs, bulleted/numbered lists, to-dos (`[x]`/`[ ]`), quotes, callouts, code blocks, dividers, bookmarks, and tables (`table` / `table_row`).
   - **S3 Presigned Media Localization**:
     - Intercept `image` blocks (`file` and `external`).
     - If `mediaService` is provided, download and persist the S3 image before expiration via `mediaService.downloadAndSave(url, originUrl)`, rewriting links to persistent `/api/media/<id>`.
3. Register `NotionStrategy` in `packages/cli/src/app.ts` so both CLI and WebServer instantiate it.
4. Add comprehensive unit and integration tests in `packages/adapters/test/notion-strategy.test.ts`.

## Boundaries & Constraints

**Always:**
- Mask Notion API tokens and never log secret tokens or print them in errors/exceptions.
- Gracefully localize presigned S3 images before 60-minute expiration when `MediaService` is provided, and degrade gracefully to original URL if media download fails.
- Support delta synchronization on Notion databases via `last_edited_time`.
- Bound recursive subpage crawling to a maximum depth of 3 to avoid infinite loops and runaway API usage.
- Follow the `IngestionStrategy` contract (`fetch`, `extractCleanText`) strictly.

**Ask First:**
- Modifying SQLite core schemas outside the `data_sources.type` check constraint.

**Never:**
- Never crash ingestion on unsupported block types; skip or format them into standard text.
- Never write credentials into data source URIs or database fields.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ingest Database | Database URL, no previous sync | Queries database pages, fetches all block trees, downloads images, returns `RawDocument[]` | Catches 404 or auth failure |
| Incremental Database Sync | Database URL with `lastSync.lastSyncedAt` | Passes `filter` with `last_edited_time.after` to Notion query, returning only updated/new items | Empty array if no updates |
| Ingest Single Page | Page URL without recursive flag | Fetches page metadata and blocks, returns single `RawDocument` | Catches 404 object not found |
| Recursive Subpage Crawl | Page URL with `?recursive=true` containing child pages | Traverses child pages up to depth 3, yielding distinct `RawDocument` for root and each child | Cycle prevention via visited set |
| Expiring S3 Image Block | Image block with AWS S3 presigned URL | Downloads via `mediaService.downloadAndSave`, rewrites markdown link to `/api/media/<filename>` | Keeps original URL if fetch fails |
| Missing Notion Token | No token in `app_settings` or `NOTION_API_KEY` | Throws descriptive error directing user to configure token in Settings | Clean error message |
| Notion Rate Limit (429) | Notion API responds with 429 rate limit | Handles Notion error or throws clear rate limit message | Retries or reports gracefully |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Add `'notion'` to `DataSourceTypeSchema`.
- `packages/core/src/storage/db.ts` -- Update `SCHEMA_SQL` and migration logic for `'notion'` in `data_sources` check constraint.
- `packages/adapters/src/ingestion/notion-strategy.ts` -- Core `NotionStrategy` implementation: ID extraction, database/page auto-detection, block-to-markdown conversion, subpage recursion, and S3 image localization.
- `packages/adapters/src/index.ts` -- Export `NotionStrategy` and related options.
- `packages/cli/src/app.ts` -- Register `NotionStrategy` in `strategyRegistry`.
- `packages/adapters/test/notion-strategy.test.ts` -- Comprehensive unit tests with mocked Notion client and MediaService.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Update `DataSourceTypeSchema` to include `'notion'`.
- [x] `packages/core/src/storage/db.ts` -- Update `SCHEMA_SQL` and `runMigrations` for `'notion'` type constraint.
- [x] `packages/adapters/src/ingestion/notion-strategy.ts` -- Implement `NotionStrategy`.
- [x] `packages/adapters/src/index.ts` -- Export `NotionStrategy` and types.
- [x] `packages/cli/src/app.ts` -- Register `NotionStrategy` in `createAppContext`.
- [x] `packages/adapters/test/notion-strategy.test.ts` -- Add unit and integration tests.

**Acceptance Criteria:**
- Given a Notion Database URL, `fetch` successfully queries database pages, formats blocks as Markdown, and returns `RawDocument[]`.
- Given an incremental sync state, `fetch` filters by `last_edited_time`.
- Given a Notion Page URL with `?recursive=true`, child pages are crawled up to depth 3 as discrete documents.
- Given image blocks with S3 URLs, images are localized via `MediaService` and links converted to `/api/media/<id>`.
- Given missing Notion credentials, throws a descriptive configuration error.
- All workspace tests (`npm test`) and monorepo build (`npm run build`) pass cleanly.

## Verification

**Commands:**
- `npm test --workspace=@flashcard-master/core` -- Core domain and migrations pass cleanly.
- `npm test --workspace=@flashcard-master/adapters` -- Adapters tests pass cleanly including `notion-strategy.test.ts`.
- `npm run build` at root -- Clean monorepo build.

## Suggested Review Order

1. [`packages/core/src/domain/models.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/core/src/domain/models.ts) -- Addition of `'notion'` to `DataSourceTypeSchema`.
2. [`packages/core/src/storage/db.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/core/src/storage/db.ts) -- Check constraint and migration update.
3. [`packages/adapters/src/ingestion/notion-strategy.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/ingestion/notion-strategy.ts) -- `NotionStrategy` class and block-to-markdown engine.
4. [`packages/adapters/src/index.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/index.ts) -- Strategy exports.
5. [`packages/cli/src/app.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/cli/src/app.ts) -- Ingestion strategy registration in context.
6. [`packages/adapters/test/notion-strategy.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/test/notion-strategy.test.ts) -- Unit and edge-case tests.
