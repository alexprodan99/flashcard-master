# Story 7.2: LLMs.txt & Markdown Catalog Ingestion Strategy

**Epic:** Epic 7 - XML Sitemap & LLMs.txt Multi-Article Ingestion Engine  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a learner using Flashcard Master,**  
> I want to register an `/llms.txt` or `/llms-full.txt` catalog URL (e.g. `https://example.com/llms-full.txt`) as an ingestion source,  
> **So that Flashcard Master parses all cataloged articles, automatically applies section topics as deck tags, extracts clean reader-mode text in parallel, and keeps my flashcard knowledge base synchronized.**

---

## 2. Technical Scope & Architecture

### Adapters Implementation
1. **`LlmsTxtIngestionStrategy` in `packages/adapters/src/ingestion/llms-txt-strategy.ts`:**
   - Implements `IngestionStrategy` (`type = "llms-txt"`).
   - Fetches and parses `/llms.txt` and `/llms-full.txt` Markdown specifications.
   - Extracts:
     - Section headers (`## Topic Name`) mapped into normalized tags (e.g. `architecture`, `ef-core`, `api-design`).
     - Markdown links (`- [Article Title](url): Description`).
   - Concurrently fetches each target article in reader mode (using Readability parser) with batch concurrency limiting (e.g. 5 concurrent requests).
   - Generates unique `RawDocument` and `CleanTextDocument` entries with SHA-256 content hashes.
2. **Strategy Registration:**
   - Export from `packages/adapters/src/index.ts`.
   - Register in `StrategyRegistry` in `packages/cli/src/app.ts`.
3. **Automated Unit Tests:**
   - `packages/adapters/test/llms-txt-strategy.test.ts` verifying markdown link extraction, topic categorization, and network fault tolerance.

---

## 3. Acceptance Criteria

- [x] **AC1 — Markdown Catalog Parsing:**
  - Given an `llms-txt` source URI (e.g. `https://example.com/llms.txt` or `llms-full.txt`)
  - When `strategy.fetch(source)` is executed
  - Then all section topic headers and article URLs are extracted with title and description metadata.
- [x] **AC2 — Reader-Mode Extraction & Tagging:**
  - Given discovered catalog URLs
  - When scraping article contents
  - Then clean reader-mode text is extracted with SHA-256 hashes, and section topics are preserved.
- [x] **AC3 — Incremental Delta Synchronization:**
  - Given a previously synced `llms-txt` source
  - When syncing again
  - Then unchanged articles are skipped using delta hash tracking.
- [x] **AC4 — Strategy Registration & Unit Tests:**
  - Given `StrategyRegistry`
  - When `LlmsTxtIngestionStrategy` is registered
  - Then unit tests pass with 100% success.
