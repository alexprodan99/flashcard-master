import { z } from "zod";
import { CardGenerationDraftSchema } from "../domain/models.js";

// ============================================================================
// Google Gemini Dialect Types
// ============================================================================

export type GeminiSchemaType =
  | "STRING"
  | "NUMBER"
  | "INTEGER"
  | "BOOLEAN"
  | "ARRAY"
  | "OBJECT";

export interface GeminiSchema {
  type: GeminiSchemaType;
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
}

// ============================================================================
// OpenAI Strict Structured Outputs Dialect Types
// ============================================================================

export interface OpenAISchemaOptions {
  name?: string;
  description?: string;
  strict?: boolean;
}

export interface OpenAIStrictSchema {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  description?: string;
  properties?: Record<string, OpenAIStrictSchema | { anyOf: unknown[]; description?: string }>;
  required?: string[];
  additionalProperties?: false;
  items?: OpenAIStrictSchema | { anyOf: unknown[]; description?: string };
  enum?: (string | number | boolean)[];
  anyOf?: unknown[];
  [key: string]: unknown;
}

export interface OpenAIResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    description?: string;
    strict: boolean;
    schema: OpenAIStrictSchema;
  };
}

// ============================================================================
// Anthropic Forced Tool Dialect Types
// ============================================================================

export interface AnthropicToolOptions {
  name?: string;
  description?: string;
  propertyName?: string;
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
    [key: string]: unknown;
  };
}

export interface AnthropicToolChoice {
  type: "tool";
  name: string;
}

// ============================================================================
// Ollama / Standard JSON Schema Types (Draft-07 Compatible)
// ============================================================================

