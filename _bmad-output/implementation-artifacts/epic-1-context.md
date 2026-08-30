# Epic 1 Context: Project Foundation & Core Ingestion Pipeline

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish the core TypeScript monorepo workspace, SQLite persistence engine (WAL mode), and pluggable Strategy Pattern ingestion architecture. Enable users to register, manage, and incrementally synchronize heterogeneous text sources (RSS feeds, web article URLs, and local Markdown/text directories) with robust GUID and content-hash delta tracking.

## Stories

- Story 1.1: Monorepo Scaffolding & SQLite Database Initialization
- Story 1.2: Data Source Registry & Ingestion Strategy Interface
- Story 1.3: RSS & Atom Feed Ingestion Strategy
- Story 1.4: Web Article Reader-Mode Extraction Strategy
- Story 1.5: Local Document & Directory Ingestion Strategy
- Story 1.6: Incremental Delta Sync & Hash Tracking

## Requirements & Constraints

- **Pluggable Ingestion Strategy Pattern (FR-101):** Decouple source fetching mechanisms completely from parsing and storage.
- **Source Types (FR-102, FR-103, FR-104):** Support RSS/Atom XML, web URLs (reader-mode extract stripping headers/footers/ads in < 3s), and local `.md`/`.txt` files.
- **Incremental Delta Synchronization (FR-105):** Store GUIDs and SHA-256 content hashes in `sync_state` to prevent re-processing unmodified content.
- **Local SQLite Store (FR-106, NFR-201):** All source registries and sync state must be stored locally in SQLite with WAL mode and transactional safety.
- **Fault Isolation (NFR-301):** Network or parsing failures on a single source must fail gracefully without aborting the batch.

## Technical Decisions

- **Architecture Paradigm (AD-1, AD-2):** Ports & Adapters (Hexagonal) architecture. Core domain logic in `packages/core` defines `IngestionStrategy` and `DataSourceRepository` ports; strategies implemented in `packages/adapters`.
- **Database Engine (AD-3):** SQLite configured with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.
- **Monorepo Structure (AD-7):** npm workspaces / Turborepo with packages: `packages/core`, `packages/adapters`, `packages/cli`, `packages/web`.

## Cross-Story Dependencies

- Story 1.1 provides the workspace root, tsconfig, packages structure, and SQLite database client.
- Story 1.2 builds on 1.1 to implement the `data_sources` table and `StrategyRegistry`.
- Stories 1.3, 1.4, and 1.5 implement specific strategies into the registry.
- Story 1.6 ties the strategies and delta tracking into the unified `IngestionService.sync()` engine.
