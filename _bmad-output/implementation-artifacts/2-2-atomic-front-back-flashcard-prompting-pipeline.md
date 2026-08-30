---
title: 'Story 2.2: Atomic Front/Back Flashcard Prompting Pipeline'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: '50cc87ccce5a590857cead3d96d0507ef09fa9d5'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/2-1-llm-provider-port-vendor-adapters.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Raw clean documents can be lengthy and unfocused. Without intelligent chunking and strict prompt engineering enforcing the Minimum Information Principle, generated flashcards become bloated, cover multiple concepts simultaneously, or exceed model token limits.

**Approach:** Implement `TextChunker` in `packages/core/src/services/text-chunker.ts`, `PromptBuilder` in `packages/core/src/services/prompt-builder.ts`, and `CardGenerationService` in `packages/core/src/services/card-generation-service.ts` to chunk documents along paragraph boundaries, apply atomic Q&A prompt templates, and orchestrate `LLMProviderPort` calls into structured card generation drafts.

## Boundaries & Constraints

**Always:**
- Chunk text along natural paragraph / sentence boundaries (default chunk size: ~2000 characters, overlap: ~200 characters).
- Enforce the Minimum Information Principle in system prompts: each card must test one atomic concept with active recall.
- Require `sourceQuote` for every generated card.
- Aggregate card drafts across document chunks and attach source document metadata (`sourceId`, `originUrl`, `documentTitle`).
- Provide fault isolation across chunks: if one chunk fails LLM generation, continue processing remaining chunks and return successfully generated cards.

**Ask First:**
- Dynamically adjusting chunk size based on tokenizers (character-based sliding window with paragraph awareness is standard for v1).

**Never:**
- Allow prompt templates to generate non-atomic compound cards ("List all 10 reasons why...").
- Drop document provenance metadata during generation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Short Document (< 2000 chars) | Single clean document | Produces 1 chunk, calls LLM once, returns drafts | N/A |
| Long Document (> 6000 chars) | Multi-page clean document | Splits into 3+ overlapping chunks, calls LLM per chunk, aggregates drafts | N/A |
| Empty / Whitespace Document | Empty string | Returns empty array without invoking LLM | Graceful no-op |
| Partial LLM Failure on Chunk | Chunk 2 of 3 fails with rate limit | Logs warning, aggregates drafts from Chunks 1 and 3 | Isolates chunk errors |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `CleanTextDocument`, `DifficultyLevel`, `PersonaType`
- `packages/core/src/ports/index.ts` -- `LLMProviderPort`, `CardGenerationDraft`
- `packages/core/src/services/text-chunker.ts` -- `TextChunker` implementation
- `packages/core/src/services/prompt-builder.ts` -- `PromptBuilder` with Minimum Information Principle guidelines
- `packages/core/src/services/card-generation-service.ts` -- `CardGenerationService` orchestrator
- `packages/core/src/index.ts` -- Export services
- `packages/core/test/text-chunker.test.ts` -- Unit tests for chunking and boundary preservation
- `packages/core/test/card-generation-service.test.ts` -- Integration tests with mock LLM provider

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/services/text-chunker.ts` -- Implement `TextChunker` (paragraph-aware chunking with overlap)
- [x] `packages/core/src/services/prompt-builder.ts` -- Implement `PromptBuilder` enforcing atomic front/back constraints
- [x] `packages/core/src/services/card-generation-service.ts` -- Implement `CardGenerationService` orchestrating chunking and LLM calls
- [x] `packages/core/src/index.ts` -- Export `TextChunker`, `PromptBuilder`, `CardGenerationService`
- [x] `packages/core/test/text-chunker.test.ts` -- Unit tests for chunking edge cases
- [x] `packages/core/test/card-generation-service.test.ts` -- Unit and integration tests for generation pipeline

**Acceptance Criteria:**
- **Given** a `CleanTextDocument` and configured `LLMProviderPort`
- **When** `CardGenerationService.generateFromDocument(doc, options)` is executed
- **Then** the document is chunked and atomic `CardGenerationDraft[]` cards are generated with question, answer, and verbatim source quote.
- **Given** an empty document
- **When** `CardGenerationService.generateFromDocument(doc, options)` is called
- **Then** an empty array is returned without calling the LLM.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All chunker and generation service tests pass.
- `npm run build` -- expected: All monorepo packages compile cleanly.



## Suggested Review Order

**Text Chunking & Prompt Building**

- Paragraph-aware text chunking with sliding overlap
  [packages/core/src/services/text-chunker.ts#L1](../../packages/core/src/services/text-chunker.ts#L1)
- Prompt template builder enforcing Minimum Information Principle and active recall
  [packages/core/src/services/prompt-builder.ts#L1](../../packages/core/src/services/prompt-builder.ts#L1)

**Card Generation Service**

- Ingestion-to-generation orchestrator with provenance metadata attachment
  [packages/core/src/services/card-generation-service.ts#L1](../../packages/core/src/services/card-generation-service.ts#L1)

**Unit Test Suites**

- Chunker boundary tests
  [packages/core/test/text-chunker.test.ts#L1](../../packages/core/test/text-chunker.test.ts#L1)
- Generation pipeline integration tests
  [packages/core/test/card-generation-service.test.ts#L1](../../packages/core/test/card-generation-service.test.ts#L1)
