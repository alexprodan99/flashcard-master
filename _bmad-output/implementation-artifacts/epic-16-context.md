# Epic 16 Context: Deterministic Structured LLM Responses via Provider-Native Dialects

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Eliminate intermittent LLM response parsing errors caused by text heuristics and markdown fence stripping in `flashcard-master`. Replace prompt-based formatting pleas with provider-native constrained decoding (Gemini `responseSchema`, OpenAI strict `json_schema`, Anthropic forced `tools`, Ollama `format`) compiled polymorphically from a central Zod schema in `packages/core`. Expand the flashcard domain schema to support atomic `keywords` and exact `sourceLocator` coordinates with backward-compatible SQLite migrations, implement progressive SSE card streaming to Task Center with graceful partial output retention on token cutoffs, and purge all legacy regex sanitizers.

## Stories

- Story 16.1: Enriched Flashcard Schema & SQLite Migration
- Story 16.2: Central Zod-to-Provider Dialect Compiler
- Story 16.3: Provider Adapters Native Structured Output Migration
- Story 16.4: Progressive SSE Streaming & Token Limit Retention
- Story 16.5: Legacy Sanitizer Deprecation & Monorepo Test Suite

## Requirements & Constraints

- 100% first-pass schema validation without regex searching or markdown fence stripping across all 4 providers.
- Single source of truth: Zod schema in `packages/core/src/domain/models.ts` defines all field constraints and prompt descriptions (`.describe()`).
- Database backward compatibility: Existing flashcard rows without `keywords` or `source_locator` must load safely with defaults (`[]` and `""`).
- Zero external runtime sidecars or microservices; all logic must reside within existing TypeScript packages (`core`, `adapters`, `web`).
- Fault tolerance: Reaching max output tokens during card generation must retain all completed cards in SQLite and signal partial completion with a warning banner rather than throwing `LLMResponseParsingError`.

## Technical Decisions

- **Domain Model Expansion:** `CardGenerationDraftSchema` adds `keywords: z.array(z.string().trim().min(1)).min(1)` and `sourceLocator: z.string().trim().min(1)`.
- **Database Schema:** SQLite `cards` table gains `keywords TEXT DEFAULT '[]'` (JSON array) and `source_locator TEXT DEFAULT ''`.
- **Dialect Compiler:** Pure functional mapping module in `packages/core` that translates Zod AST into:
  - Gemini: `Schema` with `SchemaType` enums and field descriptions.
  - OpenAI: Strict JSON Schema draft with `additionalProperties: false` and all properties marked `required`.
  - Anthropic: Tool definition with input schema and forced `tool_choice`.
  - Ollama: JSON Schema passed via the `format` option.
- **Progressive Streaming:** Worker threads emit individual validated card objects over SSE as they are generated, rather than buffering an entire batch.
- **Sanitizer Removal:** Deprecate and delete `cleanJsonString()`, `sanitizeJsonString()`, `isClosingQuote()`, and syntax retry loops from `packages/adapters/src/llm/types.ts`.

## UX & Interaction Patterns

- **Task Center Live Stream:** Real-time incremental rendering of cards as SSE events arrive.
- **Warning Notifications:** When generation hits token limits, display an amber badge in Task Center indicating partial completion and number of preserved cards.
- **Question Explorer:** Render keyword pills on card previews and display source locator coordinates in the card editor drawer.

## Cross-Story Dependencies

- **Story 16.1** provides the core domain types and SQLite column migrations required by all subsequent stories.
- **Story 16.2** provides the dialect compiler required by **Story 16.3** to configure provider SDK calls.
- **Story 16.3** transitions providers to structured outputs, which **Story 16.4** hooks into for progressive SSE emission.
- **Story 16.5** cleans up legacy sanitizers and verifies the entire monorepo once 16.1–16.4 are operational.
