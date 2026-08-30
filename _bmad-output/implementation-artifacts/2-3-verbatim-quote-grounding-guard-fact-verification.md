---
title: 'Story 2.3: Verbatim Quote Grounding Guard & Fact Verification'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'a3f06d1eab77c2035deff74ece1560742c057134'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/2-2-atomic-front-back-flashcard-prompting-pipeline.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** LLMs can hallucinate answers, misquote sources, or fabricate citations. To prevent inaccurate cards from polluting the user's study decks, every card must be strictly validated against the verbatim source document text (FR-202, AD-5).

**Approach:** Implement `GroundingGuard` in `packages/core/src/services/grounding-guard.ts` providing exact and normalized substring verification (handling whitespace variance, curly quotes, and unicode dashes), enforcing minimum citation lengths, and discarding cards that fail factual citation matching.

## Boundaries & Constraints

**Always:**
- Verify `draft.sourceQuote` against `sourceText`.
- Support both exact substring matching and normalized matching (collapsing whitespace, stripping outer quotation marks, normalizing curly quotes and unicode dashes).
- Require a minimum quote length (default: >= 15 characters) to reject trivial or ambiguous single-word citations.
- Return structured `GroundingVerificationResult` with boolean `isValid`, `matchedQuote`, `failureReason`, and `matchConfidence`.
- Provide `filterValidDrafts(drafts, sourceText)` to filter out ungrounded cards cleanly.

**Ask First:**
- Adding fuzzy Levenshtein distance matching (standard spec requires exact/normalized substring verification to guarantee factual grounding without hallucinations).

**Never:**
- Allow a card with a fabricated, altered, or missing citation to pass verification.
- Modify the original document text during validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Verbatim Exact Match | Exact sentence present in source | `isValid: true`, `matchConfidence: 1.0` | N/A |
| Whitespace / Quote Variations | Quote has `“curly quotes”` or `\n`, source has `"straight quotes"` or spaces | `isValid: true`, `matchConfidence: 0.95+` (normalized match) | N/A |
| Fabricated / Altered Quote | Quote contains hallucinated words | `isValid: false`, `failureReason: "Quote not found in source text"` | Discards card |
| Short / Trivial Quote (< 15 chars) | Quote is `"Yes."` or `"SQLite"` | `isValid: false`, `failureReason: "Quote too short for verification"` | Discards card |
| Empty Source or Quote | Empty string | `isValid: false` | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `CleanTextDocument`, `Flashcard`
- `packages/core/src/ports/index.ts` -- `CardGenerationDraft`
- `packages/core/src/services/grounding-guard.ts` -- `GroundingGuard` verification service
- `packages/core/src/services/card-generation-service.ts` -- Integration with `GroundingGuard`
- `packages/core/src/index.ts` -- Export `GroundingGuard` and `GroundingVerificationResult`
- `packages/core/test/grounding-guard.test.ts` -- Unit tests verifying exact, normalized, whitespace, curly quote, and hallucination rejection scenarios

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/grounding-guard.ts` -- Implement `GroundingGuard` (exact & normalized matching, minimum length check)
- [x] `packages/core/src/services/card-generation-service.ts` -- Integrate optional grounding verification filter
- [x] `packages/core/src/index.ts` -- Export `GroundingGuard` and verification interfaces
- [x] `packages/core/test/grounding-guard.test.ts` -- Unit tests covering exact match, normalized punctuation, unicode dashes, and hallucination rejection

**Acceptance Criteria:**
- **Given** a generated card draft with a verbatim quote from the text
- **When** `GroundingGuard.verifyDraft(draft, text)` is called
- **Then** `isValid: true` is returned.
- **Given** a generated card draft with a hallucinated quote not present in the text
- **When** `GroundingGuard.verifyDraft(draft, text)` is called
- **Then** `isValid: false` is returned with a descriptive failure reason.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All core unit tests pass including grounding guard suite.
- `npm run build` -- expected: All workspace packages compile cleanly.



## Suggested Review Order

**Grounding Guard Service**

- 3-tier verbatim verification algorithm (exact, unquoted, normalized unicode/whitespace)
  [packages/core/src/services/grounding-guard.ts#L1](../../packages/core/src/services/grounding-guard.ts#L1)

- Generation pipeline integration with grounding filter
  [packages/core/src/services/card-generation-service.ts#L52](../../packages/core/src/services/card-generation-service.ts#L52)

**Unit Test Suite**

- Grounding guard verification and hallucination rejection tests
  [packages/core/test/grounding-guard.test.ts#L1](../../packages/core/test/grounding-guard.test.ts#L1)
