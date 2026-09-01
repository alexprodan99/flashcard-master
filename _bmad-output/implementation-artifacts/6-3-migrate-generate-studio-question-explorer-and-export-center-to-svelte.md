# Story 6.3: Migrate Generate Studio, Question Explorer, and Export & Anki Center to Svelte 5

**Epic:** Epic 6 - Modern UI Migration to Svelte 5 & Component Architecture  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a learner using Flashcard Master,**  
> I want the AI Generate Studio, Question Explorer with Card Editor Drawer, and Export & Anki Center migrated to reactive Svelte 5 components,  
> **So that I can synthesize flashcards, curate knowledge, and export decks with instantaneous reactivity, live previews, and zero page reloads.**

---

## 2. Technical Scope & Architecture

### Components Implemented
```text
packages/web/client/src/
├── components/
│   └── CardEditorDrawer.svelte         # Slide-over card editor with optimistic updates
└── views/
    ├── GenerateStudio.svelte           # Multi-source AI card synthesizer with live execution feedback
    ├── QuestionExplorer.svelte         # Search bar, filter chips, and interactive card grid
    └── ExportCenter.svelte             # 1-click export format downloads and AnkiConnect push
```

---

## 3. Acceptance Criteria

- [x] **AC1 — Generate Studio Svelte Component:**
  - **Given** Generate Studio view
  - **When** user selects sources, provider, model, persona, difficulty and clicks "Start AI Generation"
  - **Then** `POST /api/generate` is triggered with reactive spinner and execution results banner displaying new card previews.
- [x] **AC2 — Question Explorer & Card Editor Drawer:**
  - **Given** Question Explorer view
  - **When** user searches or filters by deck/difficulty/tag
  - **Then** card grid filters reactively; clicking "Edit" opens `CardEditorDrawer.svelte` to modify question/answer/tags and save via `PUT /api/cards/:id`.
- [x] **AC3 — Export & Anki Center:**
  - **Given** Export & Anki Center view
  - **When** user checks Anki status or clicks `.apkg` / `Markdown` / `PDF` / `AnkiConnect`
  - **Then** 1-click download triggers with selected deck filters.