---
title: 'Story 20.4: Contextual Setup UX & Human-Centric Onboarding'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'ff0c8dd'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
First-time users and self-hosters encounter unnecessary friction during initial setup: technical jargon in document slicing ("Semantic Outline", "Page Budget"), mystery around Notion page permissions requiring manual invite via the `•••` menu, lack of direct links to obtain LLM API keys without searching provider consoles, no live feedback on whether Desktop Anki is running, and a blank/empty dashboard without welcoming orientation.

**Approach:**
1. **LLM Provider Cards (`SettingsView.svelte`)**: Retain standard developer labels (`API Key`, `Base URL`) while adding lightweight contextual tooltips, helpful guidance, and 1-click console links (`Get API Key ↗`) for the 4 supported providers (Google Gemini, OpenAI, Anthropic, Ollama).
2. **Interactive Notion Permissions Walkthrough (`SettingsView.svelte`)**: Add an illustrated 3-step permissions guide explaining how to invite the internal integration to target pages/databases via the Notion `•••` -> `Connect to` menu, with an actionable access diagnostic banner.
3. **Desktop AnkiConnect Setup Card (`SettingsView.svelte`)**: Implement live connection detection with status indicator (`🟢 Anki Ready` / `⚪ Anki Not Running`), 1-click copy for add-on code `2055492159`, and friendly connection error diagnosis.
4. **Human-Readable Document Slicing Controls (`AddSourceModal.svelte`, `SettingsView.svelte`)**: Replace technical slicing jargon with plain-English options (`Split by Chapters & Outline`, `Split by Page Blocks`, `Keep as Single Document`).
5. **Welcoming First-Run Onboarding Empty State (`DashboardView.svelte`)**: Render a friendly onboarding card when no sources or cards exist, guiding users to configure their first AI provider or add their first learning source with direct action buttons.

## Boundaries & Constraints

**Always:**
- Retain cutting-edge AI provider defaults (`gemini-3.6-flash`, `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `phi4-mini`) strictly limited to the 4 supported providers.
- Maintain dark slate UI aesthetics, responsive styling, and keyboard accessibility.
- Preserve Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`).
- Ensure all existing unit tests, typechecks, and builds pass cleanly.

**Ask First:**
- Adding additional third-party cloud AI providers beyond the 4 supported engines.

**Never:**
- Never remove standard technical labels (`API Key`, `Base URL`, `Environment Variable`) used by advanced developers.
- Never block navigation or require mandatory wizard completion to use the app.

</frozen-after-approval>

## Code Map

- `packages/web/client/src/views/SettingsView.svelte` -- LLM provider cards with console links & tooltips, interactive Notion permissions guide, AnkiConnect live status & 1-click copy & diagnostic.
- `packages/web/client/src/stores/settingsStore.svelte.ts` -- Silent Anki connection test on mount to populate live status badge without disruptive failure toast.
- `packages/web/client/src/components/AddSourceModal.svelte` -- Plain-English labels for document slicing modes (`Split by Chapters & Outline`, `Split by Page Blocks`, `Keep as Single Document`).
- `packages/web/client/src/views/DashboardView.svelte` -- Welcoming first-run onboarding empty state with guided 2-step setup CTA when zero sources or cards exist.
- `packages/web/test/client-stores.test.ts` -- Unit tests for silent Anki test and settings store state handling.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/stores/settingsStore.svelte.ts` -- Add `silent` option to `testAnki()` to support automatic non-intrusive status detection on view load.
- [x] `packages/web/client/src/views/SettingsView.svelte` -- Add console links (`Get API Key ↗`) and tooltips to LLM cards, 3-step Notion permissions guide, AnkiConnect live badge, 1-click copy code `2055492159`, and human-friendly slicing select labels.
- [x] `packages/web/client/src/components/AddSourceModal.svelte` -- Update document slicing mode radio options with human-readable titles and descriptions.
- [x] `packages/web/client/src/views/DashboardView.svelte` -- Add welcoming first-run onboarding card with quickstart navigation buttons when no sources or cards exist.
- [x] `packages/web/test/client-stores.test.ts` -- Add unit tests asserting silent Anki test behavior and status retention.

**Acceptance Criteria:**
- Given a user on the Settings page, when viewing AI provider cards, then 1-click console links (`Get API Key ↗`) and contextual tooltips are visible for Google AI Studio, OpenAI Platform, Anthropic Console, and Ollama.
- Given a user on the Notion settings card, when reviewing permissions, then an illustrated 3-step guide clearly explains inviting the integration via `•••` -> `Connect to`.
- Given a user on the Anki settings card, when viewing the card, then a live status badge (`🟢 Anki Ready` or `⚪ Anki Not Running`) is displayed, and clicking the add-on code copies `2055492159` with visual feedback.
- Given a user adding a rich document source in Add Source modal, when configuring slicing, then options read `Split by Chapters & Outline`, `Split by Page Blocks`, and `Keep as Single Document`.
- Given a new user on the Dashboard with 0 sources and 0 cards, then a welcoming first-run onboarding banner is displayed with direct action buttons to configure an AI model or add a source.
- All test suites, typechecks, and builds pass with 0 errors.

## Design Notes

### Anki Add-on Code Copy
Use clipboard API with fallback and reactive `$state` for `copiedAnkiCode` showing "Copied!" for 2 seconds.

### Document Slicing Plain English
- `outline`: `Split by Chapters & Outline` (Slices by headings, chapters, and sections)
- `budget`: `Split by Page Blocks` (Fixed page & word threshold chunks)
- `none`: `Keep as Single Document` (Ingest as a single whole document)

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors across all monorepo packages.
- `npm test` -- expected: all vitest test suites pass.
- `npm run build` -- expected: clean Vite/Svelte compilation.

## Suggested Review Order

**Contextual Onboarding & AI Credentials Setup**

- Provider metadata with console links and tooltips
  [`SettingsView.svelte:34`](../../packages/web/client/src/views/SettingsView.svelte#L34)

- Interactive 3-step Notion permissions guide with visual authorization steps
  [`SettingsView.svelte:455`](../../packages/web/client/src/views/SettingsView.svelte#L455)

- AnkiConnect live badge, 1-click add-on code copy, and troubleshooting diagnostic
  [`SettingsView.svelte:920`](../../packages/web/client/src/views/SettingsView.svelte#L920)

- Silent Anki connectivity detection on mount
  [`settingsStore.svelte.ts:158`](../../packages/web/client/src/stores/settingsStore.svelte.ts#L158)

**Human-Readable Document Slicing Controls**

- Plain-English chapter and page block slicing mode options in Add Source modal
  [`AddSourceModal.svelte:389`](../../packages/web/client/src/components/AddSourceModal.svelte#L389)

- Slicing mode dropdown labels in centralized Settings
  [`SettingsView.svelte:1400`](../../packages/web/client/src/views/SettingsView.svelte#L1400)

**First-Run Welcome State**

- Guided 2-step onboarding banner when no sources or cards exist
  [`DashboardView.svelte:72`](../../packages/web/client/src/views/DashboardView.svelte#L72)

**Testing & Verification**

- Unit tests for silent Anki connection test and status state retention
  [`client-stores.test.ts:901`](../../packages/web/test/client-stores.test.ts#L901)

