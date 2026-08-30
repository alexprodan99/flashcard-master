---
title: "Product Brief: flashcard-master"
status: "approved"
created: "2026-08-30"
updated: "2026-08-30"
---

# Product Brief: flashcard-master

## 1. Executive Summary
`flashcard-master` is a local-first, AI-driven study and knowledge-retention engine. It continuously transforms heterogeneous text streams—such as technical RSS feeds, Substack newsletters, web articles, and local Markdown documents—into high-yield, atomic flashcards strictly grounded in verifiable source quotes. The generated question database seamlessly integrates into the user's active-recall routine via Anki packages (`.apkg`), AnkiConnect live sync, collapsible Markdown, and printable PDF study guides.

---

## 2. Problem Statement
Continuous learners and software engineers read vast amounts of technical material, yet forget the majority of it within days due to three acute friction points:
1. **The Collector's Fallacy:** Saving articles to bookmarks, reading lists, or open browser tabs without converting knowledge into active memory.
2. **The Manual Card Creation Tax:** Writing high-quality Anki flashcards by hand requires 5–10 minutes per concept, creating immense friction that leads users to abandon spaced repetition.
3. **The AI Fluff & Hallucination Trap:** Generic AI summarizers produce vague bullet points and untethered answers that lack verifiable grounding in original source text.

**The Solution:** An automated, grounded pipeline that ingests any configured text source, identifies core concepts, drafts atomic testable questions with exact quote citations, and publishes them into Anki with zero manual authoring required.

---

## 3. Target Audience & Jobs to Be Done (JTBD)

### Primary Persona: The Software Engineer & Tech Professional
- **Context:** Consumes technical architecture blogs, system design papers, engineering RFCs, and framework documentation.
- **Core JTBD:** *"When I read deep technical documentation or engineering blogs, I want instant, atomic flashcards citing exact source sentences, so I can speak fluently about architectural trade-offs in reviews without spending hours manually creating cards in Anki."*

### Secondary Persona: The Continuous Knowledge Learner
- **Context:** Subscribes to industry newsletters and domain literature.
- **Core JTBD:** *"When my subscribed newsletters drop new posts, I want my learning pipeline to incrementally generate grounded Q&A on autopilot, so my long-term memory compounds effortlessly."*

---

## 4. Core Value Proposition & Differentiators

| Pillar | How `flashcard-master` Delivers |
| :--- | :--- |
| **Strict Verbatim Grounding** | Every flashcard includes the exact source quote/sentence it was derived from. No AI hallucinations. |
| **Dynamic Ingestion (Strategy Pattern)** | Pluggable source architecture backed by a local database registry with incremental delta sync (RSS, Web URL, local files). |
| **Native Spaced Repetition Bridge** | Direct AnkiConnect HTTP desktop push, standalone `.apkg` files, collapsible Markdown (`<details>`), and PDF study guides. |
| **Dual Developer-First Interface** | Guided interactive terminal wizard + scriptable CLI, paired with a visual local Web UI dashboard. |

---

## 5. Core Functional Capabilities (v1)

1. **Pluggable Data Ingestion:**
   - Strategy-based ingestion engine supporting RSS/Atom feeds, single web URLs (reader-mode extraction), and local text/markdown files.
   - Database-backed source registry with per-source tags and target Anki deck mappings.
   - Incremental delta sync tracking article GUIDs and file hashes.
2. **Grounded Q&A Generation:**
   - Front/Back card generation enforcing the Minimum Information Principle (atomic concepts).
   - Verbatim quote citation attached to every card back.
   - Configurable question difficulty (Beginner, Intermediate, Expert) and customizable agent prompt personas.
   - Automatic database persistence upon generation.
3. **Multi-Target Exporter:**
   - Native Anki `.apkg` package generation with custom CSS styling.
   - Live 1-click sync to desktop Anki via AnkiConnect HTTP API.
   - Anki-compatible CSV/TSV export.
   - Collapsible Markdown (`<details><summary>Q</summary>A & Quote</details>`) and 2-column PDF study guide.
4. **Dual Surface (CLI + UI):**
   - Interactive terminal wizard (`flashcard-master config init`, `source add -i`).
   - Local Web UI dashboard (`flashcard-master ui`) with Sources Manager, Question Explorer, and Export Center.

---

## 6. Non-Goals & Scope Boundaries (v1)

- ❌ **No Custom Spaced Repetition Engine:** Does not build a proprietary scheduling algorithm; relies on Anki (SM-2/FSRS), Markdown, and PDF.
- ❌ **No Multimodal Data Ingestion in v1:** Pure text-only ingestion (no video transcription, audio parsing, or image OCR).
- ❌ **No Complex Card Formats in v1:** Front/Back Q&A only (Cloze deletion and Multiple Choice are deferred to future roadmap).
- ❌ **No Cloud / Multi-Tenant SaaS Infrastructure:** Local-first architecture running on user's hardware with embedded SQLite database.

---

## 7. Success Metrics & Validation Signals

1. **Onboarding Speed:** A user can configure a new data source via CLI wizard or UI in **under 60 seconds**.
2. **Generation Quality:** The engine generates **10 accurate, verbatim citation-backed flashcards in 1 click** requiring zero manual post-editing.
3. **Export Velocity:** Instant 1-click export to Anki (`.apkg` or AnkiConnect) with verified card layout and formatting.
