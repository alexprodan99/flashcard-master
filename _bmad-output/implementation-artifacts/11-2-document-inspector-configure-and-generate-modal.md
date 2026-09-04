# Story 11.2: Document Inspector In-Context Configuration Modal

**Epic:** Epic 11 - Hierarchical Document Selection & Precision Generation Studio Tuning  
**Status:** done  
**Date:** 2026-09-04  

---

## 1. Story Overview

### User Story
> **As a learner inspecting documents in the Data Sources view,**  
> I want to click "⚡ Generate Cards" on any article to open a complete, focused configuration modal,  
> **So that I can customize the AI provider, model, persona, depth mode, and chunk sizing before generating flashcards for that specific article.**

---

## 2. Technical Scope & Architecture

### Web Client Components
1. **Source Document Inspector (`packages/web/client/src/components/SourceDocumentInspector.svelte`):**
   - Added `SynthesizeConfigModal` powered by `<GenerationConfigFields compact={true} />`.
   - Wired shared `<DocumentPreviewModal />` for text inspection with direct transition to synthesis.
   - Refreshes document card count badge in real time upon generation completion.

---

## 3. Acceptance Criteria

- [x] **AC1 — Full Configuration Modal on Generate:**
  - Clicking "⚡ Generate Cards" on any document opens the configuration modal with all 5 settings sections pre-populated.
- [x] **AC2 — Preview to Synthesis Transition:**
  - Clicking "⚡ Configure & Synthesize" from the text preview reader seamlessly opens the configuration modal for that document.
- [x] **AC3 — Real-Time Generation Feedback & Count Refresh:**
  - Shows live spinner feedback during synthesis and updates the document's card count immediately upon success.
- [x] **AC4 — Build & Test Validation:**
  - Full client build and tests pass without errors.
