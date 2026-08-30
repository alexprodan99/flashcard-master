# Epic 3 Context: Multi-Format Export & Local Anki Ecosystem Integration

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide versatile, privacy-preserving export capabilities allowing users to export flashcards directly into Anki (native binary `.apkg` files, direct local AnkiConnect HTTP synchronization), as well as standard portable file formats (standard CSV, JSON, Markdown summaries with citation footers), backed by an exporter registry and unified CLI commands.

## Stories

- Story 3.1: Native Anki Package (.apkg) Exporter
- Story 3.2: Direct Local AnkiConnect Bridge Adapter
- Story 3.3: Portable Multi-Format Exporters (CSV, JSON, Markdown)
- Story 3.4: Exporter Registry & Format Negotiation
- Story 3.5: CLI Source Ingestion & Card Generation Commands
- Story 3.6: CLI Export & Interactive Review Commands

## Requirements & Constraints

- **Native .apkg Export (FR-301, AD-6):** Generate valid Anki `.apkg` packages (zip container containing SQLite `collection.anki2` schema, model schemas, notes, and cards) that import directly into desktop or mobile Anki.
- **AnkiConnect Bridge (FR-302, AD-6):** Connect to local Anki via HTTP `http://127.0.0.1:8765`, check health/permissions, create target decks if missing, and invoke `addNotes` action.
- **Portable Formats (FR-303, FR-304):** Export standard UTF-8 CSV (Front, Back, Tags, Citation), structured JSON (schema-validated), and Markdown study sheets with verbatim citation footnotes.
- **Export Port Architecture (AD-1, AD-6):** `ExporterPort` contract in `packages/core/src/ports/index.ts`. Concrete exporters in `packages/adapters/src/export/`.
- **CLI Commands (FR-305, FR-306, AD-7):** Executable CLI commands in `packages/cli` built with `commander`.

## Technical Decisions

- **.apkg Packaging (AD-6):** Uses `better-sqlite3` and `jszip` / `archiver` / `yauzl` / Node `zlib` / zip utilities to build the Anki SQLite database and zip container in-memory.
- **AnkiConnect API (AD-6):** Direct HTTP fetch requests to `http://127.0.0.1:8765` with action `addNotes` and model `Basic`.
- **Zero Third-Party Telemetry (NFR-201, NFR-202):** Local-only export; direct file writes or local socket connection to AnkiConnect.

## Cross-Story Dependencies

- Story 3.1 implements `AnkiPackageExporter`.
- Story 3.2 implements `AnkiConnectAdapter`.
- Story 3.3 implements `CsvExporter`, `JsonExporter`, and `MarkdownExporter`.
- Story 3.4 implements `ExporterRegistry`.
- Stories 3.5 and 3.6 implement the CLI commands using core services and adapters.
