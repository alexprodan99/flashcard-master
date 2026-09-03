# Story 9.1: Persistent Discovered Document Storage & Repository

**Epic:** Epic 9 - Data Sources Dashboard & Document Catalog Inspector  
**Status:** ready-for-dev  
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
   - Create `documents` table:
     ```sql
     CREATE TABLE IF NOT EXISTS documents (
         id TEXT PRIMARY KEY,
         source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
         title TEXT NOT NULL,
         url TEXT,
         text_content TEXT NOT NULL,
         content_hash TEXT,
         word_count INTEGER DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
         updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     );
     CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id);
     ```
2. **Domain Models (`packages/core/src/domain/models.ts`):**
   - Export `DiscoveredDocument` interface and `DiscoveredDocumentSchema`.
3. **Document Repository (`packages/core/src/storage/document-repository.ts`):**
   - Implement `DocumentRepository` port and class:
     - `upsert(doc: DiscoveredDocument): void`
     - `upsertBatch(docs: DiscoveredDocument[]): void`
     - `getById(id: string): DiscoveredDocument | null`
     - `listBySourceId(sourceId: string): DiscoveredDocument[]`
     - `getDocumentCount(sourceId?: string): number`
     - `deleteBySourceId(sourceId: string): void`
4. **Ingestion Service Update (`packages/core/src/services/ingestion-service.ts`):**
   - In `syncSource(sourceId)`, as each raw document is extracted into `CleanTextDocument`, construct a `DiscoveredDocument` and call `this.docRepo.upsert()`.
5. **Automated Unit Tests (`packages/core/test/document-repository.test.ts`, `packages/core/test/ingestion-service.test.ts`):**
   - Verify persistence, retrieval, cascade deletion, and sync ingestion.

---

## 3. Acceptance Criteria

- [ ] **AC1 — Schema Migration:**
  - `documents` table exists in SQLite database with appropriate indices and cascading foreign keys.
- [ ] **AC2 — Document Repository Operations:**
  - `DocumentRepository` supports upserting, batch upserting, querying by source ID, single ID lookups, and counting.
- [ ] **AC3 — Ingestion Service Persistence:**
  - Syncing any data source automatically stores extracted articles into `documents` table with computed word count.
- [ ] **AC4 — Unit Tests Pass:**
  - All tests in `packages/core/test/document-repository.test.ts` pass with 100% success.
