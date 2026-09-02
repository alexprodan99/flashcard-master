# Story 8.4: Printable PDF Export Support & Alias Routing

**Epic:** Epic 8 - LLM Prompt Tuning, Adaptive Backfilling, PDF Export & Explorer Bulk Operations  
**Status:** done  
**Date:** 2026-09-02  

---

## 1. Story Overview

### User Story
> **As a user wanting to print or save flashcards as PDF,**  
> I want the export engine to support the `pdf` format format string without failing with `{"error":"Unsupported export format \"pdf\""}`,  
> **So that I can directly download and print PDF-ready study sheets from the Web UI and CLI.**

---

## 2. Technical Scope & Architecture

### Core & Adapter Updates
1. **`PdfStudyGuideExporter` & `HtmlStudyGuideExporter` (`packages/adapters/src/export/`):**
   - Created `PdfStudyGuideExporter` implementing `ExporterPort` with `format = "pdf"`.
   - Registered `PdfStudyGuideExporter` in `app.ts` appContext exporterRegistry.
2. **Web Server (`packages/web/src/server.ts`):**
   - Updated GET `/api/export?format=pdf` route to serve print-styled HTML study sheets with appropriate content-type and headers.
3. **Automated Unit Tests:**
   - Added test in `packages/web/test/server.test.ts` verifying `/api/export?format=pdf`.

---

## 3. Acceptance Criteria

- [x] **AC1 — `pdf` Format Support in Export Engine:**
  - Given a call to export cards with `format = "pdf"`
  - When processed by `ExportService`
  - Then the printable study guide is generated successfully without an "Unsupported format" error.
- [x] **AC2 — Web Server Endpoint Serves PDF Study Sheet:**
  - Given a GET request to `/api/export?format=pdf`
  - When handled by the web server
  - Then it responds with status 200 and the printable study sheet HTML.
- [x] **AC3 — Unit Tests Pass:**
  - Export service and web server tests pass with 100% success.
