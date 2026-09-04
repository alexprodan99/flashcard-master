# Story 11.3: Hierarchical Scope Selector with Lazy-Loaded Accordions & Search

**Epic:** Epic 11 - Hierarchical Document Selection & Precision Generation Studio Tuning  
**Status:** done  
**Date:** 2026-09-04  

---

## 1. Story Overview

### User Story
> **As a learner synthesizing flashcards in Generate Studio,**  
> I want an expandable hierarchical scope selector where I can expand data sources to select/deselect specific articles, search within sources, and preview text inline,  
> **So that I have surgical control over which exact documents the AI processes.**

---

## 2. Technical Scope & Architecture

### Web Client Components (`packages/web/client/src/views/GenerateStudio.svelte`)
1. **Hierarchical Scope Accordion:**
   - Tri-state parent checkboxes for data sources.
   - Lazy-loading of discovered documents via `fetchSourceDocuments(source.id)` when accordion is expanded.
   - In-accordion search filter for fast document discovery.
   - Inline `👁️ Preview` action opening `<DocumentPreviewModal>`.
2. **Payload Resolution:**
   - If specific `documentIds` are selected, `POST /api/generate` is dispatched with `documentIds`.
   - If whole sources are selected, passes all matching document IDs or `sourceIds`.
3. **Form Refactor with Shared Components:**
   - Utilizes `<GenerationConfigFields>` for consistent parameter tuning across the app.

---

## 3. Acceptance Criteria

- [x] **AC1 — Hierarchical Scope Tree:**
  - Data sources can be expanded to reveal discovered articles with individual checkboxes and word count badges.
- [x] **AC2 — Lazy-Loading & Search:**
  - Documents are lazy-loaded upon accordion expand and can be filtered via search input.
- [x] **AC3 — Inline Text Preview in Studio:**
  - Clicking `👁️ Preview` on any document opens the `<DocumentPreviewModal>` directly in Generate Studio.
- [x] **AC4 — Build & Test Validation:**
  - Full client build passes with zero errors.
