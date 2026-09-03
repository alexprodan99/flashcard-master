# Story 9.3: Svelte 5 Data Sources Dashboard & Document Inspector UI

**Epic:** Epic 9 - Data Sources Dashboard & Document Catalog Inspector  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a learner managing data sources in the Web UI,**  
> I want to click "Inspect Documents 📖" on any data source to see all discovered articles, word counts, and card counts in a slide-over inspector,  
> **So that I can explore exactly what learning material is inside each source.**

---

## 2. Technical Scope & Architecture

### Web Client Components
1. **Types & API Client (`packages/web/client/src/lib/types.ts`, `packages/web/client/src/lib/api.ts`):**
   - Added `DiscoveredDocument` interface.
   - Added `fetchSourceDocuments(sourceId, search)` and `fetchDocumentDetails(id)` API methods.
2. **Document Inspector Component (`packages/web/client/src/components/SourceDocumentInspector.svelte`):**
   - Slide-over drawer with dark-theme styling matching design system.
   - Source summary header (Name, Type badge, Total Documents, Total Cards Generated).
   - Search filter input for document titles.
   - List of discovered articles with metadata pills (Word count, Created date, Source URL link, Card count).
3. **Sources View Integration (`packages/web/client/src/views/SourcesView.svelte`):**
   - Added "Inspect Documents 📖" action button on every source card.
   - Real-time refresh when syncing sources.

---

## 3. Acceptance Criteria

- [x] **AC1 — Client Types & API Integration:**
  - `fetchSourceDocuments` successfully communicates with backend API.
- [x] **AC2 — Source Document Inspector Drawer:**
  - Clicking "Inspect Documents" opens the drawer with live articles, search filter, word counts, and card counts.
- [x] **AC3 — Direct Provenance Links:**
  - Web/RSS/Sitemap document cards render clickable external links to original source URLs.
- [x] **AC4 — Build & Test Validation:**
  - Clean Vite client compilation and passing test suite.
