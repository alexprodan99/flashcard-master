import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  CardGenerationDraftSchema,
  DifficultyLevelSchema,
  DialectCompiler,
  unwrapZodType,
} from "../src/index.js";

describe("DialectCompiler", () => {
  // ==========================================================================
  // Google Gemini Dialect Tests
  // ==========================================================================
  describe("Google Gemini Dialect (toGeminiSchema)", () => {
    it("compiles CardGenerationDraftSchema to valid Gemini Schema with SchemaType enum strings and descriptions", () => {
      const geminiSchema = DialectCompiler.toGeminiSchema(CardGenerationDraftSchema);

      expect(geminiSchema.type).toBe("OBJECT");
      expect(geminiSchema.properties).toBeDefined();

      const props = geminiSchema.properties!;
      expect(props.question).toEqual({
        type: "STRING",
        description:
          "Clear, self-contained, atomic prompt or question focusing on a single core concept.",
      });
      expect(props.answer).toEqual({
        type: "STRING",
        description:
          "Comprehensive, factually accurate answer directly addressing the question.",
      });
      expect(props.citation).toEqual({
        type: "STRING",
        description:
          "Exact verbatim excerpt quoted from the source text grounding this flashcard.",
      });
      expect(props.keywords).toEqual({
        type: "ARRAY",
        items: { type: "STRING" },
        description:
          "List of 2 to 5 atomic semantic keywords or key terms for rapid revision drills.",
      });
      expect(props.sourceLocator).toEqual({
        type: "STRING",
        description:
          "Document locator coordinate (e.g., section heading, page number, URI, or block ID) where the citation originates.",
      });
      expect(props.difficulty).toEqual({
        type: "STRING",
        enum: ["beginner", "intermediate", "expert", "mixed"],
        description:
          "Cognitive difficulty level: beginner, intermediate, expert, or mixed.",
      });

      // Required properties must exclude optional 'difficulty'
      expect(geminiSchema.required).toEqual([
        "question",
        "answer",
        "citation",
        "keywords",
        "sourceLocator",
      ]);
    });

    it("compiles an array of objects to type ARRAY with inner items schema", () => {
      const arraySchema = z.array(CardGenerationDraftSchema);
      const geminiSchema = DialectCompiler.toGeminiSchema(arraySchema);

      expect(geminiSchema.type).toBe("ARRAY");
      expect(geminiSchema.items).toBeDefined();
      expect(geminiSchema.items!.type).toBe("OBJECT");
      expect(geminiSchema.items!.properties?.question.type).toBe("STRING");
    });

    it("throws Error on unsupported Zod AST nodes", () => {
      const unsupported = z.function();
      expect(() => DialectCompiler.toGeminiSchema(unsupported as any)).toThrow(
        /Unsupported Zod schema type for Gemini dialect/
      );
    });

    it("throws Error on unsupported inner types in arrays", () => {
      const unsupportedArray = z.array(z.symbol() as any);
      expect(() => DialectCompiler.toGeminiSchema(unsupportedArray)).toThrow(
        /Unsupported Zod schema type for Gemini dialect/
      );
    });

    it("compiles batch schema via toGeminiBatchSchema helper", () => {
      const batchSchema = DialectCompiler.toGeminiBatchSchema();
      expect(batchSchema.type).toBe("ARRAY");
      expect(batchSchema.items?.type).toBe("OBJECT");
      expect(batchSchema.items?.properties?.question).toBeDefined();
    });

    it("compiles DifficultyLevelSchema standalone to enum string in Gemini", () => {
      const geminiEnum = DialectCompiler.toGeminiSchema(DifficultyLevelSchema);
      expect(geminiEnum.type).toBe("STRING");
      expect(geminiEnum.enum).toEqual(["beginner", "intermediate", "expert", "mixed"]);
    });
  });

  // ==========================================================================
  // OpenAI Strict Structured Outputs Dialect Tests
  // ==========================================================================
  describe("OpenAI Strict Dialect (toOpenAISchema)", () => {
    it("compiles CardGenerationDraftSchema to strict JSON Schema with additionalProperties: false and all properties in required", () => {
      const openAiSchema = DialectCompiler.toOpenAISchema(CardGenerationDraftSchema);

      expect(openAiSchema.type).toBe("object");
      expect(openAiSchema.additionalProperties).toBe(false);

      // In OpenAI Strict mode, ALL properties must be listed in required
      expect(openAiSchema.required).toEqual([
        "question",
        "answer",
        "citation",
        "keywords",
        "sourceLocator",
        "difficulty",
      ]);

      const props = openAiSchema.properties!;
      expect(props.question).toEqual({
        type: "string",
        description:
          "Clear, self-contained, atomic prompt or question focusing on a single core concept.",
      });

      // Optional field 'difficulty' must be modeled as anyOf with null
      const diffProp = props.difficulty as { anyOf: any[]; description?: string };
      expect(diffProp.description).toBe(
        "Cognitive difficulty level: beginner, intermediate, expert, or mixed."
      );
      expect(diffProp.anyOf).toBeDefined();
      expect(diffProp.anyOf[0]).toMatchObject({
        type: "string",
        enum: ["beginner", "intermediate", "expert", "mixed"],
      });
      expect(diffProp.anyOf[1]).toEqual({ type: "null" });
    });

    it("wraps schema into OpenAI response_format when options.name is provided", () => {
      const responseFormat = DialectCompiler.toOpenAISchema(
        CardGenerationDraftSchema,
        { name: "flashcards" }
      );

      expect(responseFormat.type).toBe("json_schema");
      expect(responseFormat.json_schema).toBeDefined();
      expect(responseFormat.json_schema.name).toBe("flashcards");
      expect(responseFormat.json_schema.strict).toBe(true);
      expect(responseFormat.json_schema.schema.type).toBe("object");
      expect(responseFormat.json_schema.schema.additionalProperties).toBe(false);
    });

    it("validates OpenAI schema name format and throws on invalid names", () => {
      expect(() =>
        DialectCompiler.toOpenAISchema(CardGenerationDraftSchema, {
          name: "invalid name with spaces",
        })
      ).toThrow(/Invalid OpenAI schema name/);

      expect(() =>
        DialectCompiler.toOpenAISchema(CardGenerationDraftSchema, {
          name: "cards!@#",
        })
      ).toThrow(/Invalid OpenAI schema name/);

      expect(() =>
        DialectCompiler.toOpenAISchema(CardGenerationDraftSchema, {
          name: "",
        })
      ).toThrow(/Invalid OpenAI schema name/);

      expect(() =>
        DialectCompiler.toOpenAISchema(CardGenerationDraftSchema, {
          name: "a".repeat(65),
        })
      ).toThrow(/Invalid OpenAI schema name/);
    });

    it("supports toOpenAIStrictSchema and toOpenAIResponseFormat explicitly", () => {
      const strict = DialectCompiler.toOpenAIStrictSchema(CardGenerationDraftSchema);
      expect(strict.type).toBe("object");
      expect(strict.additionalProperties).toBe(false);

      const wrapper = DialectCompiler.toOpenAIResponseFormat(CardGenerationDraftSchema);
      expect(wrapper.type).toBe("json_schema");
      expect(wrapper.json_schema.name).toBe("flashcards");
      expect(wrapper.json_schema.strict).toBe(true);
    });

    it("compiles batch schema via toOpenAIBatchSchema wrapping items in root object", () => {
      const batch = DialectCompiler.toOpenAIBatchSchema();
      expect(batch.type).toBe("json_schema");
      expect(batch.json_schema.name).toBe("flashcards");
      expect(batch.json_schema.strict).toBe(true);

      const rootSchema = batch.json_schema.schema;
      expect(rootSchema.type).toBe("object");
      expect(rootSchema.additionalProperties).toBe(false);
      expect(rootSchema.required).toEqual(["cards"]);

      const cardsProp = rootSchema.properties!.cards as any;
      expect(cardsProp.type).toBe("array");
      expect(cardsProp.items.type).toBe("object");
      expect(cardsProp.items.additionalProperties).toBe(false);
      expect(cardsProp.items.properties.question.type).toBe("string");
    });
  });

  // ==========================================================================
  // Anthropic Forced Tool Dialect Tests
  // ==========================================================================
  describe("Anthropic Dialect (toAnthropicTool & toAnthropicToolChoice)", () => {
    it("compiles CardGenerationDraftSchema to forced tool definition wrapping batch in cards array", () => {
      const tool = DialectCompiler.toAnthropicTool(CardGenerationDraftSchema);

      expect(tool.name).toBe("emit_flashcards");
      expect(tool.description).toBeDefined();
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect(tool.input_schema.required).toEqual(["cards"]);

      const cardsProp = tool.input_schema.properties.cards as any;
      expect(cardsProp.type).toBe("array");
      expect(cardsProp.items.type).toBe("object");
      expect(cardsProp.items.additionalProperties).toBe(false);
      expect(cardsProp.items.properties.question.type).toBe("string");
      expect(cardsProp.items.properties.question.description).toBe(
        "Clear, self-contained, atomic prompt or question focusing on a single core concept."
      );
      expect(cardsProp.items.properties.answer.type).toBe("string");
      expect(cardsProp.items.properties.citation.type).toBe("string");
      expect(cardsProp.items.properties.sourceLocator.type).toBe("string");
      expect(cardsProp.items.properties.keywords).toEqual({
        type: "array",
        items: { type: "string" },
        description: "List of 2 to 5 atomic semantic keywords or key terms for rapid revision drills.",
      });
      expect(cardsProp.items.properties.difficulty).toEqual({
        type: "string",
        enum: ["beginner", "intermediate", "expert", "mixed"],
        description: "Cognitive difficulty level: beginner, intermediate, expert, or mixed.",
      });
      expect(cardsProp.items.required).toEqual([
        "question",
        "answer",
        "citation",
        "keywords",
        "sourceLocator",
      ]);
    });

    it("prevents double nesting when passed a pre-wrapped array schema in toAnthropicTool", () => {
      const preWrapped = z.array(CardGenerationDraftSchema);
      const tool = DialectCompiler.toAnthropicTool(preWrapped);
      const cardsProp = tool.input_schema.properties.cards as any;

      expect(cardsProp.type).toBe("array");
      expect(cardsProp.items.type).toBe("object");
      expect(cardsProp.items.properties.question.type).toBe("string");
    });

    it("rejects invalid Anthropic tool names with format validation Error", () => {
      expect(() =>
        DialectCompiler.toAnthropicTool(CardGenerationDraftSchema, {
          name: "invalid tool name with spaces!",
        })
      ).toThrow(/Invalid Anthropic tool name/);
    });

    it("generates forced tool_choice with toAnthropicToolChoice", () => {
      const defaultChoice = DialectCompiler.toAnthropicToolChoice();
      expect(defaultChoice).toEqual({
        type: "tool",
        name: "emit_flashcards",
      });

      const customChoice = DialectCompiler.toAnthropicToolChoice("custom_tool");
      expect(customChoice).toEqual({
        type: "tool",
        name: "custom_tool",
      });
    });

    it("supports custom tool options in toAnthropicTool", () => {
      const customTool = DialectCompiler.toAnthropicTool(CardGenerationDraftSchema, {
        name: "generate_deck",
        description: "Custom deck generation tool",
        propertyName: "flashcards",
      });

      expect(customTool.name).toBe("generate_deck");
      expect(customTool.description).toBe("Custom deck generation tool");
      expect(customTool.input_schema.required).toEqual(["flashcards"]);
      expect(customTool.input_schema.properties.flashcards).toBeDefined();
    });

    it("compiles batch tool via toAnthropicBatchTool helper", () => {
      const batchTool = DialectCompiler.toAnthropicBatchTool();
      expect(batchTool.name).toBe("emit_flashcards");
      expect(batchTool.input_schema.properties.cards).toBeDefined();
    });
  });

  // ==========================================================================
  // Ollama Standard JSON Schema Dialect Tests
  // ==========================================================================
  describe("Ollama Dialect (toOllamaSchema)", () => {
    it("compiles CardGenerationDraftSchema to standard Draft-07 JSON Schema", () => {
      const ollamaSchema = DialectCompiler.toOllamaSchema(CardGenerationDraftSchema);

      expect(ollamaSchema.type).toBe("object");
      expect(ollamaSchema.additionalProperties).toBe(false);
      expect(ollamaSchema.properties).toBeDefined();
      expect(ollamaSchema.properties!.question.type).toBe("string");
      expect(ollamaSchema.properties!.question.description).toBe(
        "Clear, self-contained, atomic prompt or question focusing on a single core concept."
      );
      expect(ollamaSchema.properties!.answer.type).toBe("string");
      expect(ollamaSchema.properties!.citation.type).toBe("string");
      expect(ollamaSchema.properties!.sourceLocator.type).toBe("string");
      expect(ollamaSchema.properties!.keywords).toEqual({
        type: "array",
        items: { type: "string" },
        description: "List of 2 to 5 atomic semantic keywords or key terms for rapid revision drills.",
      });
      expect(ollamaSchema.properties!.difficulty).toEqual({
        type: "string",
        enum: ["beginner", "intermediate", "expert", "mixed"],
        description: "Cognitive difficulty level: beginner, intermediate, expert, or mixed.",
      });
      expect(ollamaSchema.required).toEqual([
        "question",
        "answer",
        "citation",
        "keywords",
        "sourceLocator",
      ]);
    });

    it("compiles z.array(CardGenerationDraftSchema) to Draft-07 array JSON Schema", () => {
      const arraySchema = z.array(CardGenerationDraftSchema);
      const ollamaSchema = DialectCompiler.toOllamaSchema(arraySchema);

      expect(ollamaSchema.type).toBe("array");
      expect(ollamaSchema.items).toBeDefined();
      expect(ollamaSchema.items!.type).toBe("object");
      expect(ollamaSchema.items!.properties!.question.type).toBe("string");
    });

    it("compiles batch array schema via toOllamaBatchSchema helper", () => {
      const batchSchema = DialectCompiler.toOllamaBatchSchema();
      expect(batchSchema.type).toBe("array");
      expect(batchSchema.items?.type).toBe("object");
    });
  });

  // ==========================================================================
  // Wrapped Types, Defaults, Optionals & Edge Cases
  // ==========================================================================
  describe("Type Unwrapping and Edge Cases", () => {
    it("unwraps z.string().default('foo') preserving default value and underlying type", () => {
      const schema = z.string().default("foo").describe("A string with default");
      const unwrapped = unwrapZodType(schema);

      expect(unwrapped.hasDefault).toBe(true);
      expect(unwrapped.defaultValue).toBe("foo");
      expect(unwrapped.description).toBe("A string with default");

      const gemini = DialectCompiler.toGeminiSchema(schema);
      expect(gemini.type).toBe("STRING");
      expect(gemini.description).toBe("A string with default");

      const ollama = DialectCompiler.toOllamaSchema(schema);
      expect(ollama.type).toBe("string");
      expect(ollama.default).toBe("foo");
      expect(ollama.description).toBe("A string with default");
    });

    it("unwraps z.string().optional() without losing description", () => {
      const innerDesc = z.string().describe("Inner description").optional();
      const outerDesc = z.string().optional().describe("Outer description");

      const unwrappedInner = unwrapZodType(innerDesc);
      expect(unwrappedInner.isOptional).toBe(true);
      expect(unwrappedInner.description).toBe("Inner description");

      const unwrappedOuter = unwrapZodType(outerDesc);
      expect(unwrappedOuter.isOptional).toBe(true);
      expect(unwrappedOuter.description).toBe("Outer description");
    });

    it("unwraps ZodEffects (trim/min/refine/preprocess)", () => {
      const trimmed = z
        .string()
        .trim()
        .min(3)
        .describe("Trimmed string");

      const gemini = DialectCompiler.toGeminiSchema(trimmed);
      expect(gemini.type).toBe("STRING");
      expect(gemini.description).toBe("Trimmed string");

      const refined = z
        .number()
        .refine((n) => n > 0)
        .describe("Positive number");

      const openAi = DialectCompiler.toOpenAIStrictSchema(refined);
      expect(openAi.type).toBe("number");
      expect(openAi.description).toBe("Positive number");
    });

    it("correctly distinguishes integers from floating point numbers", () => {
      const intSchema = z.number().int().describe("Integer count");
      const floatSchema = z.number().describe("Float price");

      const geminiInt = DialectCompiler.toGeminiSchema(intSchema);
      expect(geminiInt.type).toBe("INTEGER");

      const geminiFloat = DialectCompiler.toGeminiSchema(floatSchema);
      expect(geminiFloat.type).toBe("NUMBER");

      const openAiInt = DialectCompiler.toOpenAIStrictSchema(intSchema);
      expect(openAiInt.type).toBe("integer");

      const openAiFloat = DialectCompiler.toOpenAIStrictSchema(floatSchema);
      expect(openAiFloat.type).toBe("number");
    });

    it("correctly compiles booleans and literals", () => {
      const boolSchema = z.boolean().describe("Flag");
      expect(DialectCompiler.toGeminiSchema(boolSchema).type).toBe("BOOLEAN");
      expect(DialectCompiler.toOpenAIStrictSchema(boolSchema).type).toBe("boolean");

      const litSchema = z.literal("fixed_value");
      expect(DialectCompiler.toGeminiSchema(litSchema)).toEqual({
        type: "STRING",
        enum: ["fixed_value"],
      });
      expect(DialectCompiler.toOpenAIStrictSchema(litSchema)).toEqual({
        type: "string",
        enum: ["fixed_value"],
      });
    });

    it("correctly handles z.nullable() across all dialects", () => {
      const nullableString = z.string().nullable().describe("Nullable text");

      // Gemini
      const gemini = DialectCompiler.toGeminiSchema(nullableString);
      expect(gemini.type).toBe("STRING");
      expect(gemini.nullable).toBe(true);
      expect(gemini.description).toBe("Nullable text");

      // OpenAI Strict
      const openai = DialectCompiler.toOpenAIStrictSchema(nullableString);
      expect(openai.anyOf).toEqual([
        { type: "string" },
        { type: "null" },
      ]);
      expect(openai.description).toBe("Nullable text");

      // Ollama
      const ollama = DialectCompiler.toOllamaSchema(nullableString);
      expect(ollama.anyOf).toEqual([
        { type: "string" },
        { type: "null" },
      ]);
      expect(ollama.description).toBe("Nullable text");
    });

    it("correctly handles boolean and null literals without emitting illegal enums", () => {
      const boolTrue = z.literal(true);
      const geminiBool = DialectCompiler.toGeminiSchema(boolTrue);
      expect(geminiBool.type).toBe("BOOLEAN");
      expect(geminiBool.enum).toBeUndefined();

      const openaiBool = DialectCompiler.toOpenAIStrictSchema(boolTrue);
      expect(openaiBool.type).toBe("boolean");
      expect(openaiBool.enum).toBeUndefined();

      const nullLiteral = z.literal(null);
      const openaiNull = DialectCompiler.toOpenAIStrictSchema(nullLiteral);
      expect(openaiNull.type).toBe("null");

      const ollamaNull = DialectCompiler.toOllamaSchema(nullLiteral);
      expect(ollamaNull.type).toBe("null");
    });

    it("throws Error if non-object schema is passed as OpenAI named json_schema root", () => {
      const arraySchema = z.array(z.string());
      expect(() =>
        DialectCompiler.toOpenAISchema(arraySchema, { name: "invalid_array_root" })
      ).toThrow(/Root schema must be an object/);
    });

    it("prevents double nesting in toOpenAIBatchSchema, toGeminiBatchSchema, and toOllamaBatchSchema when given an array schema", () => {
      const arraySchema = z.array(CardGenerationDraftSchema);

      const openaiBatch = DialectCompiler.toOpenAIBatchSchema(arraySchema);
      const cardsProp = openaiBatch.json_schema.schema.properties!.cards as any;
      expect(cardsProp.type).toBe("array");
      expect(cardsProp.items.type).toBe("object");

      const geminiBatch = DialectCompiler.toGeminiBatchSchema(arraySchema);
      expect(geminiBatch.type).toBe("ARRAY");
      expect(geminiBatch.items!.type).toBe("OBJECT");

      const ollamaBatch = DialectCompiler.toOllamaBatchSchema(arraySchema);
      expect(ollamaBatch.type).toBe("array");
      expect(ollamaBatch.items!.type).toBe("object");
    });

    it("ensures nested objects in OpenAI dialect have additionalProperties: false and full required array", () => {
      const nestedSchema = z.object({
        metadata: z.object({
          author: z.string().describe("Author name"),
          version: z.number().int().optional().describe("Version number"),
        }),
      });

      const openAi = DialectCompiler.toOpenAISchema(nestedSchema);
      expect(openAi.type).toBe("object");
      expect(openAi.additionalProperties).toBe(false);
      expect(openAi.required).toEqual(["metadata"]);

      const metaProp = openAi.properties!.metadata as any;
      expect(metaProp.type).toBe("object");
      expect(metaProp.additionalProperties).toBe(false);
      expect(metaProp.required).toEqual(["author", "version"]);
      expect(metaProp.properties.version.anyOf).toBeDefined();
    });
  });

  // ==========================================================================
  // Polymorphic Batch Dispatcher & Instance Methods
  // ==========================================================================
  describe("toBatchSchema and Instance Methods", () => {
    it("dispatches to the appropriate dialect batch builder via toBatchSchema", () => {
      const gemini = DialectCompiler.toBatchSchema("gemini") as any;
      expect(gemini.type).toBe("ARRAY");

      const openai = DialectCompiler.toBatchSchema("openai") as any;
      expect(openai.type).toBe("json_schema");
      expect(openai.json_schema.name).toBe("flashcards");

      const anthropic = DialectCompiler.toBatchSchema("anthropic") as any;
      expect(anthropic.name).toBe("emit_flashcards");

      const ollama = DialectCompiler.toBatchSchema("ollama") as any;
      expect(ollama.type).toBe("array");
    });

    it("throws Error on unknown dialect in toBatchSchema", () => {
      expect(() => DialectCompiler.toBatchSchema("unknown" as any)).toThrow(
        /Unsupported provider dialect: unknown/
      );
    });

    it("allows instance method calls matching static methods", () => {
      const compiler = new DialectCompiler();

      const gemini = compiler.toGeminiSchema(CardGenerationDraftSchema);
      expect(gemini.type).toBe("OBJECT");

      const openai = compiler.toOpenAISchema(CardGenerationDraftSchema);
      expect(openai.type).toBe("object");

      const tool = compiler.toAnthropicTool(CardGenerationDraftSchema);
      expect(tool.name).toBe("emit_flashcards");

      const toolChoice = compiler.toAnthropicToolChoice();
      expect(toolChoice.type).toBe("tool");

      const ollama = compiler.toOllamaSchema(CardGenerationDraftSchema);
      expect(ollama.type).toBe("object");

      const batchGemini = compiler.toBatchSchema("gemini");
      expect((batchGemini as any).type).toBe("ARRAY");

      const batchOpenai = compiler.toBatchSchema("openai");
      expect((batchOpenai as any).type).toBe("json_schema");
    });
  });
});
