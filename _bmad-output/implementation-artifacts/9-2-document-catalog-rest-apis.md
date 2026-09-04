# Story 9.2: Document Catalog REST APIs & Clean Text Preview

**Epic:** Epic 9 - Data Sources Dashboard & Document Catalog Inspector  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a developer or client application,**  
> I want REST endpoints to list discovered documents for a data source, inspect full clean text, and generate cards from specific document IDs,  
> **So that the Web UI and CLI can power a rich inspection dashboard with per-document card generation.**

---

## 2. Technical Scope & Architecture

### Web Server Updates (`packages/web/src/server.ts`)
1. **Server Options & Dependencies:**
   - Injected `documentRepo?: DocumentRepository` in `WebServerOptions`.
2. **REST Endpoints:**
   - **`GET /api/sources/:id/documents`**: Returns discovered documents for source `:id` (with search and card count per document).
   - **`GET /api/documents/:id`**: Returns a single discovered document with full text content and word count.
   - **`POST /api/generate` Enhancement**: Accepts `documentIds?: string[]` in payload to generate flashcards exclusively from targeted documents stored in the database.
3. **Automated Unit & Integration Tests (`packages/web/test/server.test.ts`):**
   - Verified `GET /api/sources/:id/documents` with card count mapping.
   - Verified `GET /api/documents/:id`.
   - Verified `POST /api/generate` with `documentIds`.

---

## 3. Acceptance Criteria

- [x] **AC1 — List Documents by Source API:**
  - `GET /api/sources/:id/documents` returns list of articles with titles, URLs, word counts, and generated card counts.
- [x] **AC2 — Single Document Details API:**
  - `GET /api/documents/:id` returns the full text content and metadata for previewing.
- [x] **AC3 — Targeted Document Generation:**
  - `POST /api/generate` with `documentIds` synthesizes flashcards from specified stored documents.
- [x] **AC4 — Unit Tests Pass:**
  - All tests in `packages/web/test/server.test.ts` pass with 100% success.
