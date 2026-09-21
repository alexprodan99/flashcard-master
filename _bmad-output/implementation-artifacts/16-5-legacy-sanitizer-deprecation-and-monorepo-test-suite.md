---
title: 'Legacy Sanitizer Deprecation & Monorepo Test Suite'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: 'd7ea436a8763845524e542b50d3bb902f85a943b'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-16-context.md
  - _bmad-output/specs/spec-structured-responses/SPEC.md
  - _bmad-output/specs/spec-structured-responses/dialects.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** With provider adapters transitioned to native structured outputs (Epic 16, Stories 16.1–16.4), the codebase still carries legacy string heuristics, regex cleaners, thinking-tag strippers, quote-sanitization algorithms, and multi-hop repair loops in `packages/adapters/src/llm/types.ts`. These routines add dead code weight, create maintenance confusion, and run contrary to CAP-5 of the structured response specification.

**Approach:** Completely remove all legacy string heuristics and regex parsing routines from `packages/adapters/src/llm/types.ts` (`cleanJsonString`, `isClosingQuote`, `sanitizeJsonString`, `extractJsonObjects`, `repairJsonString`, `extractFlexCard`, `extractCardsDeep`, `extractCardFromRegexBlock`, `extractCardsWithRegex`, `parseXmlCards`, `parseMarkdownQAPairs`, `parseCardDraftsFromJson`). Streamline `parseStructuredCardDrafts` to rely exclusively on strict JSON parsing and deterministic token limit recovery. Update `packages/adapters/test/llm-adapters.test.ts` to retire legacy regex tests and expand native structured parsing coverage. Run complete monorepo verification across all workspaces (`core`, `adapters`, `web`, `cli`).

## Boundaries & Constraints

**Always:**
- Eliminate all legacy regex string cleaners, markdown fence strippers, and quote heuristics from `packages/adapters/src/llm/types.ts`.
- Retain standard error classes (`LLMAuthenticationError`, `LLMRateLimitError`, `LLMResponseParsingError`, `LLMNetworkError`).
- Retain `tryRecoverTruncatedJson` and `parseStructuredCardDrafts` with deterministic token cutoff retention (CAP-4).
- Ensure all 4 provider adapters (`GeminiAdapter`, `OpenAIAdapter`, `AnthropicAdapter`, `OllamaAdapter`) pass 100% of their test suites.
- Run complete monorepo verification: `npm run typecheck` and `npm test` across all packages (`@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/web`, `@flashcard-master/cli`).

**Ask First:**
- Adding or removing external npm dependencies.

**Never:**
- Re-introduce markdown fence strippers or regex heuristics into `parseStructuredCardDrafts`.
- Break backward compatibility of `CardGenerationDraft` or `LLMConfig` interfaces.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid Structured JSON | Raw JSON string: `{"cards": [{"question": "Q", "answer": "A", "keywords": ["k"]}]}` | Directly parsed into `CardGenerationDraft[]` with `keywords`, `sourceLocator`, `citation` intact | N/A |
| Pre-parsed Object | Structured JS object from Anthropic tool use: `{ cards: [...] }` | Direct property mapping into `CardGenerationDraft[]` | N/A |
| Non-JSON Malformed String | Plain text string with no valid JSON: `I am unable to generate cards.` | Fails first-pass parse; recovery yields null; throws `LLMResponseParsingError` | Throws `LLMResponseParsingError` with raw text |
| Truncated Token Cutoff | Abruptly truncated JSON: `{"cards": [{"question": "Q1", "answer": "A1"}, {"question": "Q2"` | `tryRecoverTruncatedJson` recovers Q1; flags `isPartial = true` | Valid drafts returned with partial flag |
| Monorepo Test Verification | Full test suite execution across all workspaces | Core (153), Adapters (185), Web (148), CLI (6) tests pass cleanly | All tests pass |

</frozen-after-approval>

## Code Map

- `packages/adapters/src/llm/types.ts` -- Remove `cleanJsonString`, `isClosingQuote`, `sanitizeJsonString`, `extractJsonObjects`, `repairJsonString`, `extractFlexCard`, `extractCardsDeep`, `extractCardFromRegexBlock`, `extractCardsWithRegex`, `parseXmlCards`, `parseMarkdownQAPairs`, and `parseCardDraftsFromJson`. Streamline `parseStructuredCardDrafts` and `tryRecoverTruncatedJson` without regex strip passes.
- `packages/adapters/test/llm-adapters.test.ts` -- Remove obsolete `parseCardDraftsFromJson (Resilience & Auto-Repair)` suite; ensure thorough test coverage for `parseStructuredCardDrafts`, truncated token cutoff recovery, schema mismatch handling, and all adapter integrations.
- `packages/adapters/src/llm/index.ts` (if applicable) -- Ensure exports are clean and do not reference deleted legacy functions.

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/llm/types.ts` -- Remove all legacy sanitizer functions, regex extractors, XML parsers, markdown parsers, and repair passes.
- [x] `packages/adapters/src/llm/types.ts` -- Clean `parseStructuredCardDrafts` to use strict JSON parsing without markdown fence stripping regex.
- [x] `packages/adapters/test/llm-adapters.test.ts` -- Retire legacy regex/sanitization test blocks; add comprehensive native structured response and error verification tests.
- [x] Monorepo verification -- Run `npm test -w @flashcard-master/core`, `npm test -w @flashcard-master/adapters`, `npm test -w @flashcard-master/web`, `npm test -w @flashcard-master/cli`.
- [x] Type check -- Run `npm run typecheck` across all workspaces with zero errors.

**Acceptance Criteria:**
- Given `packages/adapters/src/llm/types.ts`, when inspected, zero regex string cleaners, markdown fence strippers, XML extractors, or quote heuristics exist.
- All 4 provider adapters rely exclusively on native provider schema enforcement and direct structured parsing.
- All monorepo packages compile cleanly with zero TypeScript errors (`npm run typecheck`).
- All monorepo test suites pass cleanly (`npm test`).

## Spec Change Log

_None._

## Design Notes

1. **CAP-5 Compliance:**
   CAP-5 explicitly requires zero regex cleaners, markdown fence strippers, thinking tag removers, or syntax repair retry loops in the adapters codebase. Deleting these routines achieves 100% compliance and eliminates ~550 lines of complex heuristic code.
2. **Deterministic Token Truncation Retention:**
   `tryRecoverTruncatedJson` is retained as a specialized fallback for CAP-4 (token limit cutoffs). It does not use regex heuristics or string cleaners; it scans backwards for complete JSON object braces `}` and attempts valid JSON completions (`]}` or `]`).

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter tests pass.
- `npm test -w @flashcard-master/core` -- expected: All core tests pass.
- `npm test -w @flashcard-master/web` -- expected: All web tests pass.
- `npm test -w @flashcard-master/cli` -- expected: All CLI tests pass.
- `npm run typecheck` -- expected: Monorepo compiles cleanly with 0 errors.

## Suggested Review Order

1. [`packages/adapters/src/llm/types.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/types.ts): Verify elimination of legacy sanitizers and clean structure of `parseStructuredCardDrafts`.
2. [`packages/adapters/test/llm-adapters.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/test/llm-adapters.test.ts): Verify updated test suite reflecting native structured outputs.
3. Monorepo test output and typecheck logs.