export interface JsonSchema {
  $schema?: string;
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: (string | number | boolean)[];
  anyOf?: JsonSchema[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  [key: string]: unknown;
}

export type OllamaJsonSchema = JsonSchema;

export type SupportedDialect = "gemini" | "openai" | "anthropic" | "ollama";

// ============================================================================
// AST Unwrapping Utilities
// ============================================================================

export interface UnwrappedZodNode {
  baseSchema: z.ZodTypeAny;
  isOptional: boolean;
  isNullable: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
  description?: string;
}

/**
 * Recursively unwraps Zod wrapper types (ZodOptional, ZodNullable, ZodDefault,
 * ZodEffects, ZodCatch, ZodReadonly, ZodBranded, ZodPipeline) while preserving
 * outer and inner .describe() annotations.
 */
export function unwrapZodType(schema: z.ZodTypeAny): UnwrappedZodNode {
  let current: any = schema;
  let isOptional = false;
  let isNullable = false;
  let hasDefault = false;
  let defaultValue: unknown = undefined;
  let description: string | undefined = schema.description ?? (schema._def as any)?.description;

  while (current) {
    if (!description) {
      description = current.description ?? current._def?.description;
    }

    const typeName = current._def?.typeName;
    if (typeName === "ZodOptional") {
      isOptional = true;
      current = current._def.innerType;
    } else if (typeName === "ZodNullable") {
      isNullable = true;
      current = current._def.innerType;
    } else if (typeName === "ZodDefault") {
      hasDefault = true;
      defaultValue = current._def.defaultValue();
      current = current._def.innerType;
    } else if (typeName === "ZodEffects") {
      current = current._def.schema;
    } else if (typeName === "ZodCatch") {
      current = current._def.innerType;
    } else if (typeName === "ZodReadonly") {
      current = current._def.innerType;
    } else if (typeName === "ZodBranded") {
      current = current._def.type;
    } else if (typeName === "ZodPipeline") {
      current = current._def.out;
    } else {
      break;
    }
  }

  if (!description) {
    description = current?.description ?? current?._def?.description;
  }

  return {
    baseSchema: current,
    isOptional,
    isNullable,
    hasDefault,
    defaultValue,
    description,
  };
}

// Regex matching valid OpenAI schema names: 1-64 alphanumeric, underscores, hyphens
const OPENAI_SCHEMA_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

// ============================================================================
// Internal Dialect Compilers
// ============================================================================

function compileToGemini(schema: z.ZodTypeAny): GeminiSchema {
  const unwrapped = unwrapZodType(schema);
  const base = unwrapped.baseSchema;
  const typeName = base?._def?.typeName;

  let result: GeminiSchema;

  switch (typeName) {
    case "ZodString": {
      result = { type: "STRING" };
      break;
    }
    case "ZodNumber": {
      const isInteger = (base as z.ZodNumber)._def.checks?.some((c: any) => c.kind === "int");
      result = { type: isInteger ? "INTEGER" : "NUMBER" };
      break;
    }
    case "ZodBoolean": {
      result = { type: "BOOLEAN" };
      break;
    }
    case "ZodEnum": {
      result = {
        type: "STRING",
        enum: [...(base as z.ZodEnum<any>)._def.values],
      };
      break;
    }
    case "ZodNativeEnum": {
      const values = Object.values((base as z.ZodNativeEnum<any>)._def.values).filter(
        (v): v is string => typeof v === "string"
      );
      result = {
        type: "STRING",
        enum: values,
      };
      break;
    }
    case "ZodNull": {
      result = { type: "STRING", nullable: true };
      break;
    }
    case "ZodLiteral": {
      const val = (base as z.ZodLiteral<any>)._def.value;
      if (typeof val === "string") {
        result = { type: "STRING", enum: [val] };
      } else if (typeof val === "number") {
        result = { type: Number.isInteger(val) ? "INTEGER" : "NUMBER" };
      } else if (typeof val === "boolean") {
        result = { type: "BOOLEAN" };
      } else if (val === null) {
        result = { type: "STRING", nullable: true };
      } else {
        result = { type: "STRING" };
      }
      break;
    }
    case "ZodArray": {
      const itemSchema = (base as z.ZodArray<any>)._def.type;
      result = {
        type: "ARRAY",
        items: compileToGemini(itemSchema),
      };
      break;
    }
    case "ZodObject": {
      const shape = (base as z.ZodObject<any>)._def.shape();
      const properties: Record<string, GeminiSchema> = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fieldUnwrapped = unwrapZodType(fieldSchema as z.ZodTypeAny);
        properties[key] = compileToGemini(fieldSchema as z.ZodTypeAny);
        if (!fieldUnwrapped.isOptional) {
          required.push(key);
        }
      }

      result = {
        type: "OBJECT",
        properties,
      };
      if (required.length > 0) {
        result.required = required;
      }
      break;
    }
    default: {
      throw new Error(
        `Unsupported Zod schema type for Gemini dialect: ${typeName || "unknown"}`
      );
    }
  }

  if (unwrapped.description) {
    result.description = unwrapped.description;
  }
  if (unwrapped.isNullable) {
    result.nullable = true;
  }

  return result;
}

