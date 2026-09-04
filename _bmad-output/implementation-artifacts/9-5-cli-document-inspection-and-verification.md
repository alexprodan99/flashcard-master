# Story 9.5: CLI Document Inspection Subcommand & Test Suite Verification

**Epic:** Epic 9 - Data Sources Dashboard & Document Catalog Inspector  
**Status:** done  
**Date:** 2026-09-03  

---

## 1. Story Overview

### User Story
> **As a developer or power user using the command line,**  
> I want to inspect discovered documents using `flashcard-master sources docs <source-id>` with optional title searching and JSON output,  
> **So that I can verify ingestion pipelines, word counts, and card counts without opening a web browser.**

---

## 2. Technical Scope & Architecture

### CLI Commands (`packages/cli/src/cli.ts`)
1. **Subcommand Registration:**
   - Added `flashcard-master sources docs <sourceId>`.
   - Supported options: `-s, --search <query>`, `--json`.
2. **Output Format:**
   - Displays article title, ID, origin URL, word count, and generated flashcard count.
   - Outputs formatted JSON with `--json` for machine pipelines.
3. **Automated Unit Tests (`packages/cli/test/cli.test.ts`):**
   - Verified human-readable and JSON document listing and card count aggregation.

---

## 3. Acceptance Criteria

- [x] **AC1 — CLI Document Listing:**
  - `flashcard-master sources docs <sourceId>` prints discovered documents with title, ID, URL, word count, and generated card counts.
- [x] **AC2 — JSON Output Flag:**
  - `flashcard-master sources docs <sourceId> --json` outputs valid JSON array of documents.
- [x] **AC3 — Full Regression Test Suite Pass:**
  - 100% test pass across monorepo packages (`core`, `adapters`, `cli`, `web`).
