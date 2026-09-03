# Story 9.2: Configurable Document Context Chunk Sizing & Full Document Scope

**Epic:** Epic 9 - Configurable Question Depth, Granularity & Context Chunk Sizing  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a learner synthesizing flashcards from long technical articles or book chapters,**  
> I want to configure the context chunk multiplier (1x, 2x, 3x, 5x, or Full Document),  
> **So that the LLM receives comprehensive cross-section context to synthesize macro-level architectural questions instead of localized snippets.**

---

## 2. Technical Scope & Architecture

### Core Domain & Service Updates
1. **Text Chunker (`packages/core/src/services/text-chunker.ts`):**
   - Accepted `chunkMultiplier?: number` and `fullDocument?: boolean` in `TextChunkerOptions`.
   - Scaled `maxChunkSize = baseChunkSize * chunkMultiplier`.
   - When `fullDocument: true` or `chunkMultiplier === 0`, returns whole text unchunked in single block.
2. **Card Generation Service (`packages/core/src/services/card-generation-service.ts`):**
   - Forwarded `depthMode` to `PromptBuilder` for initial and retry generation passes.
   - Forwarded `chunkOptions` (including `chunkMultiplier` and `fullDocument`) to `TextChunker`.
3. **Automated Unit Tests (`packages/core/test/text-chunker.test.ts`, `packages/core/test/card-generation-service.test.ts`):**
   - Verified multiplier scaling and full document unchunked behavior in `TextChunker`.
   - Verified `CardGenerationService` correctly passes depth mode and chunk options.

---

## 3. Acceptance Criteria

- [x] **AC1 — Configurable Chunk Multiplier:**
  - `TextChunker` scales chunk size by multiplier (e.g. 2x $\rightarrow$ 4,000 chars, 3x $\rightarrow$ 6,000 chars).
- [x] **AC2 — Full Document Scope:**
  - `fullDocument: true` or `chunkMultiplier = 0` produces a single unchunked document block.
- [x] **AC3 — Service Depth & Chunk Pass-Through:**
  - `CardGenerationService` correctly passes `depthMode`, `chunkMultiplier`, and `fullDocument`.
- [x] **AC4 — Unit Tests Pass:**
  - All tests in `packages/core/test/text-chunker.test.ts` and `card-generation-service.test.ts` pass with 100% success.
