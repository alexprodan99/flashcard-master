---
title: 'Central Zod-to-Provider Dialect Compiler'
type: 'feature'
created: '2026-09-20'
status: 'done'
baseline_commit: '28f26f313d33b393654dba45feda1e4d62baa047'
review_loop_iteration: 0
context:
  - _bmad-output/implementation-artifacts/epic-16-context.md
  - _bmad-output/specs/spec-structured-responses/dialects.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Provider adapters currently rely on natural-language JSON formatting requests in prompts followed by brittle regex heuristics, because each LLM provider requires a fundamentally different structured output format (Gemini `responseSchema`, OpenAI strict `json_schema`, Anthropic forced `tools`, and Ollama `format`).

**Approach:** Implement `DialectCompiler` in `packages/core/src/llm/dialect-compiler.ts` that recursively compiles any Zod schema (specifically `CardGenerationDraftSchema`) into provider-native structured output dialects, preserving `.describe()` annotations as model guidance and guaranteeing strict schema compliance.

## Boundaries & Constraints

**Always:**
- Keep compiler purely functional and zero-dependency beyond existing `zod` in `@flashcard-master/core`.
- Preserve all `.describe(...)` annotations in compiled output properties to instruct the model at decoding time.
- OpenAI compilation must set `additionalProperties: false` on every object and include every property in `required` (with optional fields modeled as nullable) to satisfy OpenAI Strict Schema requirements.
- Anthropic compilation must generate a valid tool definition (`emit_flashcards`) wrapping the batch in an input schema with forced `tool_choice: { type: "tool", name: "emit_flashcards" }`.
- Gemini compilation must map Zod types to Google GenAI `SchemaType` uppercase enum strings (`OBJECT`, `ARRAY`, `STRING`, `INTEGER`, `NUMBER`, `BOOLEAN`).
- Ollama compilation must generate standard Draft-07 compatible JSON Schema for the `format` option.
- Recursively unwrap `ZodDefault`, `ZodOptional`, `ZodNullable`, and `ZodEffects`.

**Ask First:**
- Introducing external schema conversion libraries (e.g. `zod-to-json-schema`) rather than the lightweight in-house compiler.

**Never:**
- Never perform regex string parsing or prompt hacks inside the compiler.
- Never add runtime sidecars or microservices.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gemini Single Object | `CardGenerationDraftSchema` | `{ type: "OBJECT", properties: { question: { type: "STRING", description: "..." }, ... }, required: [...] }` | Throws `Error` on unsupported Zod AST nodes |
| Gemini Array of Objects | `z.array(CardGenerationDraftSchema)` | `{ type: "ARRAY", items: <GeminiObjectSchema> }` | Throws `Error` on unsupported inner types |
| OpenAI Strict Object | `CardGenerationDraftSchema` | `additionalProperties: false`, all properties in `required`, optional `difficulty` mapped to `anyOf: [{ enum: [...] }, { type: "null" }]` | Returns fully compliant OpenAI strict JSON Schema |
| OpenAI Schema Wrapper | `toOpenAISchema(CardGenerationDraftSchema, { name: "flashcards" })` | `{ type: "json_schema", json_schema: { name: "flashcards", strict: true, schema: <OpenAIStrictSchema> } }` | Validates name format |
| Anthropic Forced Tool | `CardGenerationDraftSchema` | `{ name: "emit_flashcards", input_schema: { type: "object", properties: { cards: { type: "array", items: <JsonSchema> } }, required: ["cards"], additionalProperties: false } }` | Pre-configured for forced execution |
| Ollama Format | `z.array(CardGenerationDraftSchema)` | Standard JSON Schema object with `type: "array"`, `items: { type: "object", ... }` | Returns standard JSON Schema |
| Wrapped Types | `z.string().default("foo")` or `z.string().optional()` | Correctly resolves underlying type, unwrapping `.default()` and `.optional()` without losing `.describe()` | Safe unwrap fallback |

</frozen-after-approval>

## Code Map

