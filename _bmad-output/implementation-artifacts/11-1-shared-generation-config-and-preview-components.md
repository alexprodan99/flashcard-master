# Story 11.1: Shared Generation Configuration & Document Preview Components

**Epic:** Epic 11 - Hierarchical Document Selection & Precision Generation Studio Tuning  
**Status:** done  
**Date:** 2026-09-04  

---

## 1. Story Overview

### User Story
> **As a developer and UI maintainer,**  
> I want to extract `<GenerationConfigFields.svelte>` and `<DocumentPreviewModal.svelte>` into reusable Svelte 5 components with `localStorage` settings persistence,  
> **So that both the AI Generate Studio and Document Inspector share identical, feature-complete calibration controls and clean text reading capabilities.**

---

## 2. Technical Scope & Architecture

### Web Client Components
1. **Document Preview Modal (`packages/web/client/src/components/DocumentPreviewModal.svelte`):**
   - Monospace clean text reader modal with word count, origin link, close action, and direct synthesis triggers.
2. **Generation Configuration Fields (`packages/web/client/src/components/GenerationConfigFields.svelte`):**
   - Encapsulates:
     - AI Provider & Model (Ollama, Gemini, OpenAI, Claude presets and custom text overrides).
     - Learning Persona & Cognitive Difficulty calibration.
     - Question Depth Modes (`Atomic`, `Deep-Dive`, `Scenario`).
     - Document Context Scope (`1x`, `2x`, `4x`, `Full Document`).
     - Target Deck, Cards Per Chunk Quota, and Verbatim Grounding Guard.
   - Saves preferences to `localStorage` (`fc_generation_settings`) on change.

---

## 3. Acceptance Criteria

- [x] **AC1 — Reusable Document Preview Modal:**
  - `<DocumentPreviewModal>` renders clean text, origin URL, word count, and emits close/synthesize events.
- [x] **AC2 — Unified Generation Configuration Fields:**
  - `<GenerationConfigFields>` encapsulates all 5 configuration sections with full two-way bindings.
- [x] **AC3 — LocalStorage Settings Persistence:**
  - Changes to provider, model, persona, depth mode, and context scope automatically persist in browser `localStorage`.
- [x] **AC4 — Build Validation:**
  - Vite client compilation passes with zero errors.
