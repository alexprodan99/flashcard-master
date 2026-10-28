---
layout: home

hero:
  name: "Flashcard Master"
  text: "Local-First Grounded AI Flashcard Studio"
  tagline: "Turn books, web articles, RSS feeds, and Notion pages into hallucination-free active recall flashcards with verified verbatim citations."
  actions:
    - theme: brand
      text: 🚀 3-Minute Quickstart
      link: /user-guide/quickstart
    - theme: alt
      text: 📖 Read User Guide
      link: /user-guide/ingestion-playbook
    - theme: alt
      text: 🏛️ System Architecture
      link: /architecture

features:
  - icon: 🎯
    title: Factual Quote Grounding
    details: Zero hallucinations. Every generated card is cryptographically verified against exact verbatim source substrings before persisting.
  - icon: 🌐
    title: Multi-Source Ingestion
    details: Seamlessly extract knowledge from Web URLs, RSS/Atom feeds, Notion workspaces, EPUB e-books, and local Markdown/PDF files.
  - icon: ⚡
    title: Adaptive Synthesis & Personas
    details: Calibrate generation across 3 difficulty tiers (Beginner, Intermediate, Advanced) and cognitive personas (Socratic, Drill Sergeant, Analogy Weaver).
  - icon: 🔒
    title: 100% Local-First & Private
    details: All data sources, extracted articles, and cards reside on your local disk in SQLite with WAL mode. Zero user content is sent to external servers.
  - icon: 🔄
    title: Anki & Multi-Format Export
    details: 1-click live sync to Desktop Anki via AnkiConnect, standalone .apkg decks, Kindle/Kobo EPUB study guides, and printable study sheets.
  - icon: 🧵
    title: Resilient Multiprocessing Pool
    details: Parallel background worker processes for long-running ingestions, synthesis jobs, and batch exports with real-time SSE progress streaming.
  - icon: 🖥️
    title: Standalone Desktop App
    details: Packaged for Windows (.exe), macOS (.dmg), and Linux (.AppImage/.deb) with system tray controls, dark slate styling, and automatic userData storage.
---

## 📚 Documentation Overview

Welcome to the official documentation for **Flashcard Master**! Whether you are a student, researcher, developer, or lifelong learner, these guides will help you unlock maximum learning retention from your reading materials.

### 🧭 Navigation Guide

- **[3-Minute Quickstart](/user-guide/quickstart)**: Install, launch the local Web UI dashboard, and synthesize your first flashcard deck in under three minutes.
- **[Ingestion Playbook](/user-guide/ingestion-playbook)**: Learn how to import web articles, crawl RSS feeds, connect Notion workspaces, and slice large EPUB/PDF books into chapter-level learning modules.
- **[Synthesis & Prompt Tuning](/user-guide/synthesis-and-prompting)**: Discover how to tailor card density, choose cognitive personas, scale difficulty, and enforce quote grounding.
- **[Study & Export Workflows](/user-guide/study-and-export)**: Push cards to Desktop Anki via AnkiConnect, generate offline `.apkg` packages, or create styled e-reader EPUB study books.
- **[Troubleshooting & FAQ](/user-guide/troubleshooting-faq)**: Solutions for Notion permissions, Anki connection issues, SQLite paths, and worker concurrency limits.
- **[Centralized Settings & Configuration](/settings-configuration)**: Reference guide for all environment variables, provider credentials, and worker thread limits.
- **[Monorepo Architecture & Design](/architecture)**: Deep dive into the Hexagonal Ports & Adapters architecture, data schemas, worker pool multiprocessing, and Svelte 5 universal stores.