- `packages/core/src/domain/models.ts` -- Exports `CardGenerationDraftSchema`, `DifficultyLevelSchema`.
- `packages/core/src/llm/dialect-compiler.ts` -- New module implementing `DialectCompiler` class and dialect types.
- `packages/core/src/index.ts` -- Monorepo export surface for `@flashcard-master/core`.
- `packages/core/test/dialect-compiler.test.ts` -- Comprehensive unit test suite covering all four provider dialect outputs and edge cases.

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/llm/dialect-compiler.ts` -- Implement `DialectCompiler` with `toGeminiSchema`, `toOpenAISchema`, `toAnthropicTool`, `toAnthropicToolChoice`, `toOllamaSchema`, and helper batch builders -- Core polymorphic compiler translating Zod schemas to native provider formats.
- [x] `packages/core/src/index.ts` -- Export `DialectCompiler` and its output types -- Exposes compiler to adapters and web modules.
- [x] `packages/core/test/dialect-compiler.test.ts` -- Add unit tests testing Gemini, OpenAI, Anthropic, Ollama compilation from `CardGenerationDraftSchema` and edge cases (descriptions, optionals, arrays, defaults, enums) -- Verifies compiler output conformity against provider requirements.

**Acceptance Criteria:**
- Given `CardGenerationDraftSchema`, when `DialectCompiler.toGeminiSchema()` is called, then it returns an object with `type: "OBJECT"`, property descriptions, and nested `STRING`/`ARRAY` `SchemaType` mappings.
- Given `CardGenerationDraftSchema`, when `DialectCompiler.toOpenAISchema()` is called, then it returns a strict JSON schema with `additionalProperties: false`, all properties listed in `required`, and optional fields accommodating nulls.
- Given `CardGenerationDraftSchema`, when `DialectCompiler.toAnthropicTool()` is called, then it returns a tool named `emit_flashcards` wrapping the card schema in a `cards` array with `additionalProperties: false`.
- Given `CardGenerationDraftSchema`, when `DialectCompiler.toOllamaSchema()` is called, then it returns a standard JSON Schema object suitable for Ollama's `format` parameter.
- Given wrapped Zod types (defaults, optionals, nullables, descriptions), when compiled to any dialect, then underlying types and prompt descriptions are preserved.

## Spec Change Log

_None._

## Design Notes

The compiler uses pure recursive pattern matching on Zod's `_def` AST:
- `z.ZodString`: string type.
- `z.ZodNumber`: number or integer type.
- `z.ZodBoolean`: boolean type.
- `z.ZodEnum`: string type with enum values.
- `z.ZodArray`: array type with compiled `_def.type` items.
- `z.ZodObject`: object type with mapped `_def.shape()` properties and `required` list.
- `z.ZodDefault` / `z.ZodOptional` / `z.ZodNullable` / `z.ZodEffects`: recursive unwrapping while retaining outer or inner `.description`.

For OpenAI Strict mode:
OpenAI requires `additionalProperties: false` on every object schema and requires every property to be listed in `required`. To support optional properties like `difficulty`, the property schema in OpenAI dialect is generated as `{ anyOf: [baseSchema, { type: "null" }] }` and kept in `required`.

## Verification

**Commands:**
- `npm test -w @flashcard-master/core` -- expected: All unit tests in core pass, including new dialect compiler test suite.
- `npm run typecheck` -- expected: Monorepo compiles cleanly with 0 TypeScript errors.

## Suggested Review Order

**Dialect Compilation Engine**

- Pure recursive AST unwrap preserving `.describe()` annotations across wrappers
  [`dialect-compiler.ts:130`](../../packages/core/src/llm/dialect-compiler.ts#L130)

- Gemini schema compilation mapping uppercase `SchemaType` enums and descriptions
  [`dialect-compiler.ts:190`](../../packages/core/src/llm/dialect-compiler.ts#L190)

- OpenAI strict structured outputs enforcing `additionalProperties: false` and null unions
  [`dialect-compiler.ts:290`](../../packages/core/src/llm/dialect-compiler.ts#L290)

- Anthropic tool generation wrapping batch into `cards` array with forced choice
  [`dialect-compiler.ts:690`](../../packages/core/src/llm/dialect-compiler.ts#L690)

- Ollama Draft-07 JSON Schema compilation for the `format` parameter
  [`dialect-compiler.ts:437`](../../packages/core/src/llm/dialect-compiler.ts#L437)

- Polymorphic batch dispatcher with full type-safe overloads and instance methods
  [`dialect-compiler.ts:855`](../../packages/core/src/llm/dialect-compiler.ts#L855)

**Public API Surface**

- Monorepo export exposing DialectCompiler and types from `@flashcard-master/core`
  [`index.ts:22`](../../packages/core/src/index.ts#L22)

**Test Verification**

- Dialect compiler test suite covering all 4 providers, batch builders, and edge cases
  [`dialect-compiler.test.ts:10`](../../packages/core/test/dialect-compiler.test.ts#L10)
