---
title: 'Story 19.6: Monorepo Responsive Layout & Text Overflow Hardening'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: '061eb6a12cdcbf347ab3595990c0504337305705'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-19-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Across several key screens in the web application, long text strings (such as extensive questions, detailed answers, verbatim quotes, code snippets, or document paths) can cause text clipping, horizontal layout spill, or awkward line wrapping on smaller or resized displays. Specifically:
1. **Question Explorer**: Long technical questions, answers, and source citations can overflow cards or cause single cards to stretch uncontrollably; long unbroken terms (URLs, code symbols) can break card boundaries.
2. **Document Preview Modal**: Large preformatted code blocks and data tables can push the modal wider than the browser viewport without dedicated horizontal scrolling.
3. **Slide-Over Drawers (`CardEditorDrawer`, `TaskCenterDrawer`, `SourceDocumentInspector`)**: Fixed widths or generous padding can cause drawer panels to clip on smaller laptop or mobile screens, generating unwanted horizontal page scrollbars.
4. **Generate Studio**: Deeply nested source trees, long document titles, and source URLs can overflow document row trays on narrower window sizes.

**Approach:**
1. **Question Explorer Hardening**:
   - Apply `overflow-wrap: break-word`, `word-break: break-word`, and `min-width: 0` across all card text elements.
   - Upgrade the card grid column template to adapt dynamically (`minmax(min(100%, 360px), 1fr)`) to prevent horizontal overflow on smaller screens.
   - For lengthy source quotes, provide a clean max-height with visual expansion toggle (`Show more` / `Show less`) so cards stay compact and readable.
2. **Document Preview Modal Scroll Containers**:
   - Ensure all `<pre>`, `<code>`, and `<table>` blocks inside formatted markdown reader views have horizontal scroll containers (`overflow-x: auto`) and responsive padding.
   - Constrain the modal width dynamically with `max-width: min(860px, 95vw)` and responsive padding to prevent screen spill.
3. **Responsive Drawers**:
   - Ensure all slide-over drawers use responsive width bounds (`max-width: min(580px, 100vw)`), adjusted padding on mobile viewports (`@media (max-width: 640px)`), and `box-sizing: border-box` to prevent dashboard viewport overflow.
4. **Generate Studio Tray Resiliency**:
   - Constrain document title, badges, and URL elements with flex-shrink limits, truncation, and `min-width: 0` so narrow screens never experience horizontal spilling.
5. **Testing**:
   - Add automated test assertions verifying responsive layout styling and text overflow behavior.

## Boundaries & Constraints

**Always:**
- Keep all card text accessible and readable without clipping or hidden text.
- Ensure drawers and modals resize fluidly down to 320px mobile viewports without horizontal viewport scrollbars on the main document body.
- Preserve all existing flashcard actions, checkboxes, edit buttons, and reveal toggles.
- Preserve preformatted indentation and whitespace in code blocks while providing smooth horizontal scrolling.

**Never:**
- Never truncate essential question or answer text without a way for the user to expand and read the full content.
- Never cause double vertical or unexpected horizontal scrollbars on desktop or mobile layouts.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output | Fallback |
|---|---|---|---|
| Unbroken long token | 120-char identifier or URL without spaces | Wraps gracefully using `overflow-wrap: break-word` without pushing card width | Horizontal scroll within element if preformatted |
| Extensive source quote | 500-word verbatim citation in card | Constrained to tidy card layout with "Show more / Show less" toggle | Expanded view displays complete verbatim text |
| Wide markdown table in preview | Table with 8 wide columns in reader | Table scrolls horizontally inside reader container; modal maintains width | Clean horizontal scrollbar on table |
| Mobile drawer opening | User opens Task Center or Editor on 375px phone | Drawer takes 100vw with snug mobile padding (16px), zero main-body spill | Responsive `@media (max-width: 640px)` rule |
| Long doc title in Generate Studio | 150-char chapter title in source tray | Title wraps cleanly up to 2 lines with title tooltip, URL truncates with ellipsis | URL hover shows full link |

</frozen-after-approval>

## Code Map

- `packages/web/client/src/views/QuestionExplorer.svelte` -- Add responsive text wrapping, flexible grid columns, and quote expansion controls.
- `packages/web/client/src/components/DocumentPreviewModal.svelte` -- Add horizontal scroll containers for preformatted code and tables, with responsive modal bounds.
- `packages/web/client/src/components/CardEditorDrawer.svelte` -- Apply responsive max-width rules and mobile padding adjustments.
- `packages/web/client/src/components/TaskCenterDrawer.svelte` -- Apply responsive max-width rules and mobile padding adjustments.
- `packages/web/client/src/components/SourceDocumentInspector.svelte` -- Apply responsive max-width rules and mobile padding adjustments.
- `packages/web/client/src/views/GenerateStudio.svelte` -- Constrain document rows and metadata elements to prevent horizontal spill.
- `packages/web/test/client-stores.test.ts` / server tests -- Add regression tests for text overflow and responsive styles.
- `docs/ARCHITECTURE.md` -- Document responsive design patterns and text overflow invariants.

## Tasks & Acceptance

**Execution:**
- [x] `packages/web/client/src/views/QuestionExplorer.svelte` -- Update card grid and typography styling with `overflow-wrap: break-word`, `min-width: 0`, and quote expansion.
- [x] `packages/web/client/src/components/DocumentPreviewModal.svelte` -- Add horizontal scroll containers for `<pre>` and `<table>`, responsive padding.
- [x] `packages/web/client/src/components/CardEditorDrawer.svelte`, `TaskCenterDrawer.svelte`, `SourceDocumentInspector.svelte` -- Apply responsive max-widths and mobile media queries.
- [x] `packages/web/client/src/views/GenerateStudio.svelte` -- Update document trays with `min-width: 0` and bounded URL items.
- [x] `packages/web/test/client-stores.test.ts` -- Add unit tests asserting responsive layout rules and text wrapping behavior.
- [x] `docs/ARCHITECTURE.md` -- Document responsive layout and text overflow hardening standards.

**Acceptance Criteria:**
- Extremely long questions, answers, code tokens, and verbatim quotes in Question Explorer wrap cleanly without clipping or text loss.
- Preformatted code blocks and tables in the Document Preview modal scroll horizontally without expanding the modal beyond viewport width.
- Slide-over drawers scale smoothly on window resize without causing horizontal viewport scrollbars on the main dashboard.
- Generate Studio document rows fit comfortably across desktop and laptop display widths without horizontal spill.
- Full monorepo verification passes (`npm test`, `npm run typecheck`, `npm run build`).
