#!/usr/bin/env bash
# GitHub Issue Automation Script for Epic 18
# Prerequisites: Ensure 'gh auth login' has been executed.

set -euo pipefail

echo "Checking GitHub authentication status..."
if ! gh auth status >/dev/null 2>&1; then
    echo "Error: You are not logged into GitHub CLI. Please run 'gh auth login' first." >&2
    exit 1
fi

REPO="alexprodan99/flashcard-master"

create_issue() {
    local title="$1"
    local body="$2"
    local label="$3"
    local tmp_file
    tmp_file=$(mktemp --suffix=.md)
    echo "$body" > "$tmp_file"

    echo "Creating Issue: $title..."
    if ! gh issue create --repo "$REPO" --title "$title" --body-file "$tmp_file" --label "$label" 2>/dev/null; then
        # Fallback if label does not exist yet
        gh issue create --repo "$REPO" --title "$title" --body-file "$tmp_file"
    fi
    rm -f "$tmp_file"
}

# 1. Master Epic Issue
EPIC_BODY=$(cat <<'EOF'
## Goal
Transform Flashcard Master into a truly content-first learning workstation by decoupling flashcard decks from data sources (designating Generate Studio as the single canonical source of truth for deck routing with smart autocomplete), centralizing all application parameters and environment overrides into an interactive UI Settings Studio (including AnkiConnect configuration, live testing, and AI defaults), introducing pure-JS EPUB eBook ingestion with automatic chapter slicing and media localization, and publishing curated flashcard decks as interactive EPUB 3.0 study guide eBooks for e-readers.

## Stories
- [ ] **Story 18.1:** Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio
- [ ] **Story 18.2:** Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)
- [ ] **Story 18.3:** Local EPUB Ingestion Strategy & Chapter Slicing Engine
- [ ] **Story 18.4:** Flashcard Deck EPUB Study Guide Exporter
- [ ] **Story 18.5:** Monorepo Integration & End-to-End Verification

## Planning & Artifacts
- **Branch:** `feat/epic18`
- **Context:** `_bmad-output/implementation-artifacts/epic-18-context.md`
- **Sprint Status:** `_bmad-output/implementation-artifacts/sprint-status.yaml`
EOF
)
create_issue "[Epic 18] Knowledge-First Data Sources, EPUB Ingestion & Publishing, and Unified UI Settings Studio" "$EPIC_BODY" "epic"

# 2. Story 18.1
STORY_18_1_BODY=$(cat <<'EOF'
## Story 18.1: Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio
**ID:** `18-1-decouple-decks-from-data-sources-and-centralize-deck-selection`
**Epic:** Epic 18

### Problem
Flashcard Master currently forces users to define a "Target Deck" when creating or editing a Data Source (`data_sources.target_deck`), and displays deck badges on data sources. Semantically, a data source is an immutable knowledge artifact (a book, article, RSS feed, or directory), not a destination flashcard deck. Forcing deck assignment at the source level confuses users, prevents generating multiple distinct decks from the same knowledge source, and unnecessarily duplicates deck metadata.

### Approach
Decouple flashcard decks from data sources by making `data_sources.target_deck` optional and deprecated in SQLite schema and repository layers. Remove "Target Deck" input fields from `AddSourceModal.svelte` and `EditSourceModal.svelte`, and remove deck badges from `SourcesView.svelte`. Make `GenerateStudio.svelte` and Document Inspector the single source of truth where the destination deck is specified, enhanced with an auto-suggesting deck selector dropdown populated from `cardRepo.listDecks()` alongside custom new deck entry.

### Tasks & Acceptance Criteria
- [ ] Make `targetDeck` optional in `source-repository.ts` and `schema.sql`
- [ ] Remove Target Deck inputs from `AddSourceModal.svelte` and `EditSourceModal.svelte`
- [ ] Remove deck badges from `SourcesView.svelte` and `DashboardView.svelte`
- [ ] Add auto-suggesting deck selector in `GenerateStudio.svelte` and `GenerationConfigFields.svelte` populated from SQLite `cardRepo.listDecks()`
- [ ] Update `SourceDocumentInspector.svelte` Configure & Generate modal
- [ ] Make `--deck` optional on CLI `sources add`
EOF
)
create_issue "[Story 18.1] Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio" "$STORY_18_1_BODY" "story"

