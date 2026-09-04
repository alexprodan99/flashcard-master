# Story 11.4: Bi-Directional Deep-Linking & Unsynced Source Quick-Sync

**Epic:** Epic 11 - Hierarchical Document Selection & Precision Generation Studio Tuning  
**Status:** done  
**Date:** 2026-09-04  

---

## 1. Story Overview

### User Story
> **As a learner moving between Data Sources and Generate Studio,**  
> I want URL query parameters (`?docId=...` and `?sourceId=...`) to preserve my targeted document selection across page refreshes and view switches, with an inline quick-sync trigger for unsynced sources,  
> **So that I can effortlessly transition from document inspection to full studio generation without losing context.**

---

## 2. Technical Scope & Architecture

### Web Client Routing & State
1. **App Level Routing (`packages/web/client/src/App.svelte`):**
   - Supports query parameters `?tab=...`, `?docId=...`, `?sourceId=...` on mount and tab transitions.
2. **Generate Studio Deep-Link Handler (`packages/web/client/src/views/GenerateStudio.svelte`):**
   - Reads `docId` on mount, auto-expands parent source accordion, fetches documents, checks the document ID, and computes the scope selection.
   - Provides inline "⚡ Sync Now" inside source trays with 0 documents.
3. **Sources Inspector Transition (`packages/web/client/src/views/SourcesView.svelte`):**
   - Passes `onOpenInStudio` handler navigating seamlessly to Generate Studio with `docId`.

---

## 3. Acceptance Criteria

- [x] **AC1 — Query Parameter Deep-Linking:**
  - Navigating to `/generate?docId=<id>` automatically expands parent source, pre-checks the target document, and sets active scope.
- [x] **AC2 — Unsynced Source Quick-Sync:**
  - Sources with 0 documents display an inline "⚡ Sync Now" button that ingests articles and auto-checks them upon completion.
- [x] **AC3 — Bi-Directional Transition:**
  - Clicking "Open in Studio ↗" in Document Inspector transitions directly to Generate Studio with document pre-selected.
- [x] **AC4 — Build & Test Validation:**
  - Client build and unit tests pass without regression.
