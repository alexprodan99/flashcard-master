# Story 9.4: Svelte 5 Generate Studio UI Controls & E2E Validation

**Epic:** Epic 9 - Configurable Question Depth, Granularity & Context Chunk Sizing  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a learner configuring card generation in the Web Studio,**  
> I want visual controls for Question Depth (Atomic, Deep Dive, Scenario) and Document Context Scope (1x, 2x, 3x, Full Article),  
> **So that I can easily customize the depth of synthesized flashcards with single clicks.**

---

## 2. Technical Scope & Architecture

### Web Client Updates
1. **Types (`packages/web/client/src/lib/types.ts`):**
   - Added `CardDepthMode = 'atomic' | 'deep-dive' | 'scenario'`.
   - Updated `GenerateCardsPayload` with `depthMode?: CardDepthMode` and `chunkMultiplier?: number`.
2. **Generate Studio UI (`packages/web/client/src/views/GenerateStudio.svelte`):**
   - Added reactive state: `depthMode` (default `'atomic'`) and `chunkMultiplier` (default `1`).
   - Added Section: **"4. Question Depth & Context Scope"**:
     - Depth Mode interactive card selector (`Atomic`, `Deep Dive`, `Scenario`).
     - Document Context Scope pills (`1x Standard (2k)`, `2x Macro (4k)`, `3x Deep (6k)`, `Full Article`).
   - Wired options into `handleGenerate()`.
3. **Automated Verification:**
   - Full build and test suite passing 100% green.

---

## 3. Acceptance Criteria

- [x] **AC1 — Client Types & API Payload:**
  - `GenerateCardsPayload` supports `depthMode` and `chunkMultiplier`.
- [x] **AC2 — UI Depth Mode & Context Scope Controls:**
  - Interactive radio cards for Atomic, Deep Dive, and Scenario modes in Generate Studio.
  - Interactive pill selectors for 1x, 2x, 3x, and Full Document context sizing.
- [x] **AC3 — End-to-End Generation:**
  - Synthesizing cards with Deep Dive or Scenario passes calibrated options to backend and generates rich cards.
- [x] **AC4 — Full Test Suite Passes:**
  - All test suites across all workspaces pass with 100% success.
