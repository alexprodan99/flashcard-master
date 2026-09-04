# Story 9.4: Document Clean Text Preview Drawer & Targeted Single-Article Card Generation

**Epic:** Epic 9 - Data Sources Dashboard & Document Catalog Inspector  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a learner exploring specific discovered articles,**  
> I want to preview the extracted clean text in a modal and trigger card generation targeting only that article with a single click,  
> **So that I can verify article contents and synthesize flashcards on-demand for specific topics.**

---

## 2. Technical Scope & Architecture

### Web Client Components
1. **Text Preview Reader Modal (`packages/web/client/src/components/SourceDocumentInspector.svelte`):**
   - Clean, formatted monospace reading modal displaying title, word count, and extracted clean text.
   - 1-click "Synthesize Flashcards from this Document" action button.
2. **Targeted Generation Workflow:**
   - Calls `POST /api/generate` with `{ documentIds: [doc.id] }`.
   - Real-time inline spinning state on document card during inference.
   - Dynamic update of document card counts upon generation completion.

---

## 3. Acceptance Criteria

- [x] **AC1 — Clean Text Reader Modal:**
  - Clicking "Preview Text" opens a clean reader modal showing the full extracted text and word count.
- [x] **AC2 — 1-Click Targeted Generation:**
  - Clicking "Generate Cards" or synthesizing from the preview modal targets only that document.
- [x] **AC3 — Live UI Feedback & Count Refresh:**
  - Real-time spinning state is displayed during generation and card counts refresh upon completion.
- [x] **AC4 — Build & Test Validation:**
  - All tests and builds pass 100% green.
