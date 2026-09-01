# Story 7.3: CLI Subcommand & Interactive Wizard Support

**Epic:** Epic 7 - XML Sitemap & LLMs.txt Multi-Article Ingestion Engine  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a CLI terminal user of Flashcard Master,**  
> I want to register and manage `sitemap` and `llms-txt` data sources using `flashcard-master sources add` and the interactive `flashcard-master init` setup wizard,  
> **So that I can automate large-scale multi-article ingestion headlessly from my command line.**

---

## 2. Technical Scope & Architecture

### CLI Updates (`packages/cli/src/cli.ts`)
1. **`sources add` Subcommand:**
   - Allow `sitemap` and `llms-txt` as valid `type` arguments alongside `rss`, `web`, `local`.
2. **`init` Interactive Onboarding Wizard:**
   - Update prompt choices to list `(rss, web, local, sitemap, llms-txt)`.
   - Validate and persist selected source type.
3. **Automated CLI Tests:**
   - Update `packages/cli/test/cli.test.ts` to test adding and listing `sitemap` and `llms-txt` sources.

---

## 3. Acceptance Criteria

- [x] **AC1 — `sources add` Validation:**
  - Given CLI invocation `flashcard-master sources add "Milan Sitemap" sitemap "https://milanjovanovic.tech/sitemap-0.xml"`
  - When executed
  - Then the source is successfully created and persisted with type `sitemap`.
- [x] **AC2 — `init` Wizard Support:**
  - Given `flashcard-master init` interactive prompt
  - When user chooses `sitemap` or `llms-txt`
  - Then the data source is created with the chosen type.
- [x] **AC3 — Unit & E2E CLI Tests:**
  - All test suites in `packages/cli/test/cli.test.ts` pass with 100% success.