function compileToOpenAIStrict(schema: z.ZodTypeAny): OpenAIStrictSchema {
  const unwrapped = unwrapZodType(schema);
  const base = unwrapped.baseSchema;
  const typeName = base?._def?.typeName;

  let result: OpenAIStrictSchema;

  switch (typeName) {
    case "ZodString": {
      result = { type: "string" };
      break;
    }
    case "ZodNumber": {
      const isInteger = (base as z.ZodNumber)._def.checks?.some((c: any) => c.kind === "int");
      result = { type: isInteger ? "integer" : "number" };
      break;
    }
    case "ZodBoolean": {
      result = { type: "boolean" };
      break;
    }
    case "ZodEnum": {
      result = {
        type: "string",
        enum: [...(base as z.ZodEnum<any>)._def.values],
      };
      break;
    }
    case "ZodNativeEnum": {
      const allValues = Object.values((base as z.ZodNativeEnum<any>)._def.values);
      // In TS numeric enums, Object.values contains both string names and number values.
      // If there are numbers, the actual enum values are the numbers. Otherwise, string values.
      const hasNumbers = allValues.some((v) => typeof v === "number");
      const values = hasNumbers
        ? allValues.filter((v): v is number => typeof v === "number")
        : allValues.filter((v): v is string => typeof v === "string");
      result = {
        type: hasNumbers ? "integer" : "string",
        enum: values,
      };
      break;
    }
    case "ZodLiteral": {
      const val = (base as z.ZodLiteral<any>)._def.value;
      if (val === null) {
        result = { type: "null" };
      } else if (typeof val === "boolean") {
        // OpenAI strict structured outputs prohibit enum on boolean schemas
        result = { type: "boolean" };
      } else if (typeof val === "number") {
        result = {
          type: Number.isInteger(val) ? "integer" : "number",
          enum: [val],
        };
      } else {
        result = {
          type: "string",
          enum: [String(val)],
        };
      }
      break;
    }
    case "ZodNull": {
      result = { type: "null" };
      break;
    }
    case "ZodArray": {
      const itemSchema = (base as z.ZodArray<any>)._def.type;
      result = {
        type: "array",
        items: compileToOpenAIStrict(itemSchema),
      };
      break;
    }
    case "ZodObject": {
      const shape = (base as z.ZodObject<any>)._def.shape();
      const properties: Record<string, OpenAIStrictSchema | { anyOf: unknown[]; description?: string }> = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of Object.entries(shape)) {
        required.push(key);
        const fieldUnwrapped = unwrapZodType(fieldSchema as z.ZodTypeAny);

        if (fieldUnwrapped.isOptional || fieldUnwrapped.isNullable) {
          // Model optional / nullable as anyOf: [baseSchema, { type: "null" }]
          const baseCompiled = compileToOpenAIStrict(fieldUnwrapped.baseSchema);
          const fieldDesc = fieldUnwrapped.description;
          // Clean description off inner type so it lives on outer property schema
          const baseCopy = { ...baseCompiled };
          delete baseCopy.description;

          // Flatten anyOf to avoid nested anyOf: [{ anyOf: [...] }, { type: "null" }]
          const innerAnyOf = Array.isArray(baseCopy.anyOf) ? baseCopy.anyOf : [baseCopy];
          const hasNull = innerAnyOf.some((item: any) => item.type === "null");

          properties[key] = {
            ...(fieldDesc ? { description: fieldDesc } : {}),
            anyOf: hasNull ? innerAnyOf : [...innerAnyOf, { type: "null" }],
          };
        } else {
          properties[key] = compileToOpenAIStrict(fieldSchema as z.ZodTypeAny);
        }
      }

      result = {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      };
      break;
    }
    case "ZodUnion": {
      const options = (base as z.ZodUnion<any>)._def.options;
      result = {
        anyOf: options.map((opt: z.ZodTypeAny) => compileToOpenAIStrict(opt)),
      };
      break;
    }
    default: {
      throw new Error(
        `Unsupported Zod schema type for OpenAI dialect: ${typeName || "unknown"}`
      );
    }
  }

  if (unwrapped.description && !result.description) {
    result.description = unwrapped.description;
  }

  if (unwrapped.isNullable && result.type !== "null") {
    const baseCopy = { ...result };
    delete baseCopy.description;
    const existingAnyOf = Array.isArray(baseCopy.anyOf) ? baseCopy.anyOf : [baseCopy];
    if (!existingAnyOf.some((item: any) => item.type === "null")) {
      return {
        ...(unwrapped.description ? { description: unwrapped.description } : {}),
        anyOf: [...existingAnyOf, { type: "null" }],
      };
    }
  }

  return result;
}

function compileToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const unwrapped = unwrapZodType(schema);
  const base = unwrapped.baseSchema;
  const typeName = base?._def?.typeName;

  let result: JsonSchema;

  switch (typeName) {
    case "ZodString": {
      result = { type: "string" };
      break;
    }
    case "ZodNumber": {
      const isInteger = (base as z.ZodNumber)._def.checks?.some((c: any) => c.kind === "int");
      result = { type: isInteger ? "integer" : "number" };
      break;
    }
    case "ZodBoolean": {
      result = { type: "boolean" };
      break;
    }
    case "ZodEnum": {
      result = {
        type: "string",
        enum: [...(base as z.ZodEnum<any>)._def.values],
      };
      break;
    }
    case "ZodNativeEnum": {
      const values = Object.values((base as z.ZodNativeEnum<any>)._def.values);
      result = {
        type: "string",
        enum: values as (string | number | boolean)[],
      };
      break;
    }
    case "ZodLiteral": {
      const val = (base as z.ZodLiteral<any>)._def.value;
      if (val === null) {
        result = { type: "null" };
      } else if (typeof val === "boolean") {
        result = {
          type: "boolean",
          enum: [val],
        };
      } else if (typeof val === "number") {
        result = {
          type: Number.isInteger(val) ? "integer" : "number",
          enum: [val],
        };
      } else {
        result = {
          type: "string",
          enum: [String(val)],
        };
      }
      break;
    }
    case "ZodNull": {
      result = { type: "null" };
      break;
    }
    case "ZodArray": {
      const itemSchema = (base as z.ZodArray<any>)._def.type;
      result = {
        type: "array",
        items: compileToJsonSchema(itemSchema),
      };
      break;
    }
    case "ZodObject": {
      const shape = (base as z.ZodObject<any>)._def.shape();
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fieldUnwrapped = unwrapZodType(fieldSchema as z.ZodTypeAny);
        properties[key] = compileToJsonSchema(fieldSchema as z.ZodTypeAny);
        if (!fieldUnwrapped.isOptional) {
          required.push(key);
        }
      }

      result = {
        type: "object",
        properties,
        additionalProperties: false,
      };
      if (required.length > 0) {
        result.required = required;
      }
      break;
    }
    case "ZodUnion": {
      const options = (base as z.ZodUnion<any>)._def.options;
      result = {
        anyOf: options.map((opt: z.ZodTypeAny) => compileToJsonSchema(opt)),
      };
      break;
    }
    case "ZodRecord": {
      const valueType = (base as z.ZodRecord<any>)._def.valueType;
      result = {
        type: "object",
        additionalProperties: compileToJsonSchema(valueType),
      };
      break;
    }
    default: {
      throw new Error(
        `Unsupported Zod schema type for Ollama / JSON Schema dialect: ${typeName || "unknown"}`
      );
    }
  }

  if (unwrapped.description) {
    result.description = unwrapped.description;
  }
  if (unwrapped.hasDefault && unwrapped.defaultValue !== undefined) {
    result.default = unwrapped.defaultValue;
  }

  if (unwrapped.isNullable && result.type !== "null") {
    const baseCopy = { ...result };
    delete baseCopy.description;
    const existingAnyOf = Array.isArray(baseCopy.anyOf) ? baseCopy.anyOf : [baseCopy];
    if (!existingAnyOf.some((item: any) => item.type === "null")) {
      return {
        ...(unwrapped.description ? { description: unwrapped.description } : {}),
        ...(unwrapped.hasDefault && unwrapped.defaultValue !== undefined ? { default: unwrapped.defaultValue } : {}),
        anyOf: [...existingAnyOf, { type: "null" }],
      };
    }
  }

  return result;
}

// ============================================================================
// DialectCompiler Class
// ============================================================================

