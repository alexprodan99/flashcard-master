# Story 11.5: End-to-End Verification & Automated Regression Tests

**Epic:** Epic 11 - Hierarchical Document Selection & Precision Generation Studio Tuning  
**Status:** done  
**Date:** 2026-09-04  

---

## 1. Story Overview

### User Story
> **As a project maintainer,**  
> I want comprehensive automated regression tests and E2E verification across all packages,  
> **So that hierarchical document selection, deep-linking, and targeted multi-document generation are verifiably robust.**

---

## 2. Technical Scope & Architecture

### Test Suites
1. **Server Multi-Document Targeted Generation (`packages/web/test/server.test.ts`):**
   - Verified `POST /api/generate` with multiple `documentIds` generating grounded cards across articles in parallel.
   - Verified `GET /api/sources/:id/documents?search=...` filtering.
2. **Monorepo Build & Test Pipeline:**
   - 27 test files, 134 unit and integration tests passed across `@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/cli`, and `@flashcard-master/web`.

---

## 3. Acceptance Criteria

- [x] **AC1 — Multi-Document Targeted Synthesis Tests:**
  - Automated tests confirm targeted multi-document ID array requests produce cards with matching material references.
- [x] **AC2 — Document Search Query Tests:**
  - Automated tests confirm searching documents by title/topic properly filters results.
- [x] **AC3 — Full Monorepo Build & Suite Pass:**
  - 100% test pass rate across all 4 workspaces.
