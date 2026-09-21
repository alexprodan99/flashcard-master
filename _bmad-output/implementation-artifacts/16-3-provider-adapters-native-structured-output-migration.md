---
title: 'Provider Adapters Native Structured Output Migration'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: 'f676c41e52acfd8545888aa061c9ddf76d63a7a7'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-16-context.md
  - _bmad-output/specs/spec-structured-responses/SPEC.md
  - _bmad-output/specs/spec-structured-responses/dialects.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Provider adapters (`GeminiAdapter`, `OpenAIAdapter`, `AnthropicAdapter`, `OllamaAdapter`) currently rely on prompt-based natural-language JSON formatting requests and brittle regex/heuristics parsers (`parseCardDraftsFromJson`) to extract flashcards. This causes parse failures on complex text, burns prompt tokens with redundant formatting instructions, and requires fragile quote escaping and regex gymnastics.

**Approach:** Refactor all four provider adapters to transmit compiled native structured output schemas using `DialectCompiler` from `@flashcard-master/core` and extract structured outputs directly from provider responses (direct `JSON.parse` or Anthropic `tool_use.input`) without regex matching or markdown fence stripping. Clean adapter prompts to remove prompt-level JSON formatting schemas and quote escaping rules.

## Boundaries & Constraints

**Always:**
- Use `DialectCompiler` (`@flashcard-master/core`) to generate provider dialect schemas:
  - Gemini: `generationConfig.responseMimeType = "application/json"` and `generationConfig.responseSchema = DialectCompiler.toGeminiBatchSchema()`.
  - OpenAI: `response_format = DialectCompiler.toOpenAIBatchSchema()`.
  - Anthropic: `tools = [DialectCompiler.toAnthropicBatchTool()]` and `tool_choice = DialectCompiler.toAnthropicToolChoice()`.
  - Ollama: `format = DialectCompiler.toOllamaBatchSchema()`.
- Parse response payloads directly without regex cleaners (`cleanJsonString`, `sanitizeJsonString`, `extractCardsWithRegex`):
  - Gemini: Parse JSON text directly from candidate content parts (filtering out thought parts).
  - OpenAI: Parse JSON text directly from `choices[0].message.content`, reading the `.cards` array.
  - Anthropic: Extract directly from `tool_use.input.cards` (with fallback to text content if tool_use is not present in mock tests).
  - Ollama: Parse JSON text directly from `message.content`.
- Return `CardGenerationDraft[]` populated with `question`, `answer`, `sourceQuote`, `citation`, `difficulty`, `keywords`, and `sourceLocator`.
- Maintain existing error taxonomy: `LLMAuthenticationError`, `LLMRateLimitError`, `LLMNetworkError`, and `LLMResponseParsingError`.
- Preserve custom timeout and custom fetch options.

**Ask First:**
- Modifying `LLMProviderPort` interface or changing public method signatures on adapters.

**Never:**
- Call legacy regex/heuristics cleaners in adapter execution paths.
- Add external runtime dependencies or sidecars.
- Break existing test suite expectations for provider adapters.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gemini Generation | Source document text + prompt options | Request includes `responseSchema`; parses JSON array; returns `CardGenerationDraft[]` | Throws `LLMResponseParsingError` on syntax error or safety/recitation block |
| OpenAI Generation | Source document text + prompt options | Request includes `response_format.json_schema`; parses `content.cards`; returns `CardGenerationDraft[]` | Throws `LLMResponseParsingError` on empty content or malformed JSON |
| Anthropic Generation | Source document text + prompt options | Request includes `tools` and forced `tool_choice`; extracts `tool_use.input.cards`; returns `CardGenerationDraft[]` | Throws `LLMResponseParsingError` if neither tool_use nor text content is present |
| Ollama Generation | Source document text + prompt options | Request includes `format: <JsonSchema>`; parses `message.content`; returns `CardGenerationDraft[]` | Throws `LLMResponseParsingError` on syntax error or empty response |
| Thought Parts (Gemini) | Response contains `{ thought: true, text: "..." }` and card JSON | Filters out thought parts, parses text part cleanly | Throws `LLMResponseParsingError` if only thoughts are returned |
| Mixed Difficulty | `difficulty: "mixed"` option passed | Prompt instructs balanced progression; card draft retains difficulty assigned by model | Defaults to "intermediate" if omitted |

</frozen-after-approval>

## Code Map

