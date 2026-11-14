---
title: 'Story 21.5: Timestamp Slicing Engine, Citation Deep-Linking & Timestamp-Aware `GroundingGuard`'
type: 'feature'
created: '2026-11-14'
status: 'ready-for-dev'
baseline_commit: '3b74d42'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-21-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Long podcasts, video lectures, and YouTube talks need to be sliced by timestamp into study-sized subdocuments—either using per-item custom timestamp ranges (`start - end`) or automatic fixed `N`-minute intervals / YouTube chapters. Additionally, flashcards generated from media transcripts must cite exact audio/video timestamps (`sourceLocator` + deep-linked YouTube URL `?t=<seconds>s`), and `GroundingGuard` must not reject valid verbatim spoken quotes simply because inline `[MM:SS - MM:SS]` timestamp markers appear between coalesced blocks.

**Approach:**
1. **Timestamp Slicing in `DocumentSlicingEngine` (`packages/core/src/services/document-slicing-engine.ts`)**:
   - Add timestamp slicing options: `mode: 'timestamps' | 'chapters' | ...`, `minutesPerChunk` (e.g., 5, 10, 15 min), and per-item custom `timestampRanges`.
   - Slice transcripts along custom `timestampRanges` boundaries (e.g., `Segment 1: 02:30 - 14:00`), fixed `minutesPerChunk` windows (aligning cleanly to nearest cue/sentence boundary so speech isn't split mid-word), or detected chapter headings (`<!-- chapter: ... -->` / `## Chapter`).
   - Populate `startSeconds` and `endSeconds` on each resulting `SlicedSubdocument` and compute deterministic IDs + content hashes.
2. **Timestamp Prompting & YouTube Citation Deep-Linking (`PromptBuilder`, `CardGenerationService`)**:
   - When generating from media subdocuments (transcripts containing `[MM:SS` markers or `startSeconds != null`), instruct the LLM via `PromptBuilder` to populate `sourceLocator` with the closest `[MM:SS - MM:SS]` timestamp range and preserve clean spoken words in `sourceQuote`.
   - Implement a helper (`appendTimestampToMediaUrl(originUrl, sourceLocator, fallbackStartSeconds)`) that appends `?t=<seconds>s` (or `&t=<seconds>s`) to YouTube URLs on saved `Flashcard.sourceOriginUrl`.
3. **Timestamp-Aware `GroundingGuard` (`packages/core/src/services/grounding-guard.ts`)**:
   - Update `GroundingGuard.normalizeText()` to strip inline `[MM:SS]`, `[HH:MM:SS]`, and `[MM:SS - MM:SS]` timestamp markers before whitespace normalization so verbatim quotes spanning cue/block boundaries match `sourceText` reliably.

## Boundaries & Constraints

**Always:**
- Preserve all existing `DocumentSlicingEngine` behaviors for `'outline'`, `'budget'`, and `'none'` modes on text/PDF/EPUB documents.
- Keep `GroundingGuard` strict on actual quote fidelity—only strip structured timestamp markers and normalize whitespace/punctuation.
- Handle both `youtube.com/watch?v=...` (using `&t=...s`) and `youtu.be/...` (using `?t=...s`) cleanly without duplicating existing `t=` query params.

**Never:**
- Never alter or relax `GroundingGuard` minimum quote length or fallback requirements for non-timestamp text.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/services/document-slicing-engine.ts` -- Add timestamp slicing modes (custom ranges, fixed `N`-minute intervals, and chapters), cue-boundary snapping, and `startSeconds`/`endSeconds` propagation.
- [ ] `packages/core/src/services/grounding-guard.ts` -- Strip inline timestamp markers (`[MM:SS]`, `[HH:MM:SS]`, `[MM:SS - MM:SS]`) inside `normalizeText()`.
- [ ] `packages/core/src/services/prompt-builder.ts` & `card-generation-service.ts` -- Add media timestamp citation prompt guidance and deep-link YouTube `sourceOriginUrl` (`?t=<seconds>s` / `&t=<seconds>s`) from `sourceLocator`.
- [ ] Unit tests -- Test custom timestamp slicing, `N`-minute interval slicing, chapter slicing, YouTube URL timestamp deep-linking, and `GroundingGuard` cross-cue verification.

**Acceptance Criteria:**
- `DocumentSlicingEngine` slices timestamped transcripts by custom timestamp ranges, fixed `N`-minute intervals, or chapter markers, setting `startSeconds` and `endSeconds` on subdocuments.
- Generated flashcards from media subdocuments capture timestamp ranges in `sourceLocator`, and YouTube flashcards include `?t=<seconds>s` / `&t=<seconds>s` deep-link parameters on `sourceOriginUrl`.
- `GroundingGuard.normalizeText()` strips inline timestamp markers so verbatim spoken excerpts spanning multiple subtitle cues verify accurately.
- Unit tests cover timestamp slicing boundaries, YouTube deep-link formatting, and `GroundingGuard` cross-cue quote matching.

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 TypeScript errors.
- `npm test` -- expected: all `DocumentSlicingEngine`, `GroundingGuard`, and `CardGenerationService` unit tests pass.

