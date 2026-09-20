---
id: SPEC-structured-responses
companions:
  - dialects.md
  - schema-extensions.md
  - architecture-diagrams.md
sources:
  - _bmad-output/brainstorming/brainstorm-structured-responses-2026-09-20/brainstorm-intent.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Deterministic Structured LLM Responses via Provider-Native Dialects

## Why

Card generation in `flashcard-master` currently suffers from intermittent, brittle parsing failures caused by relying on LLM natural-language JSON formatting followed by complex regex-based string cleaning, quote repairs, and markdown fence stripping. This fragile boundary produces unrecoverable parse errors, burns tokens on multi-hop syntax repair loops, and creates severe developer friction whenever new card attributes need to be introduced. By replacing prompt-level string gymnastics with provider-native constrained decoding driven by a single core Zod schema, the system eliminates parsing failures entirely, ensures instant schema compliance across Gemini, OpenAI, Anthropic, and Ollama, and unlocks zero-friction domain model expansion for richer flashcard learning modes.

## Capabilities

- **CAP-1**
  - **intent:** System generates flashcards using provider-native constrained decoding and schema enforcement across all supported LLM providers without text-based JSON extraction.
  - **success:** 100% of generation calls across Gemini, OpenAI, Anthropic, and Ollama return valid objects conforming to the schema on the first pass without regex matching or markdown fence stripping.

- **CAP-2**
  - **intent:** System compiles a single declarative TypeScript/Zod card schema into provider-specific schema definitions and prompt guidance.
  - **success:** Modifying or adding a field in the core Zod schema automatically propagates to Gemini `responseSchema`, OpenAI `json_schema`, Anthropic tool schema, and Ollama format without modifying provider adapter code.

- **CAP-3**
  - **intent:** System captures atomic keywords and exact document coordinates for every generated flashcard to support targeted recap drills and deep provenance navigation.
  - **success:** Every newly generated card persists an array of semantic `keywords` and a `sourceLocator` string, verifiable in SQLite and the Question Explorer UI.

- **CAP-4**
  - **intent:** System streams generated flashcards progressively as individual validated objects and commits all completed cards even if output token limits or interruptions occur.
  - **success:** In Task Center, generated cards appear incrementally via SSE during generation, and if a token limit cutoff occurs, all completed cards are preserved with a user-facing warning notification.

- **CAP-5**
  - **intent:** System handles LLM responses with zero regex cleaners, markdown fence strippers, thinking tag removers, or syntax repair retry loops.
  - **success:** All legacy regex cleaners, sanitizers, and syntax-repair loops are removed from the adapters codebase and test suites pass with zero references to them.

## Constraints

- Zero external runtime sidecars or microservices; all dialect translation and validation logic must reside entirely within the existing TypeScript monorepo packages.
- Full multi-provider parity; all four active providers (Gemini, OpenAI, Anthropic, Ollama) must support native structured output generation.
- Database backward compatibility; existing SQLite flashcard records lacking `keywords` or `sourceLocator` must load and display without regressions or runtime errors.
- Minimal blast radius; existing ports-and-adapters interfaces in `@flashcard-master/core` and `@flashcard-master/adapters` must be preserved.

## Non-goals

- Automatic backfilling or LLM re-generation of keywords and source locators for historical flashcards already stored in SQLite.
- External Python service integration or polyglot cross-process IPC.
- Redesign of the Generation Studio UI beyond displaying keyword pill tags, source locators, and partial completion warning badges.

## Success signal

- The complete elimination of `LLMResponseParsingError` across all generation runs, coupled with successful progressive generation and SQLite persistence of flashcards containing verified keywords and source locators across all four LLM adapters.
