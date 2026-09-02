# Story 7.4: Svelte 5 Web UI Integration & E2E Validation

**Epic:** Epic 7 - XML Sitemap & LLMs.txt Multi-Article Ingestion Engine  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a learner using the Flashcard Master Web UI,**  
> I want to select `🗺️ XML Sitemap` or `📜 LLMs.txt Catalog` when adding new ingestion sources,  
> **So that I can configure, monitor, and synchronize complete multi-article blogs with visual badge indicators, intuitive placeholders, and live feedback directly in my browser.**

---

## 2. Technical Scope & Architecture

### Web Client & Server Updates
1. **`AddSourceModal.svelte` (`packages/web/client/src/components/AddSourceModal.svelte`):**
   - Added responsive 5-option source type grid (`📡 RSS`, `🌐 Web`, `📁 Local`, `🗺️ Sitemap`, `📜 LLMs.txt`).
   - Dynamic label and placeholder hints for sitemap and llms.txt formats.
2. **`SourcesView.svelte` & `GenerateStudio.svelte`:**
   - Visual colored type badges for `sitemap` (emerald green) and `llms-txt` (pink).
3. **End-to-End Validation:**
   - Server REST endpoints `POST /api/sources`, `POST /api/sync/:id`, and `POST /api/generate` support sitemap and llms.txt sources.
   - Comprehensive test suite in `packages/web/test/server.test.ts` verifying multi-article sitemap and llms.txt ingestion lifecycle.

---

## 3. Acceptance Criteria

- [x] **AC1 — UI Source Creation:**
  - Given the Add Ingestion Source modal
  - When user selects "🗺️ Sitemap" or "📜 LLMs.txt"
  - Then the form adapts placeholders and successfully creates the source via `POST /api/sources`.
- [x] **AC2 — Source Badging & List View:**
  - Given registered sitemap and llms-txt sources
  - When rendered in Sources Manager and Generate Studio
  - Then appropriate type badges (`sitemap`, `llms-txt`) render cleanly.
- [x] **AC3 — Web Server API Tests:**
  - All test suites in `packages/web/test/server.test.ts` pass with 100% success.
