# Provider Dialects Specification

This companion details the polymorphic schema compilation rules for each supported LLM provider in `flashcard-master`, along with eliminated legacy components.

---

## 1. Dialect Mapping Matrix

| Provider | Mechanism | API Request Property | Response Extraction |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | Native `responseSchema` | `generationConfig: { responseMimeType: "application/json", responseSchema: <GeminiSchema> }` | `JSON.parse(response.text)` directly |
| **OpenAI** | Strict Structured Outputs | `response_format: { type: "json_schema", json_schema: { name: "flashcards", strict: true, schema: <JsonSchema> } }` | `JSON.parse(choice.message.content)` directly |
| **Anthropic** | Forced Tool Calling | `tools: [{ name: "emit_flashcards", input_schema: <JsonSchema> }]`, `tool_choice: { type: "tool", name: "emit_flashcards" }` | `tool_use.input` directly (pre-parsed object) |
| **Ollama** | Structured Format | `format: <JsonSchema>` | `JSON.parse(response.message.content)` directly |

---

## 2. Compilation Rules

### A. General Schema Normalization
- All objects compiled from Zod schemas must have explicit property types.
- Array elements must strictly define their item schema.
- Schema field descriptions (`.describe(...)`) must be preserved in the compiled dialect to provide guidance to the model.

### B. Provider-Specific Adjustments
1. **OpenAI:**
   - Must set `additionalProperties: false` on every object schema.
   - All defined object properties must be listed in `required`.
   - Optional fields are modeled as union types with `null` (`type: ["string", "null"]`).
2. **Gemini:**
   - Map Zod types to Google GenAI `SchemaType` (`STRING`, `ARRAY`, `OBJECT`, `INTEGER`).
   - Descriptions map to `description`.
3. **Anthropic:**
   - Wrap the flashcard list in a root tool input object: `{ cards: CardGenerationDraft[] }`.
   - Force tool execution via `tool_choice: { type: "tool", name: "emit_flashcards" }`.
4. **Ollama:**
   - Standard JSON Schema (Draft-07 / 2020-12) serialized into the `format` option.

---

## 3. Eliminated Legacy Components

The following routines in `packages/adapters/src/llm/types.ts` are deprecated and marked for deletion:
- `cleanJsonString(raw: string)`: Stripping thinking tags (`<think>`, `<thinking>`) and markdown fences.
- `isClosingQuote(raw: string, quoteIndex: number)`: Quote heuristic tracking.
- `sanitizeJsonString(raw: string)`: Raw control character and unescaped quote escaping.
- Legacy syntax-repair fallback retry passes.
