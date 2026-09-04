# Story 9.1: Persistent Discovered Document Storage & Repository

**Epic:** Epic 9 - Data Sources Dashboard & Document Catalog Inspector  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a learner exploring ingested knowledge sources,**  
> I want the system to persistently save every discovered article/document in a dedicated `documents` table in SQLite during sync cycles,  
> **So that I can inspect the document catalog, view word counts, preview text, and see how many flashcards were generated per article.**

---

## 2. Technical Scope & Architecture

### Core Domain & Storage Updates
1. **SQLite Database Schema Migration (`packages/core/src/storage/schema.sql`, `packages/core/src/storage/db.ts`):**
   - Created `documents` table with foreign key cascading deletion and `idx_documents_source_id` index.
2. **Domain Models (`packages/core/src/domain/models.ts`):**
   - Exported `DiscoveredDocument` and `DiscoveredDocumentSchema`.
3. **Document Repository (`packages/core/src/storage/document-repository.ts`):**
   - Implemented `DocumentRepository` with `upsert()`, `upsertBatch()`, `getById()`, `listBySourceId()`, `getDocumentCount()`, and `deleteById()`.
4. **Ingestion Service Update (`packages/core/src/services/ingestion-service.ts`):**
   - Updated `syncSource()` to compute word counts and upsert discovered documents via `DocumentRepository`.
5. **Automated Unit Tests (`packages/core/test/document-repository.test.ts`, `packages/core/test/ingestion-service.test.ts`):**
   - Verified persistence, retrieval, word counts, and cascading deletion.

---

## 3. Acceptance Criteria

- [x] **AC1 — Schema Migration:**
  - `documents` table exists in SQLite database with appropriate indices and cascading foreign keys.
- [x] **AC2 — Document Repository Operations:**
  - `DocumentRepository` supports upserting, batch upserting, querying by source ID, single ID lookups, and counting.
- [x] **AC3 — Ingestion Service Persistence:**
  - Syncing any data source automatically stores extracted articles into `documents` table with computed word count.
- [x] **AC4 — Unit Tests Pass:**
  - All tests in `packages/core/test/document-repository.test.ts` pass with 100% success.
