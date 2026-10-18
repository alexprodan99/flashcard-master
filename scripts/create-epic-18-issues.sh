#!/usr/bin/env bash
# GitHub Issue Automation Script for Epic 18
# Prerequisites: Ensure 'gh auth login' has been executed.

set -euo pipefail

echo "Checking GitHub authentication status..."
gh auth status

REPO="alexprodan99/flashcard-master"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

# 1. Update Master Epic 18 Issue (#19)
EPIC_FILE="$BASE_DIR/_bmad-output/implementation-artifacts/epic-18-context.md"
echo "Updating Epic 18 (Issue #19) body..."
gh issue edit 19 --repo "$REPO" --title "[Epic 18] Knowledge-First Data Sources, EPUB Ingestion & Publishing, and Unified UI Settings Studio" --body-file "$EPIC_FILE"

# 2. Create Story Issues
create_story() {
    local title="$1"
    local file="$2"
    echo "Creating Issue: $title..."
    local url
    url=$(gh issue create --repo "$REPO" --title "$title" --body-file "$file" --label "story")
    echo "Created: $url"
}

create_story "[Story 18.1] Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio" \
    "$BASE_DIR/_bmad-output/implementation-artifacts/18-1-decouple-decks-from-data-sources-and-centralize-deck-selection.md"

create_story "[Story 18.2] Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)" \
    "$BASE_DIR/_bmad-output/implementation-artifacts/18-2-centralized-system-settings-and-integrations-studio.md"

create_story "[Story 18.3] Local EPUB Ingestion Strategy & Chapter Slicing Engine" \
    "$BASE_DIR/_bmad-output/implementation-artifacts/18-3-local-epub-ingestion-strategy-and-chapter-slicing-engine.md"

create_story "[Story 18.4] Flashcard Deck EPUB Study Guide Exporter" \
    "$BASE_DIR/_bmad-output/implementation-artifacts/18-4-flashcard-deck-epub-study-guide-exporter.md"

create_story "[Story 18.5] Monorepo Integration & End-to-End Verification" \
    "$BASE_DIR/_bmad-output/implementation-artifacts/18-5-monorepo-integration-and-end-to-end-verification.md"

echo ""
echo "All Epic 18 issues successfully created!"
