---
title: 'Interactive Notion Source UI and Monorepo Verification'
type: 'feature'
created: '2026-09-10'
status: 'done'
baseline_commit: '7a1c66b'
review_loop_iteration: 1
context:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/prd/prd.md
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-15-context.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** While Story 15.5 completed the backend `NotionStrategy` ingestion engine and database migration, users cannot configure or manage Notion data sources from the web client UI. The modal dialogs (`AddSourceModal` and `EditSourceModal`) lack a Notion source option, provide no visibility into whether a Notion API token has been configured in Settings, offer no UI toggle for subpage recursion, and client views lack Notion badge rendering.

**Approach:**
1. Update Frontend Types & State:
   - Add `'notion'` to `DataSourceType` in `packages/web/client/src/lib/types.ts`.
   - Utilize `settingsStore` to check real-time Notion token configuration readiness (`settingsStore.keys.notion.isConfigured`).
2. Update `AddSourceModal.svelte`:
   - Add `📓 Notion` source type option.
   - Display a live token readiness indicator:
     - If configured: green badge `✓ Notion Token Active`.
     - If missing: warning banner/badge `⚠️ Notion Token Missing` with a direct navigation link/button to Settings (`⚙️ Settings`).
   - Add Notion Page/Database URL input field with clear placeholders and helper hints.
   - Add `[x] Include subpages as separate documents (recursive crawl up to 3 levels)` checkbox, appending `?recursive=true` to the URI when checked.
3. Update `EditSourceModal.svelte`:
   - Support `source.type === 'notion'`.
   - Display live token readiness indicator.
   - Parse `recursive=true` from existing source URI / tags on modal open to initialize the recursion toggle.
   - Persist recursion preference to `uri` on save.
4. Update UI Badge Styling:
   - Add `.type-badge.notion` and pill styling across `SourcesView.svelte`, `GenerateStudio.svelte`, `SourceDocumentInspector.svelte`, and `DashboardView.svelte`.
   - Support `onNavigate` pass-through from `SourcesView` to modals for seamless transition to Settings.
   - In `SourcesView`, display a `🔄 Recursive` indicator pill in URI column when a Notion source has recursion enabled.
5. Verification & Monorepo Testing:
   - Add frontend unit tests in `packages/web/test/notion-source-ui.test.ts` for modal rendering, token badge state, recursive URI generation, and edit round-tripping.
   - Execute full monorepo test suite and build across all packages (`@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/cli`, `@flashcard-master/web`).

## Boundaries & Constraints

**Always:**
- Follow Svelte 5 runes syntax (`$state`, `$derived`, `$props`, `$effect`).
- Never expose raw API tokens in the UI; only display masked values or boolean readiness status.
- Ensure keyboard accessibility and proper ARIA labels on interactive elements.
- Keep source URI query parameters clean (e.g. handle existing `?` vs `&` gracefully when appending `recursive=true`).

**Ask First:**
- Adding additional third-party UI libraries or CSS frameworks.

**Never:**
- Never hardcode Notion tokens or URLs in client-side storage.
- Never regress existing source types (`rss`, `web`, `local`, `sitemap`, `llms-txt`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Select Notion Type (Token Active) | User selects Notion radio; Notion key is configured in `settingsStore` | Displays `✓ Notion Token Active` badge; URL input ready | Standard form validation on empty URL |
| Select Notion Type (Token Missing) | User selects Notion radio; Notion key not configured | Displays `⚠️ Notion Token Missing` badge with link to Settings | User can still submit URL, but warned that sync will fail without token |
| Add Notion Source with Recursion | User checks "Include subpages", enters Notion URL | Appends `?recursive=true` (or `&recursive=true`) to source URI on creation | Handles URLs with or without pre-existing query params |
| Add Notion Source without Recursion | User unchecks "Include subpages" | Submits clean Notion URL without `recursive=true` parameter | Retains clean canonical URL |
| Edit Existing Recursive Notion Source | Source has `?recursive=true` in URI | Checkbox initializes checked; base URL displayed cleanly; saving preserves or toggles recursion | Recomputes query params without duplicate `?` |
| Sources Table Display | Notion source rendered in `SourcesView` | Displays Notion type badge and `🔄 Recursive` badge if recursive | Graceful fallback if URI is empty |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/lib/types.ts` -- Update `DataSourceType` union with `'notion'`.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Add Notion type, token readiness badge, URL field, and recursion checkbox.
- `packages/web/client/src/components/EditSourceModal.svelte` -- Support Notion editing, token badge, and recursion toggle.
- `packages/web/client/src/views/SourcesView.svelte` -- Add Notion type badge CSS, pass `onNavigate` to modals, and show recursive badge.
- `packages/web/client/src/views/GenerateStudio.svelte` -- Add Notion type badge styling.
- `packages/web/client/src/views/DashboardView.svelte` -- Add Notion type badge styling.
- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Add Notion type badge styling.
- `packages/web/test/notion-source-ui.test.ts` -- Unit and integration tests for Notion UI components and modal workflows.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/lib/types.ts` -- Add `'notion'` to `DataSourceType`.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Add Notion type option, token readiness badge, URL input, and recursion toggle.
- [x] `packages/web/client/src/components/EditSourceModal.svelte` -- Support Notion editing, token badge, and recursion toggle.
- [x] `packages/web/client/src/views/SourcesView.svelte` -- Update badge styling and URI summary for Notion.
- [x] `packages/web/client/src/views/GenerateStudio.svelte`, `DashboardView.svelte`, `SourceDocumentInspector.svelte` -- Update Notion badge CSS.
- [x] `packages/web/test/notion-source-ui.test.ts` -- Create comprehensive unit and component tests.
- [x] Full monorepo verification: run `npm run build` and `npm test` across all workspaces.

**Acceptance Criteria:**
- Users can select "Notion" when adding a new ingestion source.
- Live token readiness badge clearly communicates whether Notion token is configured, with a link to Settings if missing.
- "Include subpages as separate documents" checkbox accurately manages the `recursive=true` parameter in source URI.
- Edit modal faithfully loads, displays, and updates existing Notion sources and recursion settings.
- Sources table and other views render Notion badge styling consistently.
- All monorepo builds and tests pass cleanly with zero regressions.

## Verification

**Commands:**
- `npm test --workspace=@flashcard-master/web` -- Web tests pass cleanly.
- `npm run build` -- Monorepo client and server build succeeds with zero errors.
- `npm test` -- All monorepo test suites pass.

## Suggested Review Order

1. [`packages/web/client/src/lib/types.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/lib/types.ts)
2. [`packages/web/client/src/components/AddSourceModal.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/components/AddSourceModal.svelte)
3. [`packages/web/client/src/components/EditSourceModal.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/components/EditSourceModal.svelte)
4. [`packages/web/client/src/views/SourcesView.svelte`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/client/src/views/SourcesView.svelte)
5. [`packages/web/test/notion-source-ui.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/web/test/notion-source-ui.test.ts)
