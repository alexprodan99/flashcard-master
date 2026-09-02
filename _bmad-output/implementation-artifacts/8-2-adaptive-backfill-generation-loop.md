# Story 8.2: Adaptive Generation Backfill Loop

**Epic:** Epic 8 - LLM Prompt Tuning, Adaptive Backfilling, PDF Export & Explorer Bulk Operations  
**Status:** done  
**Date:** 2026-09-02  

---

## 1. Story Overview

### User Story
> **As a learner generating flashcards from technical documents,**  
> I want the system to guarantee that if I configure $N$ questions per chunk (e.g. 4), I consistently receive $N$ valid questions even when grounding verification discards ungrounded drafts,  
> **So that my flashcard output matches my desired target density without missing coverage.**

---

## 2. Technical Scope & Architecture

### Core Domain Updates
1. **Oversampling & Retry Backfilling in `CardGenerationService` (`packages/core/src/services/card-generation-service.ts`):**
   - **Phase 1 (Oversampling):** Requests `targetCount + 2` candidate drafts in the initial call to absorb potential quote rejections in 1 turn.
   - **Phase 2 (Adaptive Backfill Retry Loop):** If `validDrafts.length < targetCount`, triggers a bounded retry loop (up to `MAX_BACKFILL_ATTEMPTS = 5`) requesting the exact remaining deficit on each turn with strict quote grounding rules until the quota is filled or max attempts are reached.
   - **Phase 3 (Target Cap):** Slices validated drafts to `targetCount` cards per chunk.
2. **Automated Unit Tests (`packages/core/test/card-generation-service.test.ts`):**
   - Added test `adaptively backfills discarded ungrounded cards to fulfill target count`.

---

## 3. Acceptance Criteria

- [x] **AC1 — Target Quota Fulfillment via Oversampling / Backfill:**
  - Given a document chunk with `targetCountPerChunk = 4`
  - When candidate drafts contain some ungrounded quotes
  - Then the service filters invalid quotes and fulfills the 4-card target.
- [x] **AC2 — Unit Tests Pass:**
  - All unit tests in `packages/core/test/card-generation-service.test.ts` pass with 100% success.
