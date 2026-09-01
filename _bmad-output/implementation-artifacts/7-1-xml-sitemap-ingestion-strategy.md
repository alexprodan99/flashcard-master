# Story 7.1: XML Sitemap Ingestion Strategy & Domain Types

**Epic:** Epic 7 - XML Sitemap & LLMs.txt Multi-Article Ingestion Engine  
**Status:** ready-for-dev  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a learner using Flashcard Master,**  
> I want to register an XML Sitemap (e.g. `https://milanjovanovic.tech/sitemap-0.xml` or `https://milanjovanovic.tech/sitemap-index.xml`) as an ingestion source,  
> **So that Flashcard Master recursively discovers all canonical article URLs, extracts clean reader-mode text in parallel, and enables synthesizing flashcards across entire publication archives.**

---

## 2. Technical Scope & Architecture

### Domain & Storage Updates
1. **`DataSource.type` in `packages/core/src/domain/models.ts`:**
   - Extend `SourceType` union: `type SourceType = "rss" | "web" | "local" | "sitemap" | "llms-txt";`
2. **Schema Invariant in `packages/core/src/storage/db.ts`:**
   - Update `CHECK(type IN ('rss', 'web', 'local', 'sitemap', 'llms-txt'))` constraint in SQLite table definition.

### Adapters Implementation
1. **`SitemapIngestionStrategy` in `packages/adapters/src/ingestion/sitemap-strategy.ts`:**
   - Implements `IngestionStrategy` (`type = "sitemap"`).
   - Uses `fast-xml-parser` to parse XML documents.
   - Detects and handles:
     - **`<sitemapindex>`:** Recursively fetches nested `<sitemap><loc>` children.
     - **`<urlset>`:** Extracts all `<url><loc>` canonical article endpoints.
   - Supports URL path/pattern matching (filtering out non-article pages like tags, categories, or homepages).
   - Concurrently fetches web article URLs in reader mode (using Readability parser) with batch concurrency limiting (e.g. chunks of 5 concurrent requests) to avoid overwhelming target servers.
   - Generates unique `RawDocument` and `CleanTextDocument` entries with SHA-256 content hashes.

---

## 3. Acceptance Criteria

- [ ] **AC1 — XML Sitemap Parsing:**
  - Given a sitemap URL (`<urlset>` format or `<sitemapindex>` format)
  - When `strategy.fetch(source)` is executed
  - Then all nested article URLs are discovered and resolved into absolute URLs.
- [ ] **AC2 — Reader-Mode Extraction & Concurrency:**
  - Given discovered article URLs
  - When scraping article contents
  - Then reader-mode clean text is extracted (boilerplate stripped) with SHA-256 content hashes generated.
  - And requests execute with concurrency limits preventing socket exhaustion.
- [ ] **AC3 — Incremental Delta Synchronization:**
  - Given a previously synced sitemap source
  - When syncing again
  - Then only new/modified URLs are processed, skipping already ingested pages.
- [ ] **AC4 — Strategy Registration & Unit Tests:**
  - Given `StrategyRegistry` in core
  - When `SitemapIngestionStrategy` is registered
  - Then unit tests in `packages/adapters/test/sitemap-strategy.test.ts` pass with 100% success.
