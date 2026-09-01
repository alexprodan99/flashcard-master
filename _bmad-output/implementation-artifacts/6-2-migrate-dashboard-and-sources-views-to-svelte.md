# Story 6.2: Migrate Dashboard & Data Sources Views to Svelte 5

**Epic:** Epic 6 - Modern UI Migration to Svelte 5 & Component Architecture  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a learner using Flashcard Master,**  
> I want the Web UI Root layout, Sidebar Navigation, Dashboard KPI overview, and Data Sources Manager rewritten as reactive Svelte 5 single-file components,  
> **So that the UI updates reactively when data sources are added, synced, or toggled without manual DOM query scripting.**

---

## 2. Technical Scope & Architecture

### Components Implemented
```text
packages/web/client/src/
├── App.svelte                          # Main shell with sidebar navigation and active view switcher
├── lib/
│   ├── api.ts                          # Type-safe API client for /api/* endpoints
│   └── types.ts                        # Shared frontend interfaces
├── components/
│   ├── Navigation.svelte               # 5-stage sidebar navigation
│   └── AddSourceModal.svelte           # Modal dialog to register new data source
└── views/
    ├── DashboardView.svelte            # KPI metrics and quick actions
    └── SourcesView.svelte              # Sources table, active toggle, and sync triggers
```

---

## 3. Acceptance Criteria

- [x] **AC1 — Sidebar Navigation & Active Tab Routing:**
  - **Given** Svelte App shell
  - **When** user clicks navigation tabs or presses keyboard shortcuts (`1`..`5` or `s`/`g`/`e`)
  - **Then** the view switches reactively and updates active tab state.
- [x] **AC2 — Dashboard View & KPI Counters:**
  - **Given** Dashboard tab
  - **When** `DashboardView.svelte` mounts
  - **Then** it fetches `GET /api/stats` and displays Total Cards, Active Sources, Decks, and recent sources list.
- [x] **AC3 — Data Sources Manager & Add Modal:**
  - **Given** Data Sources tab
  - **When** user adds a new source via `AddSourceModal` or clicks `Sync Now`
  - **Then** `POST /api/sources` / `POST /api/sync` execute with reactive spinner, and sources table updates instantly without page reload.