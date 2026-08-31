# Story 5.3: Navigation Hierarchy Alignment with Progressive Learning Pipeline

**Epic:** Epic 5 - Interactive Web Generation Studio & In-Browser AI Workflows  
**Status:** in-progress  
**Date:** 2026-08-31  

---

## 1. Story Overview

### User Story
> **As a learner navigating the Flashcard Master Web UI,**  
> I want the sidebar navigation tabs to strictly follow the chronological 5-stage learning workflow:  
> **1. Dashboard 📊 $\rightarrow$ 2. Data Sources 🌐 $\rightarrow$ 3. Generate Studio ⚡ $\rightarrow$ 4. Question Explorer 🗂️ $\rightarrow$ 5. Export Center 🚀**,  
> **So that I am naturally guided from defining and ingesting materials to AI card synthesis, knowledge curation/practice, and external delivery.**

---

## 2. Technical Scope & Architecture

### Sidebar Navigation Order
Reorder navigation items in `packages/web/src/server.ts`:
1. `📊 Dashboard` (`#nav-dashboard`)
2. `🌐 Data Sources` (`#nav-sources`)
3. `⚡ Generate Studio` (`#nav-generate`)
4. `🗂️ Question Explorer` (`#nav-cards`)
5. `🚀 Export Center` (`#nav-export`)

### View Container Order
Ensure corresponding view `div` containers in `packages/web/src/server.ts` follow the identical logical structure:
- `#view-dashboard`
- `#view-sources`
- `#view-generate`
- `#view-cards`
- `#view-export`

---

## 3. Acceptance Criteria

- [ ] **AC1 — Sidebar Navigation Order:**
  - **Given** the Web UI SPA is loaded
  - **When** inspecting `#sidebar` navigation buttons
  - **Then** the visual and DOM order is Dashboard $\rightarrow$ Data Sources $\rightarrow$ Generate Studio $\rightarrow$ Question Explorer $\rightarrow$ Export Center.
- [ ] **AC2 — View Switching & Event Wiring:**
  - **Given** any navigation button is clicked
  - **When** `switchTab(...)` executes
  - **Then** the target view is displayed, its corresponding data loader runs (`loadSources()`, `loadGenerateSources()`, `loadCards()`, `loadExportData()`), and the active nav class updates.
- [ ] **AC3 — Integration Test Verification:**
  - **Given** `packages/web/test/server.test.ts`
  - **When** `npm test` runs
  - **Then** tests verify the exact 5-stage navigation order in the rendered HTML output.
