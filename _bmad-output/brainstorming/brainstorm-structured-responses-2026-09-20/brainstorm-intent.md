# Brainstorm Intent: Robust Structured LLM Responses

**Project:** flashcard-master  
**Topic:** Deterministic Structured LLM Output via Provider-Native Dialects  
**Source Session:** brainstorm-structured-responses-2026-09-20  
**Date:** 2026-09-20  
**Status:** Completed Brainstorming Intent  

---

## 1. Executive Summary & Intent

This document establishes the architecture and execution contract to replace brittle heuristic and regex-based LLM response parsing in `flashcard-master` with deterministic, provider-native structured outputs. By anchoring the domain contract in a single Zod schema within the core and compiling it into native provider schema dialects (Gemini, OpenAI, Anthropic, Ollama), the system achieves a zero-parser developer experience (DX), guarantees schema-compliant generation without syntax failures, and enables immediate field-first domain schema expansion (keywords, source locators) and progressive SSE streaming.

---

## 2. Problem Statement

1. **Brittle Regex & Heuristic Parsing:** Card extraction currently relies on post-hoc regex string surgery, markdown fence stripping, quote sanitation, and `<think>` tag stripping. Minor formatting quirks in model outputs trigger fatal parsing errors (e.g., `Failed to parse generated flashcards JSON: No valid flashcards found in model output`).
2. **Costly Syntax Repair Loops:** Formatting failures require multi-hop syntax-repair retries that burn tokens, add latency, and frequently fail when models repeat formatting errors.
3. **High Maintenance Friction:** Adding new fields or facets to flashcards requires modifying complex regex patterns and heuristic extractors, coupling product evolution directly to parsing fragility.

---

## 3. Core Architectural Decisions

### A. In-House Native Provider Dialects
- **No Third-Party Framework Lock-In:** Rather than introducing heavy external orchestration libraries (e.g. Python DSPy sidecar or bleeding-edge TS ports like `@instructor-ai/instructor`), implement lightweight internal schema translation.
- **Minimal Blast Radius:** Preserves existing adapter boundaries, adding an internal structured output port to provider adapters with zero runtime bloat.

### B. Single Source of Truth (Core Zod Schema)
- Flashcard schemas and generation constraints are defined exclusively in TypeScript using `zod` in the core domain layer.
- **Polymorphic Translation:** A central compiler maps the core Zod schema into each provider's native structured output dialect:
  - **Google Gemini:** `responseSchema` with `responseMimeType: "application/json"`.
  - **OpenAI:** `json_schema` (Strict Structured Outputs API).
  - **Anthropic:** Tool definitions (`tools` with forced `tool_choice`).
  - **Ollama:** Native JSON schema passed via the `format` parameter.
- **Schema-Driven Prompt Guidance:** Field descriptions defined on the Zod schema automatically compile into prompt-level instructions, eliminating manual prompt concatenation glue.

### C. Zero-Parser Developer Experience (DX)
- Provider invocations return strongly typed, validated TypeScript objects directly.
- All JSON extraction regexes, heuristic string cleaners, and syntax-repair loops are eliminated from the calling path.

---

## 4. Domain Schema Expansions

### A. Immediate Schema Additions
1. **`keywords: string[]`:**
   - List of atomic semantic keywords per card.
   - Purpose: Enables targeted keyword-based recap drills and tag filtering.
2. **`sourceLocator: string`:**
   - Full document provenance identifier (e.g. URI, section anchor, or exact heading/line coordinate) extending beyond the current verbatim citation fragment.
   - Purpose: Direct bi-directional navigation from card to source document.

### B. Open-Ended Extension Model
- **Field-First Development:** Introducing future card facets (e.g., cloze deletions, confidence weights, difficulty ratings) only requires adding a typed field to the Zod schema and its associated business logic. Downstream provider adapters automatically enforce the updated schema without parser code changes.

---

## 5. Generation, Streaming & Error Handling Strategy

### A. Progressive SSE Card-by-Card Streaming
- **Structured Object Streaming:** Stream cards progressively over Server-Sent Events (SSE) to the Task Center UI as individual validated objects rather than waiting for a monolithic array completion.
- **Latency Optimization:** Users see generated cards appear incrementally in real time.

### B. Partial Output Retention & Token Limit Handling
- **Resilience Against Token Cutoffs:** Monolithic JSON array generation fails completely if the output token limit is hit mid-stream. The progressive parser commits all fully formed, validated cards generated prior to the cutoff.
- **Warning Notifications:** When a token cutoff occurs, retained cards are preserved in the database and displayed in the Task Center accompanied by a clear user-facing warning notification explaining the partial completion.
- **Semantic-Only Retries:** Syntax repair retries are removed entirely; retries are reserved strictly for semantic or domain-validation failures.

---

## 6. Elimination Directives

The downstream implementation must explicitly remove:
1. **Regex Cleaners:** Strip all regex pattern matchers used to locate JSON arrays or objects in raw LLM text.
2. **Markdown Fence Strippers:** Remove pre-processing routines that search for and strip ` ```json ` or ` ``` ` code fences.
3. **Thinking-Tag Strippers:** Remove sanitization routines stripping `<think>...</think>` or similar reasoning traces.
4. **Quote & Escape Sanitizers:** Remove manual string replacement passes attempting to fix unescaped quotes, trailing commas, or invalid JSON syntax.
5. **Syntax-Repair Retries:** Deprecate retry prompts that feed malformed JSON back into the LLM for syntax correction.

---

## 7. Scope & Acceptance Criteria for Downstream Implementation

### Scope
- Implement core Zod schema compiler for Gemini, OpenAI, Anthropic, and Ollama dialects.
- Refactor provider adapters to consume compiled dialect schemas.
- Update flashcard domain model with `keywords` and `sourceLocator`.
- Implement SSE progressive card streaming and partial result retention in the Task Center.
- Clean up obsolete regex parsing utilities and test suites.

### Acceptance Criteria
- [ ] **Deterministic Generation:** 100% of LLM card generation responses from all 4 providers parse directly into valid domain objects without regex extraction.
- [ ] **Zero-Parser Pipeline:** No string manipulation, fence stripping, or quote patching exists in the generation pipeline.
- [ ] **Schema Conformance:** Generated cards include valid `keywords` (non-empty array of strings) and `sourceLocator` (valid provenance string/URI) in addition to existing fields (`question`, `answer`, `citation`).
- [ ] **Progressive Streaming:** Cards appear in the Task Center UI incrementally via SSE as they are generated.
- [ ] **Partial Retention:** If an LLM response hits token limits, all cards generated prior to the cutoff are retained and committed to the database with a user-facing warning.
- [ ] **Provider Dialect Fidelity:**
  - Gemini adapter successfully applies `responseSchema`.
  - OpenAI adapter successfully applies `json_schema` strict mode.
  - Anthropic adapter successfully applies forced tool calling schema.
  - Ollama adapter successfully applies `format` JSON schema.
- [ ] **Test Coverage:** Unit tests verify polymorphic compilation from Zod schema to each provider dialect, and integration tests verify error handling and token cutoff recovery.
