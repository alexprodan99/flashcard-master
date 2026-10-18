# GitHub Issue Automation Script for Epic 18
# Prerequisites: Ensure 'gh auth login' has been executed.

$ErrorActionPreference = "Stop"

Write-Host "Checking GitHub authentication status..." -ForegroundColor Cyan
gh auth status

$repo = "alexprodan99/flashcard-master"
$baseDir = Split-Path -Parent $PSScriptRoot

$stories = @(
    @{
        Title = "[Story 18.1] Decouple Decks from Data Sources & Centralize Deck Selection in Generate Studio"
        File = Join-Path $baseDir "_bmad-output/implementation-artifacts/18-1-decouple-decks-from-data-sources-and-centralize-deck-selection.md"
        Label = "story"
    },
    @{
        Title = "[Story 18.2] Centralized System Settings & Integrations Studio (Replacing .env Fallbacks)"
        File = Join-Path $baseDir "_bmad-output/implementation-artifacts/18-2-centralized-system-settings-and-integrations-studio.md"
        Label = "story"
    },
    @{
        Title = "[Story 18.3] Local EPUB Ingestion Strategy & Chapter Slicing Engine"
        File = Join-Path $baseDir "_bmad-output/implementation-artifacts/18-3-local-epub-ingestion-strategy-and-chapter-slicing-engine.md"
        Label = "story"
    },
    @{
        Title = "[Story 18.4] Flashcard Deck EPUB Study Guide Exporter"
        File = Join-Path $baseDir "_bmad-output/implementation-artifacts/18-4-flashcard-deck-epub-study-guide-exporter.md"
        Label = "story"
    },
    @{
        Title = "[Story 18.5] Monorepo Integration & End-to-End Verification"
        File = Join-Path $baseDir "_bmad-output/implementation-artifacts/18-5-monorepo-integration-and-end-to-end-verification.md"
        Label = "story"
    }
)

# 1. Update Master Epic 18 Issue (#19)
$epicFile = Join-Path $baseDir "_bmad-output/implementation-artifacts/epic-18-context.md"
Write-Host "Updating Epic 18 (Issue #19) body..." -ForegroundColor Cyan
gh issue edit 19 --repo $repo --title "[Epic 18] Knowledge-First Data Sources, EPUB Ingestion & Publishing, and Unified UI Settings Studio" --body-file $epicFile

# 2. Create Story Issues
$createdIssues = @()
foreach ($item in $stories) {
    Write-Host "Creating Issue: $($item.Title)..." -ForegroundColor Yellow
    $url = gh issue create --repo $repo --title $item.Title --body-file $item.File --label $item.Label
    Write-Host "Created: $url" -ForegroundColor Green
    $createdIssues += $url
}

Write-Host "`nAll Epic 18 issues successfully created!" -ForegroundColor Green
$createdIssues | ForEach-Object { Write-Host "- $_" }
