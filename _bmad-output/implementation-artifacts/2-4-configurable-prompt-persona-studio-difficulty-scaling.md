---
title: 'Story 2.4: Configurable Prompt Persona Studio & Difficulty Scaling'
type: 'feature'
created: '2026-08-30'
status: 'done'
baseline_commit: 'a63c16b62d267052e94be91c81fb7bb0744a1bdf'
review_loop_iteration: 0
context:
  - _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md
  - _bmad-output/implementation-artifacts/epic-2-context.md
  - _bmad-output/implementation-artifacts/2-3-verbatim-quote-grounding-guard-fact-verification.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Learners require distinct cognitive framing when studying different subjects (e.g. beginner conceptual introduction, rigorous exam testing, or executive architectural synthesis). A static prompt produces one-size-fits-all cards that lack tailored depth.

**Approach:** Implement `PersonaStudioService` and difficulty modifiers in `packages/core/src/services/persona-studio-service.ts`, providing built-in personas (`socratic-mentor`, `strict-examiner`, `executive-synthesizer`), custom user-defined persona CRUD, and calibrated difficulty scaling (`beginner`, `intermediate`, `expert`) integrated with `PromptBuilder`.

## Boundaries & Constraints

**Always:**
- Support 3 built-in personas: `socratic-mentor`, `strict-examiner`, `executive-synthesizer`.
- Support 3 difficulty scaling tiers: `beginner`, `intermediate`, `expert`.
- Allow users to register, update, list, and delete custom named personas with custom system prompts.
- Combine persona instructions, difficulty modifiers, and Minimum Information Principle constraints into unified generation prompts.
- Validate custom persona definitions with Zod (`id`, `name`, `systemPrompt`, `description`).

**Ask First:**
- Adding dynamic few-shot example injection per persona (planned for advanced customization).

**Never:**
- Allow custom persona prompts to override the mandatory `sourceQuote` verbatim citation rule.
- Allow deletion of the 3 built-in system personas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Built-in Persona Request | `persona: "socratic-mentor"` | Generates conceptual reasoning instructions | N/A |
| Difficulty Modifier (Expert) | `difficulty: "expert"` | Injects deep edge-case and trade-off constraints | N/A |
| Register Custom Persona | `{ id: "medical-tutor", name: "Medical Tutor", systemPrompt: "..." }` | Saves to registry and makes available for prompt building | Validates with Zod |
| Attempt Delete Built-in | `delete("socratic-mentor")` | Rejects deletion | Throws `ReservedPersonaError` |
| Unknown Persona Key | `get("non-existent")` | Returns default fallback or throws | Returns undefined or falls back cleanly |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- `PersonaType`, `DifficultyLevel`, `PersonaDefinition`
- `packages/core/src/services/persona-studio-service.ts` -- `PersonaStudioService` implementation
- `packages/core/src/services/prompt-builder.ts` -- Updated `PromptBuilder` using `PersonaStudioService`
- `packages/core/src/index.ts` -- Export `PersonaStudioService`, `PersonaDefinition`
- `packages/core/test/persona-studio-service.test.ts` -- Unit tests for persona registration, difficulty modifiers, and built-in protection

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/domain/models.ts` -- Define `PersonaDefinition` schema
- [x] `packages/core/src/services/persona-studio-service.ts` -- Implement `PersonaStudioService` with built-in personas and custom persona CRUD
- [x] `packages/core/src/services/prompt-builder.ts` -- Integrate `PersonaStudioService` and difficulty modifiers into `PromptBuilder`
- [x] `packages/core/src/index.ts` -- Export `PersonaStudioService`
- [x] `packages/core/test/persona-studio-service.test.ts` -- Unit tests for custom personas, difficulty modifiers, and prompt generation

**Acceptance Criteria:**
- **Given** a requested difficulty level ("beginner", "intermediate", "expert")
- **When** `PromptBuilder.buildGenerationInstructions()` is executed
- **Then** the prompt includes specific difficulty tuning and persona guidelines.
- **Given** a custom persona registration
- **When** a user registers a new persona
- **Then** it becomes available in `PersonaStudioService` and can be used in card generation.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All persona studio and core tests pass.
- `npm run build` -- expected: All workspace packages compile cleanly without TypeScript errors.



## Suggested Review Order

**Persona Studio & Difficulty Scaling**

- Built-in persona definitions and custom persona registry with protected system presets
  [packages/core/src/services/persona-studio-service.ts#L1](../../packages/core/src/services/persona-studio-service.ts#L1)

- PromptBuilder persona and difficulty integration
  [packages/core/src/services/prompt-builder.ts#L1](../../packages/core/src/services/prompt-builder.ts#L1)

**Unit Test Suite**

- Unit tests validating persona registration, difficulty modifiers, and built-in protection
  [packages/core/test/persona-studio-service.test.ts#L1](../../packages/core/test/persona-studio-service.test.ts#L1)