# 3. Story 18.2
STORY_18_2_BODY=$(cat <<'EOF'
## Story 18.2: Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)
**ID:** `18-2-centralized-system-settings-and-integrations-studio`
**Epic:** Epic 18

### Problem
Application parameters, AI defaults, worker concurrency limits, timeouts, and AnkiConnect configurations are scattered across `.env` files, CLI flags, or hardcoded constants in code (e.g. AnkiConnect hardcoded to `http://127.0.0.1:8765`, worker concurrency hardcoded to 2, generation defaults hardcoded in store). Users cannot customize or troubleshoot these without modifying environment files or restarting processes.

### Approach
Unify all system parameters into a centralized settings management system backed by the SQLite `app_settings` table and exposed through the Web UI Settings panel with hierarchical fallback (`SQLite -> process.env -> hardcoded default`).
1. **AnkiConnect Integration Settings:** Endpoint URL (`ankiconnect_url`, default `http://127.0.0.1:8765`), optional API key token (`ankiconnect_api_key`), timeout ms, and a live "Test Connection" button.
2. **AI Generation Defaults:** Default LLM provider, model, persona, difficulty, card batch quantity, and grounding guard toggle.
3. **Worker Pool & Task Processing:** Concurrency limits (`max_generation_workers`, `max_sync_workers`, `max_export_workers`), and worker task execution timeout (`worker_timeout_minutes`).
4. **Document Ingestion & Slicing Defaults:** Default slicing strategy (`outline` vs `budget`) and default page budget size.
5. **EPUB Publishing Metadata:** Default author and default publisher.

### Tasks & Acceptance Criteria
- [ ] Implement `GeneralSettingsSchema` in `packages/core/src/domain/models.ts`
- [ ] Add general settings getters/setters in `SettingsService` with `process.env` fallback
- [ ] Enable dynamic AnkiConnect URL and API key resolution in `AnkiConnectAdapter`
- [ ] Expose REST endpoints `GET /api/settings/general`, `POST /api/settings/general`, and `POST /api/settings/anki/test`
- [ ] Connect `JobManager` concurrency limits and task worker timeouts to `SettingsService`
- [ ] Add reactive state in `settingsStore.svelte.ts` and comprehensive studio cards in `SettingsView.svelte`
EOF
)
create_issue "[Story 18.2] Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)" "$STORY_18_2_BODY" "story"

# 4. Story 18.3
STORY_18_3_BODY=$(cat <<'EOF'
## Story 18.3: Local EPUB Ingestion Strategy & Chapter Slicing Engine
**ID:** `18-3-local-epub-ingestion-strategy-and-chapter-slicing-engine`
**Epic:** Epic 18

### Problem
Users possessing electronic books, textbooks, and technical publications formatted as `.epub` files cannot ingest them as learning materials. Flashcard Master currently only supports `.md`, `.markdown`, `.txt`, `.pdf`, and `.docx` local files.

### Approach
Implement a pure-JavaScript `EpubParser` in `@flashcard-master/adapters` utilizing libraries already bundled in the monorepo (`jszip`, `fast-xml-parser`, `jsdom`). Ingest EPUB 2 and EPUB 3 publications by:
1. Reading `META-INF/container.xml` to locate the OPF package document.
2. Parsing manifest and spine reading order.
3. Traversing Table of Contents structures (`nav.xhtml` and `toc.ncx`) for chapter titles and section hierarchy.
4. Extracting and converting XHTML chapters into clean GitHub-Flavored Markdown.
5. Extracting embedded images into `MediaService` (content-addressed hash store).
6. Slicing chapters into discrete Document Catalog subdocuments with chapter page/section coordinates for flashcard citation grounding (`sourceLocator`).
7. Updating `LocalFileStrategy`, `server.ts`, and `AddSourceModal.svelte` to accept `.epub`.

### Tasks & Acceptance Criteria
- [ ] Build pure-JS `EpubParser` in `packages/adapters/src/ingestion/epub-parser.ts`
- [ ] Support `.epub` in `LocalFileStrategy` for single files and directory scanning (`**/*.epub`)
- [ ] Update `server.ts` `/api/sources/upload` to accept `application/epub+zip`
- [ ] Update file dropzone in `AddSourceModal.svelte` and `EditSourceModal.svelte`
- [ ] Verify chapter subdocument registration in Document Catalog and flashcard `sourceLocator` propagation
EOF
)
create_issue "[Story 18.3] Local EPUB Ingestion Strategy & Chapter Slicing Engine" "$STORY_18_3_BODY" "story"