- `packages/adapters/src/llm/gemini-adapter.ts` -- Gemini adapter refactored to use `DialectCompiler.toGeminiBatchSchema()` and direct JSON parsing.
- `packages/adapters/src/llm/openai-adapter.ts` -- OpenAI adapter refactored to use `DialectCompiler.toOpenAIBatchSchema()` and direct JSON parsing of `{ cards: [...] }`.
- `packages/adapters/src/llm/anthropic-adapter.ts` -- Anthropic adapter refactored to use `DialectCompiler.toAnthropicBatchTool()` / `toAnthropicToolChoice()` and direct `tool_use.input` extraction.
- `packages/adapters/src/llm/ollama-adapter.ts` -- Ollama adapter refactored to use `DialectCompiler.toOllamaBatchSchema()` and direct JSON parsing.
- `packages/adapters/test/llm-adapters.test.ts` -- Test suite updated to verify dialect schemas in request payloads and native output extraction across all four providers.

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/llm/gemini-adapter.ts` -- Integrate `DialectCompiler.toGeminiBatchSchema()`, simplify prompt to remove schema/escaping instructions, parse candidate text directly into `CardGenerationDraft[]` without `parseCardDraftsFromJson`.
- [x] `packages/adapters/src/llm/openai-adapter.ts` -- Integrate `DialectCompiler.toOpenAIBatchSchema()`, simplify prompt, parse `choices[0].message.content` directly from `{ cards: [...] }` without `parseCardDraftsFromJson`.
- [x] `packages/adapters/src/llm/anthropic-adapter.ts` -- Integrate `DialectCompiler.toAnthropicBatchTool()` and `toAnthropicToolChoice()`, extract cards from `tool_use.input.cards` (with fallback for text parts in legacy tests), simplify prompt without `parseCardDraftsFromJson`.
- [x] `packages/adapters/src/llm/ollama-adapter.ts` -- Integrate `DialectCompiler.toOllamaBatchSchema()` in `format` field, simplify prompt, parse `message.content` directly without `parseCardDraftsFromJson`.
- [x] `packages/adapters/test/llm-adapters.test.ts` -- Add/update unit tests verifying that requests carry native schema dialects (Gemini `responseSchema`, OpenAI `response_format`, Anthropic `tools`/`tool_choice`, Ollama `format`) and parse valid responses.

**Acceptance Criteria:**
- Given a call to `GeminiAdapter.generateQAPairs()`, when the request is sent, then `generationConfig` includes `responseSchema` compiled from `CardGenerationDraftSchema`, and response is parsed directly without calling `parseCardDraftsFromJson`.
- Given a call to `OpenAIAdapter.generateQAPairs()`, when the request is sent, then `response_format` includes the strict `json_schema` batch definition, and response is parsed from `cards` property directly without `parseCardDraftsFromJson`.
- Given a call to `AnthropicAdapter.generateQAPairs()`, when the request is sent, then `tools` and `tool_choice` configure `emit_flashcards`, and response is extracted from `tool_use.input.cards` directly without `parseCardDraftsFromJson`.
- Given a call to `OllamaAdapter.generateQAPairs()`, when the request is sent, then `format` carries the compiled batch JSON schema, and response is parsed directly without `parseCardDraftsFromJson`.
- All unit tests in `packages/adapters` pass cleanly.

## Spec Change Log

_None._

## Design Notes

Each adapter transitions from string-based regex parsing to direct typed object extraction:
1. Prompts no longer contain markdown code block instructions or JSON syntax examples, saving prompt tokens.
2. Grounding instruction remains: `CRITICAL GROUNDING RULE: For each card, copy and paste an EXACT, word-for-word sentence from the provided text into "citation". Do NOT paraphrase, edit, or summarize any words in "citation".`
3. Response mapping normalizes `citation` and `sourceQuote` symmetrically so that downstream code expecting either field receives the correct citation text.
4. If an LLM returns invalid JSON syntax, an `LLMResponseParsingError` is thrown directly with the raw response attached, fulfilling CAP-1 and CAP-5.
5. All adapters properly clean up abort timeout timers in `finally` blocks and classify direct fetch connection rejections as `LLMNetworkError`.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All adapter unit tests pass (193 tests).
- `npm run typecheck` -- expected: Monorepo compiles cleanly with 0 TypeScript errors.

## Suggested Review Order

1. **Common Structured Output Extractor:**
   - [`packages/adapters/src/llm/types.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/types.ts): Inspect `parseStructuredCardDrafts`, verifying robust direct parsing, blank card filtering, keywords normalization, and symmetrical `citation`/`sourceQuote` population.

2. **Provider Adapters Migration:**
   - [`packages/adapters/src/llm/gemini-adapter.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/gemini-adapter.ts): Inspect `DialectCompiler.toGeminiBatchSchema()`, prompt cleanup, and text parts parsing.
   - [`packages/adapters/src/llm/openai-adapter.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/openai-adapter.ts): Inspect `response_format` with `toOpenAIBatchSchema()`, prompt cleanup, and `{ cards: [...] }` extraction.
   - [`packages/adapters/src/llm/anthropic-adapter.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/anthropic-adapter.ts): Inspect `tools` with `toAnthropicBatchTool()`, `tool_choice`, and `tool_use.input` extraction.
   - [`packages/adapters/src/llm/ollama-adapter.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/src/llm/ollama-adapter.ts): Inspect `format` with `toOllamaBatchSchema()` and direct parsing.

3. **Monorepo Test Suites:**
   - [`packages/adapters/test/llm-adapters.test.ts`](file:///C:/Users/aprodan/Workspace/Projects/flashcard-master/packages/adapters/test/llm-adapters.test.ts): Inspect dialect schema request checks, `parseStructuredCardDrafts` unit tests, and network error resilience tests.
