---
title: 'Story 2.1: LLM Provider Port & Vendor Adapters'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '106aacc991fb103769408e1dbc98c3663cf3f0f2'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/epic-1-retro-2026-08-30.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** To support flexible AI backends without vendor lock-in, the system needs vendor-neutral LLM adapters implementing `LLMProviderPort` for OpenAI, Google Gemini, Anthropic, and local Ollama, requesting structured JSON responses with robust error handling and timeout controls.

**Approach:** Implement concrete adapters (`OpenAIAdapter`, `GeminiAdapter`, `AnthropicAdapter`, `OllamaAdapter`) and a unified `LLMAdapterFactory` in `packages/adapters/src/llm/`, utilizing standard HTTP fetch with JSON schema prompting, custom timeout/abort controllers, and unit test suites with mock fetch handlers.

## Boundaries & Constraints

**Always:**
- Conforming strictly to `LLMProviderPort` from `@flashcard-master/core`.
- Request structured JSON output containing `question`, `answer`, and `sourceQuote` fields.
- Validate and parse LLM responses through Zod schemas before returning `CardGenerationDraft[]`.
- Support configurable model names, base URLs (for self-hosted / Ollama), and API keys.
- Enforce request timeouts (default 30s) and catch rate-limiting (HTTP 429), authentication (HTTP 401/403), and connection errors with descriptive domain error classes (`LLMAuthenticationError`, `LLMRateLimitError`, `LLMResponseParsingError`).

**Ask First:**
- Adding streaming card generation in v1 (batch structured response is standard for v1).

**Never:**
- Hardcode API keys or secret tokens in source files or defaults.
- Transmit user documents to third-party endpoints other than the user's explicitly configured LLM provider (NFR-202).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OpenAI Success | Text + valid API key | Parses JSON array into `CardGenerationDraft[]` | N/A |
| Gemini Success | Text + valid Gemini key | Parses JSON response into `CardGenerationDraft[]` | N/A |
| Anthropic Success | Text + valid Claude key | Parses JSON response into `CardGenerationDraft[]` | N/A |
| Ollama Local Success | Text + `http://localhost:11434` | Parses local JSON response into `CardGenerationDraft[]` | N/A |
| Invalid API Key (401) | Rejected API key | Throws structured error | Throws `LLMAuthenticationError` |
| Rate Limited (429) | HTTP 429 Too Many Requests | Throws structured error | Throws `LLMRateLimitError` |
| Malformed JSON from LLM | LLM returns non-JSON text | Attempts recovery or throws error | Throws `LLMResponseParsingError` |

</frozen-after-approval>

## Code Map

- `packages/core/src/ports/index.ts` -- `LLMProviderPort`, `CardGenerationDraft`
- `packages/adapters/src/llm/types.ts` -- LLM configuration types and error hierarchy
- `packages/adapters/src/llm/openai-adapter.ts` -- `OpenAIAdapter`
- `packages/adapters/src/llm/gemini-adapter.ts` -- `GeminiAdapter`
- `packages/adapters/src/llm/anthropic-adapter.ts` -- `AnthropicAdapter`
- `packages/adapters/src/llm/ollama-adapter.ts` -- `OllamaAdapter`
- `packages/adapters/src/llm/llm-factory.ts` -- `createLLMAdapter` factory
- `packages/adapters/src/index.ts` -- Re-export LLM adapters and factory
- `packages/adapters/test/llm-adapters.test.ts` -- Unit tests for all adapters with mock HTTP responses

## Tasks & Acceptance

**Execution:**
- [x] `packages/adapters/src/llm/types.ts` -- Define `LLMConfig` schemas, `CardGenerationDraftSchema`, and domain error hierarchy
- [x] `packages/adapters/src/llm/openai-adapter.ts` -- Implement `OpenAIAdapter` with structured JSON prompting
- [x] `packages/adapters/src/llm/gemini-adapter.ts` -- Implement `GeminiAdapter` with response schema
- [x] `packages/adapters/src/llm/anthropic-adapter.ts` -- Implement `AnthropicAdapter`
- [x] `packages/adapters/src/llm/ollama-adapter.ts` -- Implement `OllamaAdapter` for local offline generation
- [x] `packages/adapters/src/llm/llm-factory.ts` -- Implement `createLLMAdapter` factory
- [x] `packages/adapters/src/index.ts` -- Export LLM adapters and factory
- [x] `packages/adapters/test/llm-adapters.test.ts` -- Unit tests verifying request formatting, response parsing, error mapping, and timeout handling for each provider

**Acceptance Criteria:**
- **Given** a valid text document and provider adapter
- **When** `adapter.generateQAPairs(text, options)` is executed
- **Then** a list of validated `CardGenerationDraft[]` objects is returned with questions, answers, and source quotes.
- **Given** an HTTP 401 or 429 response from an LLM endpoint
- **When** the adapter executes
- **Then** `LLMAuthenticationError` or `LLMRateLimitError` is thrown with descriptive advice.

## Verification

**Commands:**
- `npm test -w @flashcard-master/adapters` -- expected: All LLM adapter tests pass with 100% mocked coverage.
- `npm run build` -- expected: All workspace packages compile cleanly with zero TypeScript errors.



## Suggested Review Order

**LLM Adapter Types & Error Hierarchy**

- Error classes, JSON draft schema validation, and config types
  [packages/adapters/src/llm/types.ts#L1](../../packages/adapters/src/llm/types.ts#L1)

**Vendor Adapters & Factory**

- OpenAI structured output adapter
  [packages/adapters/src/llm/openai-adapter.ts#L1](../../packages/adapters/src/llm/openai-adapter.ts#L1)
- Google Gemini responseSchema adapter
  [packages/adapters/src/llm/gemini-adapter.ts#L1](../../packages/adapters/src/llm/gemini-adapter.ts#L1)
- Anthropic Claude messages adapter
  [packages/adapters/src/llm/anthropic-adapter.ts#L1](../../packages/adapters/src/llm/anthropic-adapter.ts#L1)
- Local offline Ollama adapter
  [packages/adapters/src/llm/ollama-adapter.ts#L1](../../packages/adapters/src/llm/ollama-adapter.ts#L1)
- Unified factory instantiation
  [packages/adapters/src/llm/llm-factory.ts#L1](../../packages/adapters/src/llm/llm-factory.ts#L1)

**Unit Test Suite**

- Mocked unit tests for all 4 LLM providers and error mappings
  [packages/adapters/test/llm-adapters.test.ts#L1](../../packages/adapters/test/llm-adapters.test.ts#L1)


### Review Findings

- [x] [Review][Patch] Strip markdown code fences before JSON.parse across OpenAI, Gemini, and Ollama adapters [packages/adapters/src/llm/openai-adapter.ts:80]

