# Brainstorm Intent: flashcard-master Core Features

**Project:** flashcard-master  
**Topic:** Multi-Source Data Ingestion & Grounded Q&A Generation for Anki, Markdown & PDF  
**Status:** Completed Brainstorming Session  
**Date:** 2026-08-30  

---

## 1. Executive Summary & Vision

`flashcard-master` is an AI-powered study and knowledge-retention engine that automatically ingests content from dynamic, heterogeneous text sources (RSS feeds, newsletters, web articles, local markdown/text documents), extracts high-yield atomic question-and-answer pairs strictly grounded in verbatim source quotes, and exports them directly into Anki (`.apkg`, AnkiConnect), Markdown study notes, and PDF reference guides.

---

## 2. Core Functional Pillars

### A. Dynamic & Extensible Ingestion Engine
- **Strategy Pattern Architecture**: A pluggable `DataSourceType` system where each source type implements a dedicated `IngestionStrategy` (e.g. `RssIngestionStrategy`, `WebArticleIngestionStrategy`, `LocalFileIngestionStrategy`).
- **Database-Backed Source Registry**: All source configurations, target tags, deck mappings, and schedule intervals are persisted in a local database (e.g. SQLite).
- **Incremental Delta Sync**: Tracks item GUIDs and content hashes to ensure only new or modified text is processed.
- **Initial Scope**: High-precision text-only parsing for v1.

### B. Grounded Q&A Generation Engine
- **Card Format (v1)**: High-quality Front/Back Q&A cards (with architectural extensibility documented for Cloze Deletion and Multiple Choice in future phases).
- **Strict Verbatim Source Grounding**: Every card is required to cite the exact source quote/sentence it was derived from to eliminate hallucination.
- **Atomic Concept Prompting Guard**: Enforces the Minimum Information Principle (one distinct testable concept per card; focuses on mechanisms, causality, and *why/how*).
- **Configurable Personas & Difficulty**:
  - Configurable difficulty levels (Beginner, Intermediate, Expert).
  - Customizable prompt personas (e.g., Socratic Mentor, Strict Technical Examiner, Executive Synthesizer).
- **Automated DB Persistence**: Cards are automatically committed directly to the database upon generation with source metadata.

### C. Multi-Target Exporter Pipeline
- **Anki Package (`.apkg`)**: Native, self-contained Anki deck files styled with clean CSS templates.
- **AnkiConnect API**: Live 1-click sync into a running desktop Anki instance via local HTTP API.
- **Standard Delimited Files**: Anki-compatible CSV and TSV export.
- **Interactive Markdown (`.md`)**: Formatted using collapsible `<details><summary>Question</summary>...</details>` blocks for active-recall study in Obsidian or GitHub.
- **PDF Study Guide**: Printable 2-column Q&A review sheet with citation callouts.
- **Selective Filtering**: Export by tag, source, difficulty, or date range.

### D. Dual User Interface
- **Interactive CLI Experience**:
  - Guided interactive terminal wizard (`flashcard-master config init`, `flashcard-master source add -i`) with arrow-key menus.
  - Subcommands for scriptable automation (`source`, `sync`, `export`, `cards`, `config`).
- **Local Web UI Dashboard (`flashcard-master ui`)**:
  - **Sources Dashboard**: Manage RSS subscriptions, paste URLs, drag-and-drop local notes.
  - **Question Explorer & Editor**: Search, filter, and edit cards with verbatim quote previews.
  - **1-Click Export Center**: Direct Anki push, `.apkg` generation, Markdown/PDF downloads.
  - **Settings & Persona Studio**: Visual API key management and persona prompt crafting.

---

## 3. Downstream Handoff

This intent document serves as the direct foundational input for:
1. `bmad-product-brief` / `bmad-prd` — Formalizing the PRD with detailed functional requirements, user stories, and acceptance criteria.
2. `bmad-architecture` — Specifying the database schema, Strategy pattern classes, LLM provider abstractions, and export adapters.
