# Epic 19 Context: Deck Lifecycle Management, Partial Exports, and UI Performance Hardening

<!-- Compiled from user requirements and design elicitation. -->

## Goal

Empower users with granular control over their flashcard knowledge base by introducing deck lifecycle operations (cloning decks, automatic batch splitting, and selective card movement), partial and time-scoped export capabilities (date-range filtering, random subsampling, card limit budgets), asynchronous background subdocument synthesis with real-time Task Center feedback, an interactive tag selector for data sources, and performance/layout hardening across the application (Question Explorer infinite scrolling and responsive text overflow protection).

## Stories

- **Story 19.1:** Question Explorer Infinite Scroll & Backend Pagination
  - ID: `19-1-question-explorer-infinite-scroll-and-lazy-loading`
- **Story 19.2:** Deck Operations: Clone, Batch Split & Selective Card Moving
  - ID: `19-2-deck-operations-clone-split-and-selective-card-moving`
- **Story 19.3:** Partial, Date-Filtered & Randomized Export Engine
  - ID: `19-3-partial-date-filtered-and-randomized-export-engine`
- **Story 19.4:** Interactive Tag Selector for Data Sources
  - ID: `19-4-interactive-tag-selector-for-data-sources`
- **Story 19.5:** Asynchronous Subdocument Generation via Task Center
  - ID: `19-5-asynchronous-subdocument-generation-via-task-center`
- **Story 19.6:** Monorepo Responsive Layout & Text Overflow Hardening
  - ID: `19-6-monorepo-responsive-layout-and-overflow-hardening`
- **Story 19.7:** Subdocument Explorer & Reader Redesign
  - ID: `19-7-subdocument-explorer-and-reader-redesign`

## Requirements & Design Decisions

1. **Question Explorer Infinite Scrolling:**
   - Replace loading all cards at once with cursor/offset backend pagination (`limit`, `offset`, total count).
   - In `QuestionExplorer.svelte`, implement infinite scroll using an intersection observer to append cards as the user scrolls.
   - Maintain active filters (search query, deck filter chip, difficulty filter chip) seamlessly across fetched pages.

2. **Deck Lifecycle Management (Split & Clone):**
   - **Clone Deck:** Duplicate all cards in a deck under a new name with fresh UUIDs and preserved metadata.
   - **Batch Splitting:** Automatically divide large decks into equal sub-decks with a configurable card limit (e.g. 25 cards per sub-deck named `Deck - Part 1`, `Deck - Part 2`).
   - **Selective Card Move:** Enable selecting cards via checkboxes in Question Explorer and moving them to a target deck.

3. **Partial & Time-Scoped Export Filtering:**
   - **Date Range Filtering:** Filter cards by `created_at` timestamp with preset shortcuts ("Today", "Last 7 Days", "Last 30 Days", "Custom Range").
   - **Random Subsampling & Shuffling:** Select a random subset of $N$ cards in randomized order for quick practice sessions.
   - **Card Count Limit:** Specify a maximum card budget for partial exports.

4. **Interactive Tag Selector for Data Sources:**
   - In `AddSourceModal.svelte` and `EditSourceModal.svelte`, replace the comma-separated text string with an interactive tag pill component.
   - Auto-suggest existing tags from SQLite (`sourceRepo.listAllTags()`) with keyboard navigation and instant pill removal (`✕`).

5. **Asynchronous Subdocument Generation:**
   - Fix "⚡ Generate" from subdocuments in `SourceDocumentInspector.svelte` to dispatch an asynchronous background task to `JobManager` instead of blocking synchronous requests.
   - Immediately stream progress into the Task Center drawer and update card counts reactively upon job completion.

6. **Responsive Layout & Text Overflow Hardening:**
   - Question Explorer cards: Prevent text clipping, handle long questions/answers/quotes gracefully, and allow card expansion.
   - Document Inspector & Preview Modal: Add horizontal scroll containers for wide code blocks and preformatted text.
   - Slide-over Drawers: Ensure resilient responsive max-widths and prevent viewport overflow on smaller screens.
   - Generate Studio: Eliminate horizontal spill on document hierarchy trees.

7. **Subdocument Explorer & Reader Redesign:**
   - Compact table/row layout: Replace vertically stacked card blocks with scannable rows displaying title, page badge, word count, card count, and inline horizontal actions.
   - Expandable/fullscreen drawer: Provide a width expander toggle (e.g. standard drawer vs wide or full-screen) so reviewing long chapter catalogs (from EPUBs or sliced PDFs) is spacious and ergonomic.
   - Effortless scanning: Sticky header controls, responsive action alignment, and clear metadata scanning.

## Delivery Strategy

- **Specification PR:** Open initial PR with planning artifacts (`epics.md`, `epic-19-context.md`, `sprint-status.yaml`).
- **Story PRs:** Implement each story in an isolated branch and submit a separate PR for review and verification.
- **Issue Tracking:** Issues will be closed manually by the user upon merging each PR.
