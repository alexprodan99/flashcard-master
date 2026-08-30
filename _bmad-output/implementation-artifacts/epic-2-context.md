# Epic 2 Context: Grounded Q&A Generation & Fact-Checking Engine

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Implement the AI extraction and grounding pipeline that transforms clean text documents into atomic Front/Back flashcards adhering to the Minimum Information Principle, strictly verified against verbatim source quotes, with configurable difficulty levels, selectable prompt personas, automated SQLite persistence, and duplicate question filtering.

## Stories

- Story 2.1: LLM Provider Port & Vendor Adapters (OpenAI, Gemini, Anthropic, Ollama)
- Story 2.2: Atomic Front/Back Flashcard Prompting Pipeline
- Story 2.3: Verbatim Quote Grounding Guard & Fact Verification
- Story 2.4: Configurable Prompt Persona Studio & Difficulty Scaling
- Story 2.5: Automated Card Persistence & Metadata Tagging
- Story 2.6: Card Deduplication & Normalized Content Filter

## Requirements & Constraints

- **Atomic Flashcards (FR-201):** Generate concise, single-concept Front/Back Q&A pairs.
- **Mandatory Verbatim Citation Guard (FR-202, AD-5):** Every generated card must extract an exact substring from the source document. If a card's citation is fabricated or altered, it must fail validation and be discarded.
- **Cognitive Scaling (FR-203, FR-204):** Support difficulty levels (`beginner`, `intermediate`, `expert`) and distinct personas (`socratic-mentor`, `strict-examiner`, `executive-synthesizer`).
- **Persistence & Dedup (FR-205, FR-206):** Automatically insert valid cards into `flashcards` table with full provenance metadata; detect and discard duplicate questions within target decks.
- **Vendor Neutrality (AD-4, AD-5):** Adapters for OpenAI, Gemini, Anthropic, and local Ollama implementing `LLMProviderPort`.
- **Zero Telemetry / Privacy (NFR-201, NFR-202):** Local-first persistence; direct LLM API calls with zero third-party telemetry.

## Technical Decisions

- **Architecture Boundary (AD-1, AD-4):** `LLMProviderPort` lives in `packages/core/src/ports/index.ts`. Concrete vendor adapters live in `packages/adapters/src/llm/`.
- **Grounding Validation (AD-5):** Substring/normalized whitespace matching against original text document in `packages/core/src/services/grounding-guard.ts`.
- **Structured JSON Schema (AD-4):** LLM calls use structured JSON output prompts with schema validation (`zod`).

## Cross-Story Dependencies

- Story 2.1 creates the `LLMProviderPort` vendor adapters.
- Story 2.2 builds the generation prompt pipeline using the port.
- Story 2.3 implements `GroundingGuard` verification.
- Story 2.4 adds persona prompts and difficulty modifiers.
- Story 2.5 implements `FlashcardRepository` for SQLite persistence.
- Story 2.6 implements deduplication filters before commit.
