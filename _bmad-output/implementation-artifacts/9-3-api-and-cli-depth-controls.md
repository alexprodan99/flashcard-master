# Story 9.3: Backend REST API & CLI Support for Depth & Chunk Multipliers

**Epic:** Epic 9 - Configurable Question Depth, Granularity & Context Chunk Sizing  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a developer or automation engineer generating flashcards,**  
> I want to pass depth mode and chunk multiplier settings via REST API and CLI flags,  
> **So that I can synthesize calibrated study decks programmatically and from the terminal.**

---

## 2. Technical Scope & Architecture

### Web Server & CLI Updates
1. **Server Endpoint (`packages/web/src/server.ts`):**
   - Updated `POST /api/generate` to accept `depthMode?: CardDepthMode` and `chunkMultiplier?: number`.
   - Passed `depthMode` and `chunkOptions: { chunkMultiplier, fullDocument }` to `cardGenService.generateFromDocument()`.
2. **CLI Command (`packages/cli/src/cli.ts`):**
   - Added `-D, --depth <mode>` option (`atomic`, `deep-dive`, `scenario`).
   - Added `-M, --chunk-multiplier <number>` option (e.g. `1`, `2`, `3`, `5`, `0`).
3. **Automated Unit Tests (`packages/web/test/server.test.ts`):**
   - Added test case for `POST /api/generate` with `depthMode = 'deep-dive'` and `chunkMultiplier = 2`.

---

## 3. Acceptance Criteria

- [x] **AC1 — REST API Parameter Handling:**
  - `POST /api/generate` accepts `depthMode` and `chunkMultiplier` and passes them to the generation service.
- [x] **AC2 — CLI Flags:**
  - `flashcard-master generate --depth deep-dive --chunk-multiplier 2` executes successfully.
- [x] **AC3 — Unit Tests Pass:**
  - All web server and CLI tests pass with 100% success.