# 5. Story 18.4
STORY_18_4_BODY=$(cat <<'EOF'
## Story 18.4: Flashcard Deck EPUB Study Guide Exporter
**ID:** `18-4-flashcard-deck-epub-study-guide-exporter`
**Epic:** Epic 18

### Problem
Users can currently export knowledge base documents to EPUB 3.0, but they cannot export their curated flashcard decks to EPUB. Learners who study on dedicated e-ink devices (Kindle, Kobo, Boox) or eBook readers (Apple Books, Calibre) cannot take their generated flashcards on the go in a structured, interactive eBook format.

### Approach
Implement `EpubFlashcardExporter` in `@flashcard-master/adapters` conforming to `ExporterPort`. Synthesize flashcard decks into a standards-compliant EPUB 3.0 study guide eBook:
1. Format flashcards with e-reader friendly typography and interactive HTML5 collapsible reveal blocks (`<details><summary>Q: ...</summary><div>A: ...</div></details>`).
2. Group cards by Deck and Difficulty, with an automated Table of Contents (`nav.xhtml` and `toc.ncx`).
3. Include rich card metadata: difficulty badges, persona tags, verbatim grounding quotes, and exact source locator references.
4. Adhere strictly to the EPUB 3.0 specification: uncompressed `mimetype` at byte offset 0 (STORE method), valid OPF manifest, spine, and container.
5. Expose in `ExportCenter.svelte` under "Curated Flashcard Exports" with 1-click download button and `/api/export/epub` endpoint.
6. Support `--format epub` in CLI `flashcards export`.

### Tasks & Acceptance Criteria
- [ ] Build `EpubFlashcardExporter` in `packages/adapters/src/export/epub-flashcard-exporter.ts`
- [ ] Register exporter in `ExporterRegistry` under format `"epub"`
- [ ] Add `/api/export/epub` REST endpoints in `server.ts`
- [ ] Add EPUB study guide card and download trigger in `ExportCenter.svelte`
- [ ] Add `--format epub` flag to CLI `export` command
- [ ] Write unit tests verifying ZIP compression invariants, OPF manifest, and card markup
EOF
)
create_issue "[Story 18.4] Flashcard Deck EPUB Study Guide Exporter" "$STORY_18_4_BODY" "story"

# 6. Story 18.5
STORY_18_5_BODY=$(cat <<'EOF'
## Story 18.5: Monorepo Integration & End-to-End Verification
**ID:** `18-5-monorepo-integration-and-end-to-end-verification`
**Epic:** Epic 18

### Problem
Epic 18 touches foundational boundaries across all monorepo packages: SQLite data source schemas, settings repositories, AnkiConnect adapters, EPUB file ingestion, chapter slicing, flashcard EPUB synthesis, and Web UI views. High test coverage and end-to-end regression verification are required to guarantee stability.

### Approach
Implement comprehensive integration and unit tests covering:
1. **Deck Decoupling & Ingestion:** Adding sources without `targetDeck`, loading legacy rows, and generating cards into designated decks.
2. **Centralized Settings & AnkiConnect:** Verifying `SettingsService` hierarchical fallback chain, REST endpoints, and live AnkiConnect health check API.
3. **EPUB Ingestion Pipeline:** Parsing EPUB 2.0 and EPUB 3.0 fixtures, extracting chapters in spine order, converting XHTML to Markdown, storing embedded media in `MediaService`, and slicing chapters into Document Catalog subdocuments.
4. **Flashcard EPUB Publishing:** Generating card EPUBs, testing ZIP compression invariants (STORE mimetype at offset 0), and validating navigation markup.
5. **Monorepo Build & Lint Gate:** Verifying that `npm test`, `npm run lint`, and `npm run typecheck` execute cleanly with zero errors across all workspaces.

### Tasks & Acceptance Criteria
- [ ] Add unit tests for `source-repository` verifying optional `targetDeck`
- [ ] Add unit tests for `settings-service` verifying general settings and Anki resolution
- [ ] Add unit and integration tests for `EpubParser` in `adapters`
- [ ] Add unit tests for `EpubFlashcardExporter` in `adapters`
- [ ] Add server integration tests for `/api/settings/general`, `/api/settings/anki/test`, and `/api/export/epub`
- [ ] Verify `npm run lint`, `npm run typecheck`, and `npm test` across monorepo
EOF
)
create_issue "[Story 18.5] Monorepo Integration & End-to-End Verification" "$STORY_18_5_BODY" "story"

echo ""
echo "All Epic 18 issues successfully created!"