export class DialectCompiler {
  /**
   * Compiles a Zod schema into Google GenAI Schema format.
   * Preserves field descriptions, sets uppercase SchemaType strings, and maps
   * nested objects and arrays. Throws Error on unsupported AST nodes.
   */
  static toGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
    return compileToGemini(schema);
  }

  /**
   * Instance method forwarding to static toGeminiSchema.
   */
  toGeminiSchema(schema: z.ZodTypeAny): GeminiSchema {
    return DialectCompiler.toGeminiSchema(schema);
  }

  /**
   * Compiles a Zod schema into OpenAI Strict JSON Schema format.
   * If `options.name` is provided, returns the full OpenAI response_format wrapper
   * `{ type: "json_schema", json_schema: { name, strict: true, schema } }`.
   * Otherwise returns the strict schema object directly.
   */
  static toOpenAISchema(schema: z.ZodTypeAny): OpenAIStrictSchema;
  static toOpenAISchema(
    schema: z.ZodTypeAny,
    options: OpenAISchemaOptions & { name: string }
  ): OpenAIResponseFormat;
  static toOpenAISchema(
    schema: z.ZodTypeAny,
    options?: OpenAISchemaOptions
  ): OpenAIStrictSchema | OpenAIResponseFormat;
  static toOpenAISchema(
    schema: z.ZodTypeAny,
    options?: OpenAISchemaOptions
  ): OpenAIStrictSchema | OpenAIResponseFormat {
    const strictSchema = compileToOpenAIStrict(schema);

    if (options && options.name !== undefined) {
      const name = options.name;
      if (!OPENAI_SCHEMA_NAME_REGEX.test(name)) {
        throw new Error(
          `Invalid OpenAI schema name "${name}". Schema name must match /^[a-zA-Z0-9_-]+$/ and be 1-64 characters long.`
        );
      }
      if (strictSchema.type !== "object") {
        throw new Error(
          `Invalid OpenAI strict schema: Root schema must be an object with additionalProperties: false (received "${strictSchema.type || "unknown"}").`
        );
      }
      return {
        type: "json_schema",
        json_schema: {
          name,
          strict: options.strict ?? true,
          ...(options.description ? { description: options.description } : {}),
          schema: strictSchema,
        },
      };
    }

    return strictSchema;
  }

  /**
   * Instance method forwarding to static toOpenAISchema.
   */
  toOpenAISchema(schema: z.ZodTypeAny): OpenAIStrictSchema;
  toOpenAISchema(
    schema: z.ZodTypeAny,
    options: OpenAISchemaOptions & { name: string }
  ): OpenAIResponseFormat;
  toOpenAISchema(
    schema: z.ZodTypeAny,
    options?: OpenAISchemaOptions
  ): OpenAIStrictSchema | OpenAIResponseFormat;
  toOpenAISchema(
    schema: z.ZodTypeAny,
    options?: OpenAISchemaOptions
  ): OpenAIStrictSchema | OpenAIResponseFormat {
    return DialectCompiler.toOpenAISchema(schema, options as any);
  }

  /**
   * Compiles a Zod schema directly into OpenAI strict JSON Schema object
   * with additionalProperties: false and all properties in required.
   */
  static toOpenAIStrictSchema(schema: z.ZodTypeAny): OpenAIStrictSchema {
    return compileToOpenAIStrict(schema);
  }

  toOpenAIStrictSchema(schema: z.ZodTypeAny): OpenAIStrictSchema {
    return DialectCompiler.toOpenAIStrictSchema(schema);
  }

  /**
   * Compiles a Zod schema into the OpenAI response_format wrapper.
   */
  static toOpenAIResponseFormat(
    schema: z.ZodTypeAny,
    options: OpenAISchemaOptions = {}
  ): OpenAIResponseFormat {
    const name = options.name ?? "flashcards";
    return DialectCompiler.toOpenAISchema(schema, { ...options, name });
  }

  toOpenAIResponseFormat(
    schema: z.ZodTypeAny,
    options: OpenAISchemaOptions = {}
  ): OpenAIResponseFormat {
    return DialectCompiler.toOpenAIResponseFormat(schema, options);
  }

  /**
   * Compiles a Zod schema into Anthropic Tool Definition format.
   * Wraps the schema into a tool named `emit_flashcards` (or options.name)
   * with a `cards` array (or options.propertyName) input schema.
   */
  static toAnthropicTool(
    schema: z.ZodTypeAny,
    options?: AnthropicToolOptions
  ): AnthropicToolDefinition {
    const name = options?.name ?? "emit_flashcards";
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      throw new Error(
        `Invalid Anthropic tool name "${name}". Tool name must match /^[a-zA-Z0-9_-]+$/ and be 1-64 characters long.`
      );
    }
    const description =
      options?.description ??
      "Emit a batch of generated flashcards matching the required structured schema.";
    const propertyName = options?.propertyName ?? "cards";

    const unwrapped = unwrapZodType(schema);
    const isAlreadyArray = unwrapped.baseSchema?._def?.typeName === "ZodArray";

    const arraySchema = isAlreadyArray
      ? compileToJsonSchema(schema)
      : {
          type: "array",
          items: compileToJsonSchema(schema),
        };

    return {
      name,
      description,
      input_schema: {
        type: "object",
        properties: {
          [propertyName]: arraySchema,
        },
        required: [propertyName],
        additionalProperties: false,
      },
    };
  }

  toAnthropicTool(
    schema: z.ZodTypeAny,
    options?: AnthropicToolOptions
  ): AnthropicToolDefinition {
    return DialectCompiler.toAnthropicTool(schema, options);
  }

  /**
   * Returns forced Anthropic tool_choice configuration for a given tool name.
   */
  static toAnthropicToolChoice(toolName: string = "emit_flashcards"): AnthropicToolChoice {
    return {
      type: "tool",
      name: toolName,
    };
  }

  toAnthropicToolChoice(toolName: string = "emit_flashcards"): AnthropicToolChoice {
    return DialectCompiler.toAnthropicToolChoice(toolName);
  }

  /**
   * Compiles a Zod schema into standard Draft-07 compatible JSON Schema for Ollama format option.
   */
  static toOllamaSchema(schema: z.ZodTypeAny): OllamaJsonSchema {
    return compileToJsonSchema(schema);
  }

  toOllamaSchema(schema: z.ZodTypeAny): OllamaJsonSchema {
    return DialectCompiler.toOllamaSchema(schema);
  }

  // ==========================================================================
  // Helper Batch Builders
  // ==========================================================================

  /**
   * Compiles a batch array schema for Google Gemini.
   */
  static toGeminiBatchSchema(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema
  ): GeminiSchema {
    const unwrapped = unwrapZodType(itemSchema);
    const arraySchema =
      unwrapped.baseSchema?._def?.typeName === "ZodArray"
        ? itemSchema
        : z.array(itemSchema);
    return DialectCompiler.toGeminiSchema(arraySchema);
  }

  toGeminiBatchSchema(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema
  ): GeminiSchema {
    return DialectCompiler.toGeminiBatchSchema(itemSchema);
  }

  /**
   * Compiles a batch schema for OpenAI Strict Structured Outputs.
   * Wraps items in a root object with `cards` array to conform to OpenAI's
   * object-root requirement.
   */
  static toOpenAIBatchSchema(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema,
    options?: OpenAISchemaOptions & { propertyName?: string }
  ): OpenAIResponseFormat {
    const propertyName = options?.propertyName ?? "cards";
    const name = options?.name ?? "flashcards";

    if (!OPENAI_SCHEMA_NAME_REGEX.test(name)) {
      throw new Error(
        `Invalid OpenAI schema name "${name}". Schema name must match /^[a-zA-Z0-9_-]+$/ and be 1-64 characters long.`
      );
    }

    const unwrappedItem = unwrapZodType(itemSchema);
    const effectiveItemSchema =
      unwrappedItem.baseSchema?._def?.typeName === "ZodArray"
        ? (unwrappedItem.baseSchema as z.ZodArray<any>)._def.type
        : itemSchema;

    const itemStrictSchema = DialectCompiler.toOpenAIStrictSchema(effectiveItemSchema);

    const rootSchema: OpenAIStrictSchema = {
      type: "object",
      properties: {
        [propertyName]: {
          type: "array",
          items: itemStrictSchema,
        },
      },
      required: [propertyName],
      additionalProperties: false,
    };

    return {
      type: "json_schema",
      json_schema: {
        name,
        strict: options?.strict ?? true,
        ...(options?.description ? { description: options.description } : {}),
        schema: rootSchema,
      },
    };
  }

  toOpenAIBatchSchema(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema,
    options?: OpenAISchemaOptions & { propertyName?: string }
  ): OpenAIResponseFormat {
    return DialectCompiler.toOpenAIBatchSchema(itemSchema, options);
  }

  /**
   * Compiles a batch tool definition for Anthropic.
   */
  static toAnthropicBatchTool(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema,
    options?: AnthropicToolOptions
  ): AnthropicToolDefinition {
    return DialectCompiler.toAnthropicTool(itemSchema, options);
  }

  toAnthropicBatchTool(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema,
    options?: AnthropicToolOptions
  ): AnthropicToolDefinition {
    return DialectCompiler.toAnthropicBatchTool(itemSchema, options);
  }

  /**
   * Compiles a batch array schema for Ollama format option.
   */
  static toOllamaBatchSchema(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema
  ): OllamaJsonSchema {
    const unwrapped = unwrapZodType(itemSchema);
    const arraySchema =
      unwrapped.baseSchema?._def?.typeName === "ZodArray"
        ? itemSchema
        : z.array(itemSchema);
    return DialectCompiler.toOllamaSchema(arraySchema);
  }

  toOllamaBatchSchema(
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema
  ): OllamaJsonSchema {
    return DialectCompiler.toOllamaBatchSchema(itemSchema);
  }

  /**
   * Polymorphic batch helper compiling a schema for any supported provider.
   */
  static toBatchSchema(
    dialect: "gemini",
    itemSchema?: z.ZodTypeAny
  ): GeminiSchema;
  static toBatchSchema(
    dialect: "openai",
    itemSchema?: z.ZodTypeAny,
    options?: OpenAISchemaOptions & { propertyName?: string }
  ): OpenAIResponseFormat;
  static toBatchSchema(
    dialect: "anthropic",
    itemSchema?: z.ZodTypeAny,
    options?: AnthropicToolOptions
  ): AnthropicToolDefinition;
  static toBatchSchema(
    dialect: "ollama",
    itemSchema?: z.ZodTypeAny
  ): OllamaJsonSchema;
  static toBatchSchema(
    dialect: SupportedDialect,
    itemSchema?: z.ZodTypeAny,
    options?: any
  ): GeminiSchema | OpenAIResponseFormat | AnthropicToolDefinition | OllamaJsonSchema;
  static toBatchSchema(
    dialect: SupportedDialect,
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema,
    options?: any
  ): GeminiSchema | OpenAIResponseFormat | AnthropicToolDefinition | OllamaJsonSchema {
    switch (dialect) {
      case "gemini":
        return DialectCompiler.toGeminiBatchSchema(itemSchema);
      case "openai":
        return DialectCompiler.toOpenAIBatchSchema(itemSchema, options);
      case "anthropic":
        return DialectCompiler.toAnthropicBatchTool(itemSchema, options);
      case "ollama":
        return DialectCompiler.toOllamaBatchSchema(itemSchema);
      default:
        throw new Error(`Unsupported provider dialect: ${dialect}`);
    }
  }

  toBatchSchema(
    dialect: "gemini",
    itemSchema?: z.ZodTypeAny
  ): GeminiSchema;
  toBatchSchema(
    dialect: "openai",
    itemSchema?: z.ZodTypeAny,
    options?: OpenAISchemaOptions & { propertyName?: string }
  ): OpenAIResponseFormat;
  toBatchSchema(
    dialect: "anthropic",
    itemSchema?: z.ZodTypeAny,
    options?: AnthropicToolOptions
  ): AnthropicToolDefinition;
  toBatchSchema(
    dialect: "ollama",
    itemSchema?: z.ZodTypeAny
  ): OllamaJsonSchema;
  toBatchSchema(
    dialect: SupportedDialect,
    itemSchema?: z.ZodTypeAny,
    options?: any
  ): GeminiSchema | OpenAIResponseFormat | AnthropicToolDefinition | OllamaJsonSchema;
  toBatchSchema(
    dialect: SupportedDialect,
    itemSchema: z.ZodTypeAny = CardGenerationDraftSchema,
    options?: any
  ): GeminiSchema | OpenAIResponseFormat | AnthropicToolDefinition | OllamaJsonSchema {
    return DialectCompiler.toBatchSchema(dialect as any, itemSchema, options);
  }
}
