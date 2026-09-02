# Story 8.5: Question Explorer Bulk Deletion & Multi-Selection

**Epic:** Epic 8 - LLM Prompt Tuning, Adaptive Backfilling, PDF Export & Explorer Bulk Operations  
**Status:** done  
**Date:** 2026-09-02  

---

## 1. Story Overview

### User Story
> **As a learner curating my flashcard deck,**  
> I want to select multiple cards (or all filtered cards) using checkboxes and delete them with a single click,  
> **So that I can clean up unwanted, redundant, or outdated cards rapidly without deleting them one by one.**

---

## 2. Technical Scope & Architecture

### Backend & API Updates
1. **Server Endpoint (`packages/web/src/server.ts`):**
   - Implemented `POST /api/cards/bulk`, `DELETE /api/cards/bulk`, and `DELETE /api/cards` with `{ ids: string[] }`.
   - Executes `cardRepo.deleteMany(ids)` atomically.
2. **Client API (`packages/web/client/src/lib/api.ts`):**
   - Added `deleteCardsBulk(ids)`.
3. **UI Implementation (`packages/web/client/src/views/QuestionExplorer.svelte`):**
   - Added multi-card selection checkboxes with master "Select All Filtered" / "Deselect Filtered" toggle.
   - Added sticky bulk-action bar and confirmation modal before deleting.
4. **Automated Unit Tests:**
   - Added test in `packages/web/test/server.test.ts`.

---

## 3. Acceptance Criteria

- [x] **AC1 — Backend Bulk Delete API:**
  - Given `DELETE /api/cards/bulk` or `POST /api/cards/bulk` with a list of IDs
  - When invoked
  - Then all specified cards are removed from SQLite and `deletedCount` is returned.
- [x] **AC2 — UI Multi-Selection & Bulk Deletion:**
  - Given the Question Explorer view
  - When user selects multiple cards and clicks "Delete Selected"
  - Then a confirmation prompt appears and upon confirming, the cards are deleted and UI refreshed.
- [x] **AC3 — Unit Tests Pass:**
  - All web server and client tests pass with 100% success.
