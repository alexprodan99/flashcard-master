# Story 5.2: Multi-Source Scope Selector UI in Generation Studio

**Epic:** Epic 5 - Interactive Web Generation Studio & In-Browser AI Workflows  
**Status:** in-progress  
**Date:** 2026-08-31  

---

## 1. Story Overview

### User Story
> **As a learner using the Web UI Generation Studio,**  
> I want an interactive multi-source selection panel with individual source checkboxes, type badges, and a "Select All / Deselect All" toggle,  
> **So that I can choose any subset of ingested data sources to synthesize flashcards from in a single batch generation run.**

---

## 2. Technical Scope & Architecture

### Frontend Web UI Component
- Replace single `<select id="gen-source-select">` with a dedicated multi-select component:
  - Header with **"6. Ingested Sources Scope"** and a dynamic counter badge `[ X / Y Selected ]`.
  - A quick action button: `[ ⚡ Select All / Deselect All ]`.
  - A styled, scrollable checkbox list (`#gen-sources-checkbox-list`):
    - Each item displays: `[x] <Source Name>` with `<Type Badge>` (`rss`, `web`, `local`) and target deck info.
- Client JavaScript:
  - `loadGenerateSources()`: Renders active source checkboxes (all checked by default).
  - `toggleAllGenerateSources()`: Checks/unchecks all sources with one click.
  - `updateSelectedSourcesCount()`: Updates the counter badge dynamically as checkboxes are clicked.
  - `handleGenerateStudioSubmit()`: Collects all checked source IDs into `sourceIds: string[]` and validates that at least 1 source is selected before posting to `/api/generate`.

---

## 3. Acceptance Criteria

- [ ] **AC1 — Multi-Source Checkbox Container:** Interactive checkbox list showing active sources with type badges and target decks.
- [ ] **AC2 — Master Toggle & Count Badge:** "Select All / Deselect All" master button and dynamic count badge `[ X / Y Selected ]`.
- [ ] **AC3 — Multi-Source Request Serialization:** Submitting generation sends `sourceIds: string[]` to `POST /api/generate`.
- [ ] **AC4 — Empty Selection Guard:** Display error alert if generation is submitted with 0 sources selected.
- [ ] **AC5 — Automated Integration Tests:** Integration tests in `packages/web/test/server.test.ts` verifying multi-source payload and HTML elements.
