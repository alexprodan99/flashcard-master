import { z } from "zod";
import { DifficultyLevelSchema, type DifficultyLevel, type CardGenerationDraft } from "@flashcard-master/core";

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

/**
 * Direct strongly-typed extractor for provider-native structured outputs.
 * Parses JSON strings or pre-parsed objects directly without heuristics,
 * mapping keywords, sourceLocator, and symmetrical citation/sourceQuote fields.
 */
function tryRecoverTruncatedJson(str: string): any {
  let lastIndex = str.length;

  while (lastIndex > 0) {
    const braceIdx = str.lastIndexOf("}", lastIndex - 1);
    if (braceIdx === -1) break;
    lastIndex = braceIdx;

    const candidate = str.slice(0, braceIdx + 1);
    const closers = ["]}", "}", "]"];
    for (const closer of closers) {
      try {
        const parsed = JSON.parse(candidate + closer);
        const cards = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.cards)
            ? parsed.cards
            : typeof parsed === "object" && parsed !== null && (typeof parsed.question === "string" || typeof parsed.answer === "string")
              ? [parsed]
              : [];
        if (cards.length > 0) {
          const valid = cards.filter((c: any) => c && typeof c === "object" && (c.question || c.answer));
          if (valid.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }
  }
  return null;
}

export function parseStructuredCardDrafts(
  input: string | Record<string, any> | unknown[],
  providerName: string,
  options: { difficulty?: DifficultyLevel } = {}
): CardGenerationDraft[] {
  let parsed: any;
  let isTruncatedRecovery = false;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new LLMResponseParsingError(providerName, "Empty content received from LLM response.");
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err: any) {
      const recovered = tryRecoverTruncatedJson(trimmed);
      if (recovered) {
        parsed = recovered;
        isTruncatedRecovery = true;
      } else {
        throw new LLMResponseParsingError(providerName, `Failed to parse structured JSON: ${err.message}`, trimmed);
      }
    }
  } else if (typeof input === "object" && input !== null) {
    parsed = input;
  } else {
    throw new LLMResponseParsingError(providerName, "Invalid response payload type (expected string or object).");
  }

  const rawCards = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.cards)
      ? parsed.cards
      : typeof parsed === "object" && parsed !== null && (typeof parsed.question === "string" || typeof parsed.answer === "string")
        ? [parsed]
        : [];

  if (rawCards.length === 0) {
    throw new LLMResponseParsingError(providerName, "No flashcard items found in response payload.");
  }

  const drafts = rawCards.map((card: any) => {
    const citation = String(card?.citation || card?.sourceQuote || "").trim();
    const rawDiff = typeof card?.difficulty === "string" ? card.difficulty.toLowerCase().trim() : "";
    const difficulty: DifficultyLevel =
      rawDiff === "beginner" || rawDiff === "intermediate" || rawDiff === "expert" || rawDiff === "mixed"
        ? (rawDiff as DifficultyLevel)
        : options.difficulty === "mixed"
          ? "intermediate"
          : (options.difficulty ?? "intermediate");

    return {
      question: String(card?.question || "").trim(),
      answer: String(card?.answer || "").trim(),
      sourceQuote: citation,
      citation,
      difficulty,
      keywords: Array.isArray(card?.keywords)
        ? card.keywords.map((k: any) => (k != null ? String(k).trim() : "")).filter(Boolean)
        : [],
      sourceLocator: card?.sourceLocator ? String(card.sourceLocator).trim() : "",
    };
  });

  const validDrafts = drafts.filter((c: CardGenerationDraft) => c.question.length > 0 && c.answer.length > 0);
  if (validDrafts.length === 0) {
    throw new LLMResponseParsingError(providerName, "No valid flashcard items found in response payload.");
  }

  if (isTruncatedRecovery) {
    (validDrafts as any).isPartial = true;
    (validDrafts as any).partial = true;
  }

  return validDrafts;
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
