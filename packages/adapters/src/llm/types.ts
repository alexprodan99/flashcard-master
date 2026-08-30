import { z } from "zod";
import { DifficultyLevelSchema, type DifficultyLevel } from "@flashcard-master/core";

export class LLMAuthenticationError extends Error {
  constructor(provider: string, message = "Invalid or missing API key.") {
    super(`[${provider}] Authentication failed: ${message}`);
    this.name = "LLMAuthenticationError";
  }
}

export class LLMRateLimitError extends Error {
  constructor(provider: string, message = "Rate limit exceeded (HTTP 429).") {
    super(`[${provider}] Rate limit error: ${message}`);
    this.name = "LLMRateLimitError";
  }
}

export class LLMResponseParsingError extends Error {
  constructor(provider: string, message: string, public readonly rawResponse?: string) {
    super(`[${provider}] Failed to parse generated flashcards JSON: ${message}`);
    this.name = "LLMResponseParsingError";
  }
}

export class LLMNetworkError extends Error {
  constructor(provider: string, message: string) {
    super(`[${provider}] Network communication error: ${message}`);
    this.name = "LLMNetworkError";
  }
}

export function cleanJsonString(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }
  return raw.replace(/```json\s*|\s*```/gi, "").trim();
}

export const CardDraftArraySchema = z.array(
  z.object({
    question: z.string().min(1, "Question cannot be empty"),
    answer: z.string().min(1, "Answer cannot be empty"),
    sourceQuote: z.string().min(1, "Source quote cannot be empty"),
    difficulty: DifficultyLevelSchema.optional().default("intermediate"),
  })
);

export interface LLMConfig {
  provider: "openai" | "gemini" | "anthropic" | "ollama";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  customFetch?: typeof fetch;
}
