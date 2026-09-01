# Story 6.4: WebServer Static Asset Delivery & End-to-End Test Suite

**Epic:** Epic 6 - Modern UI Migration to Svelte 5 & Component Architecture  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a developer running Flashcard Master,**  
> I want the Node.js `WebServer` in `packages/web/src/server.ts` to seamlessly serve compiled Svelte static assets (`dist/client/`) with proper MIME types, cache headers, and SPA routing fallback,  
> **So that the Svelte 5 dashboard loads instantly in any browser while preserving 100% of existing REST API routes and automated integration test coverage.**

---

## 2. Technical Scope & Architecture

### Static File Serving Logic
Inside `packages/web/src/server.ts`:
- Check for static client build directory (`dist/client`).
- Serve `/assets/*.js` as `application/javascript; charset=utf-8`.
- Serve `/assets/*.css` as `text/css; charset=utf-8`.
- Serve `/index.html` or root `/` as `text/html; charset=utf-8`.
- Maintain fallback to embedded SPA if client bundle has not yet been built.
- Keep all `/api/*` REST endpoints intact.

---

## 3. Acceptance Criteria

- [x] **AC1 — Static Asset Delivery:**
  - **Given** running `WebServer`
  - **When** browser requests `GET /`, `GET /assets/*.js`, or `GET /assets/*.css`
  - **Then** the server returns the compiled Svelte assets with HTTP 200 and appropriate Content-Type headers.
- [x] **AC2 — REST API Decoupling:**
  - **Given** all REST endpoints (`/api/stats`, `/api/sources`, `/api/cards`, `/api/generate`, `/api/export/*`, `/api/sync`)
  - **When** API calls are dispatched
  - **Then** they continue to respond with valid JSON payloads and status codes.
- [x] **AC3 — Integration Test Verification:**
  - **Given** `packages/web/test/server.test.ts`
  - **When** `npm test` runs across all workspaces
  - **Then** all 23 test suites and 106 tests pass with 100% success.