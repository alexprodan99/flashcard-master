---
title: 'Story 21.1: Media Domain Schema, Per-Item URI Descriptors & SRT/VTT Subtitle Parser'
type: 'feature'
created: '2026-11-14'
status: 'done'
baseline_commit: '67517c6'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-21-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Flashcard Master currently models only text/document data sources (`rss`, `web`, `local`, `sitemap`, `llms-txt`, `notion`) and page-bounded documents (`startPage`, `endPage`). It lacks domain schemas and SQLite support for dedicated `audio`, `video`, and `youtube` sources, per-item extraction descriptors (specifying subtitles vs. STT provider and custom timestamp ranges per file/link), and a subtitle parser that normalizes fragmented `.srt`/`.vtt` cues into coherent timestamped transcripts.

**Approach:**
1. **Domain Schemas (`packages/core/src/domain/models.ts`)**:
   - Extend `DataSourceTypeSchema` to include `'audio'`, `'video'`, and `'youtube'`.
   - Define `SttProviderSchema` (`'openai' | 'gemini' | 'whisper-local'`), `MediaExtractionModeSchema` (`'subtitles' | 'stt' | 'auto'`), `TimestampRangeSchema` (`{ start: string; end: string; label?: string }`), and `MediaSourceItemSchema` (`{ uri, title?, extractionMode, subtitlePath?, sttProvider?, timestampRanges? }`).
   - Provide helper `parseMediaSourceItems(uri: string)` supporting both structured JSON item arrays and legacy bare path/URL arrays.
   - Add optional `startSeconds` and `endSeconds` fields to `CleanTextDocument` and `DiscoveredDocumentSchema`.
2. **SQLite Schema & Safe Migration (`packages/core/src/storage/schema.sql`, `db.ts`, `document-repository.ts`)**:
   - Update `data_sources` `CHECK` constraint to allow `audio`, `video`, and `youtube` (plus `notion` if missing in base `schema.sql`), and implement an idempotent startup migration rebuilding/altering legacy databases without data loss.
   - Add `start_seconds INTEGER DEFAULT NULL` and `end_seconds INTEGER DEFAULT NULL` columns to `documents` with safe `ALTER TABLE` migration checks.
3. **Multi-Format Subtitle Parser (`packages/core/src/services/subtitle-parser.ts` or `@flashcard-master/adapters`)**:
   - Parse `.srt` (SubRip) and `.vtt` (WebVTT) content into structured cues `{ startSeconds, endSeconds, text }[]`, stripping formatting tags (`<i>`, `<b>`, `<c>`, `<v>`), WebVTT headers (`WEBVTT`, `NOTE`, `STYLE`, `REGION`), and overlapping/duplicate rolling caption lines.
   - Implement smart cue coalescing (`coalesceCues`) merging short 2–3 second cues into sentence/paragraph blocks (configurable max gap/duration/chars) formatted as `[MM:SS - MM:SS] <text>` (or `[HH:MM:SS - HH:MM:SS]` when `>= 1h`).

## Boundaries & Constraints

**Always:**
- Preserve 100% backward compatibility with existing SQLite databases and existing data source types.
- Handle malformed `.srt`/`.vtt` lines gracefully without crashing on partial timestamps or BOM prefixes.
- Export all new schemas, types, and subtitle helpers cleanly from package entrypoints.

**Never:**
- Never break existing `documents` queries or drop user data during SQLite migration.
- Never alter existing `startPage`/`endPage` behavior for PDF/EPUB documents.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Add `audio`, `video`, `youtube` to `DataSourceTypeSchema`; add `SttProviderSchema`, `MediaExtractionModeSchema`, `TimestampRangeSchema`, `MediaSourceItemSchema`, `parseMediaSourceItems()`, and `startSeconds`/`endSeconds` on document interfaces/schemas.
- [x] `packages/core/src/storage/schema.sql` & `db.ts` -- Update `data_sources` type constraint, add `start_seconds`/`end_seconds` to `documents`, and write idempotent migration logic for existing SQLite databases.
- [x] `packages/core/src/storage/document-repository.ts` -- Persist and hydrate `startSeconds` and `endSeconds` in document CRUD/query methods.
- [x] `packages/core/src/services/subtitle-parser.ts` -- Implement `.srt` and `.vtt` parser, timestamp parser/formatter (`parseTimestampToSeconds`, `formatTimestamp`), and smart cue coalescing into `[MM:SS - MM:SS]` text blocks.
- [x] Unit tests -- Verify SQLite migration on an existing database, `MediaSourceItemSchema` parsing, `.srt`/`.vtt` parsing edge cases, rolling duplicate deduplication, and cue coalescing.

**Acceptance Criteria:**
- `DataSourceTypeSchema` and SQLite `data_sources` `CHECK` constraint accept `audio`, `video`, and `youtube` cleanly, with non-destructive migration for existing databases.
- `MediaSourceItemSchema` parses both structured per-item JSON arrays and backward-compatible bare path/URL arrays.
- `documents` table and `DiscoveredDocumentSchema` persist optional `startSeconds` and `endSeconds` coordinates.
- `SubtitleParser` accurately parses `.srt` and `.vtt` files (stripping tags, `NOTE`/`STYLE` headers, and overlapping rolling lines) and coalesces fragmented cues into coherent timestamped blocks.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors across all packages.
- `npm test` -- expected: all unit tests pass including SQLite migration and subtitle parser suites.

