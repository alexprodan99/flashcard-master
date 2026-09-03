# Story 9.1: Question Depth & Granularity Prompt Engine

**Epic:** Epic 9 - Configurable Question Depth, Granularity & Context Chunk Sizing  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a learner studying complex technical architectures,**  
> I want to choose between Atomic quick recall, Deep Dive structural explanations, and Scenario-based case studies,  
> **So that my generated flashcards can test comprehensive mechanisms and tradeoffs instead of only single-sentence micro-facts.**

---

## 2. Technical Scope & Architecture

### Core Domain & Prompt Updates
1. **Domain Models (`packages/core/src/domain/models.ts`):**
   - Exported `CardDepthMode = "atomic" | "deep-dive" | "scenario"`.
2. **Prompt Builder (`packages/core/src/services/prompt-builder.ts`):**
   - Implemented `depthMode?: CardDepthMode` in `PromptConfig`.
   - **`atomic` (Default):** Atomicity rule, 1-2 sentence direct answer.
   - **`deep-dive`:** Comprehensive mechanism synthesis, structural breakdowns, trade-off comparisons, 3-6 sentence explanations.
   - **`scenario`:** Situation-based engineering problems, failure diagnosis, applied reasoning.
   - Preserved verbatim quote copy-paste directives across all modes.
3. **Automated Unit Tests (`packages/core/test/prompt-builder.test.ts`):**
   - Verified prompt construction for all 3 depth modes and ensured verbatim grounding instructions are preserved.

---

## 3. Acceptance Criteria

- [x] **AC1 — Depth Mode Type Definition:**
  - `CardDepthMode` is exported and validated.
- [x] **AC2 — Dynamic Prompt Rules by Depth Mode:**
  - Given `depthMode = 'deep-dive'`
  - When generation instructions are built
  - Then the prompt includes deep-dive mechanism rules and multi-step explanation guidance.
- [x] **AC3 — Grounding Invariant Preserved:**
  - Verbatim copy-paste quote requirements remain strictly present across all depth modes.
- [x] **AC4 — Unit Tests Pass:**
  - All prompt builder tests pass with 100% success.
