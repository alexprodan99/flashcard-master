# Story 6.1: Svelte 5 & Vite Build Pipeline Setup

**Epic:** Epic 6 - Modern UI Migration to Svelte 5 & Component Architecture  
**Status:** done  
**Date:** 2026-09-01  

---

## 1. Story Overview

### User Story
> **As a developer maintaining the Flashcard Master UI,**  
> I want a modern Vite build pipeline configured with Svelte 5 and TypeScript in `packages/web`,  
> **So that I can write declarative, compile-time reactive components (`$state`, `$derived`, `$props`) with scoped styles and zero Virtual DOM overhead.**

---

## 2. Technical Scope & Architecture

### Dependencies & Tooling
Inside `packages/web/package.json`:
- `svelte`: `^5.57.0`
- `@sveltejs/vite-plugin-svelte`: `^7.3.0`
- `vite`: `^8.2.2`
- `svelte-check`: `^4.7.6`

### Directory Scaffold
```text
packages/web/
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   ├── svelte.config.js
│   └── src/
│       ├── main.ts             # Svelte 5 mount entry point
│       ├── App.svelte          # Root layout shell
│       ├── components/         # Shared UI elements
│       └── views/              # 5 primary views
├── src/
│   ├── index.ts                # Web package exports
│   └── server.ts               # Node.js HTTP server & API endpoints
└── dist/
    ├── client/                 # Vite static build output
    └── index.js                # Compiled Node backend
```

### Build Scripts
- `npm run build:client` -> `vite build client`
- `npm run build:server` -> `tsc`
- `npm run build` -> `npm run build:client && npm run build:server`

---

## 3. Acceptance Criteria

- [x] **AC1 — Svelte 5 & Vite Configuration:**
  - **Given** `packages/web` workspace
  - **When** Vite build is invoked (`npm run build:client -w @flashcard-master/web`)
  - **Then** Svelte 5 components are compiled into optimized static HTML, CSS, and JS bundles in `dist/client/`.
- [x] **AC2 — TypeScript & Svelte Typings:**
  - **Given** Svelte 5 runes (`$state`, `$derived`, `$props`) in client code
  - **When** `npm run build` executes
  - **Then** TypeScript and `svelte-check` pass with zero type errors.
- [x] **AC3 — Monorepo Root Build Integration:**
  - **Given** monorepo root
  - **When** `npm run build` is executed
  - **Then** all workspaces (`@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/web`, `@flashcard-master/cli`) compile cleanly in sequence.