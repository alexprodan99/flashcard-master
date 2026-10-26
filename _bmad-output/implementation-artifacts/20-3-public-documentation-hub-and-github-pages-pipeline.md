---
title: 'Story 20.3: Public Documentation Hub & GitHub Pages CI/CD Pipeline'
type: 'feature'
created: '2026-10-26'
status: 'review'
baseline_commit: 'aaffcad'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Flashcard Master offers powerful, cutting-edge local-first learning, ingestion, and generation workflows (Hexagonal architecture, verbatim citation grounding, cognitive personas, multi-tier difficulty scaling, chapter slicing, AnkiConnect live sync, and multi-format exports). However, these capabilities are currently documented only in raw markdown files in `docs/` and internal sprint records in `_bmad-output/`. Without a hosted, accessible, and structured public documentation hub, prospective users, educators, and open-source contributors cannot easily discover and master the system.

**Approach:**
1. **User Guide Authoring (`docs/user-guide/`)**:
   - `quickstart.md`: 3-minute Quickstart covering zero-install (`npx @flashcard-master/cli init` / `serve`), global CLI install, and local web dashboard setup.
   - `ingestion-playbook.md`: Detailed guides for Web URLs, RSS/Atom feeds, Notion workspaces (token, page permissions, database syncing), Markdown notes, and long-form EPUB/PDF chapter slicing (Semantic Outline vs Budget modes).
   - `synthesis-and-prompting.md`: Flashcard generation engine, difficulty levels (beginner, intermediate, advanced), depth modes, cognitive personas, and verbatim source quote grounding.
   - `study-and-export.md`: Live AnkiConnect sync, Anki .apkg packages, Kindle/Kobo EPUB study guides with embedded downscaled media, CSV/TSV/Markdown export, and printable study sheets.
   - `troubleshooting-faq.md`: Actionable resolutions for common questions (Notion permissions, AnkiConnect offline, SQLite database paths, worker timeouts, LLM rate limits).
2. **Public Developer Architecture (`docs/ARCHITECTURE.md`)**:
   - Update `docs/ARCHITECTURE.md` to reflect all monorepo capabilities across Epics 1–19 (Worker pool multiprocessing, task streaming, Svelte 5 universal stores, GroundingGuard, responsive clamping, and document picker redesign).
3. **Static Documentation Hub (VitePress)**:
   - Configure VitePress with site title, description, dark mode palette, navbar, and sidebar navigation matching the project aesthetics.
   - Add scripts `"docs:dev"`, `"docs:build"`, and `"docs:preview"` to `package.json`.
4. **Automated GitHub Pages CI/CD Pipeline (`.github/workflows/deploy-docs.yml`)**:
   - Automated GitHub Actions workflow triggering on push to `main` (for docs paths) that builds the static site and deploys to GitHub Pages via official `actions/deploy-pages@v4`.
5. **In-App Navigation Link**:
   - Add a prominent, styled "📖 Documentation" link in `Navigation.svelte` pointing to the public GitHub Pages documentation hub (`https://alexprodan99.github.io/flashcard-master/`).

## Boundaries & Constraints

**Always:**
- Keep user guide explanations accessible, clear, and beginner-friendly without sacrificing technical accuracy.
- Retain cutting-edge AI provider defaults (`gemini-3.6-flash`, `claude-haiku-4-5-20251001`, `gpt-4o-mini`, `phi4-mini`) strictly limited to the 4 supported providers.
- Ensure VitePress builds cleanly without errors or broken links.
- Preserve all existing tests and TypeScript typechecking gates.

**Never:**
- Never introduce external hosting dependencies or proprietary analytics.
- Never break existing web client responsive styling or keyboard navigation.

## Acceptance Criteria

1. Complete User Guide is authored under `docs/user-guide/` with clear, non-technical instructions and diagrams.
2. `docs/ARCHITECTURE.md` is updated to reflect all monorepo capabilities across Epics 1–19.
3. Static documentation site builds cleanly and deploys automatically to GitHub Pages via `.github/workflows/deploy-docs.yml`.
4. Web UI and Desktop navigation headers contain a "📖 Documentation" link opening the hosted docs site.
5. All automated test suites, typechecks, and builds pass cleanly (`npm test`, `npm run typecheck`, `npm run build`, `npm run docs:build`).
</frozen-after-approval>

## Implementation Record

### Completed Deliverables
- **User Guide Authoring (`docs/user-guide/`)**:
  - `quickstart.md`: Comprehensive 3-minute tutorial with zero-install, global install, AI provider keys, source ingestion, generation, and review.
  - `ingestion-playbook.md`: Detailed guides for Web articles, RSS feeds, Notion workspaces (token, permissions, recursive crawling), Markdown notes, and EPUB/PDF chapter slicing.
  - `synthesis-and-prompting.md`: Factual quote grounding guard diagrams, difficulty scaling tiers, cognitive personas, and model guidance.
  - `study-and-export.md`: AnkiConnect 1-click live sync, standalone `.apkg` packages, Kindle/Kobo EPUB study books with Base64 WebP media, printable study sheets, and plaintext/CSV interop.
  - `troubleshooting-faq.md`: Actionable resolutions for Notion permissions, AnkiConnect connection refused, SQLite database paths, worker pool concurrency, and LLM rate limits.
- **Developer Architecture (`docs/ARCHITECTURE.md`)**:
  - Updated with Sections 13 and 14 covering Deck Operations (Clone, Split, Move), Partial Scoping Filters in Export Engine, and AGPL-3.0 copyleft reciprocity invariants.
- **Static Documentation Hub (VitePress)**:
  - Configured in `docs/.vitepress/config.mts` with dark theme palette, search, navbar, sidebar, and social links.
  - Created hero landing page in `docs/index.md`.
  - Added scripts `"docs:dev"`, `"docs:build"`, and `"docs:preview"` to root `package.json`.
- **GitHub Actions CI/CD (`.github/workflows/deploy-docs.yml`)**:
  - Configured automated deployment to GitHub Pages via `actions/upload-pages-artifact@v3` and `actions/deploy-pages@v4`.
  - Added docs build verification step to `.github/workflows/ci.yml`.
- **In-App Navigation Link**:
  - Added styled "📖 Documentation" link in `packages/web/client/src/components/Navigation.svelte` pointing to the public GitHub Pages documentation hub.
- **Verification**:
  - `npm run typecheck`: 0 errors.
  - `npm test`: 672/672 vitest tests passing across all packages.
  - `npm run build`: Monorepo build compiled cleanly.
  - `npm run docs:build`: VitePress static build compiled in 11.93s with 0 errors.

