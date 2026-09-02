# Story 8.3: Rich Document Provenance & Material Reference

**Epic:** Epic 8 - LLM Prompt Tuning, Adaptive Backfilling, PDF Export & Explorer Bulk Operations  
**Status:** done  
**Date:** 2026-09-02  

---

## 1. Story Overview

### User Story
> **As a learner reviewing flashcards,**  
> I want each flashcard to visibly reference its source material (Document Title, Origin URL, and Section Topic) alongside the verbatim quote,  
> **So that I can immediately navigate back to the exact source article or documentation for deeper study.**

---

## 2. Technical Scope & Architecture

### Domain, Storage & UI Updates
1. **Core Domain Models (`packages/core/src/domain/models.ts` & `packages/core/src/storage/card-repository.ts`):**
   - Added `documentTitle` to `FlashcardSchema`, `SCHEMA_SQL`, `runMigrations(db)`, and `FlashcardRepository`.
2. **Svelte UI Components:**
   - **`QuestionExplorer.svelte` (`packages/web/client/src/views/QuestionExplorer.svelte`):**
     - Rendered clickable material reference badges (`📖 {card.documentTitle || 'Source Link'} ↗` linking to `card.sourceOriginUrl`).
   - **`CardEditorDrawer.svelte` (`packages/web/client/src/components/CardEditorDrawer.svelte`):**
     - Displayed and enabled editing for `documentTitle` and `sourceOriginUrl`.
   - **Exporters (`packages/adapters/src/export/*.ts`):**
     - Included material references in Markdown and HTML study sheets.

---

## 3. Acceptance Criteria

- [x] **AC1 — UI Source Material Badges:**
  - Given flashcards with `sourceOriginUrl` and `documentTitle`
  - When viewed in Question Explorer or Card Editor Drawer
  - Then the title and link are rendered cleanly and navigate to the source URL.
- [x] **AC2 — Export Metadata Retention:**
  - Given exported Markdown or HTML study guides
  - When rendered
  - Then source material citations are embedded.
- [x] **AC3 — Unit Tests Pass:**
  - Exporter and repository test suites pass with 100% success.
