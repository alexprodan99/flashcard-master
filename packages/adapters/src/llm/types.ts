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

export function cleanJsonString(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }
  let s = raw.replace(/```json\s*|\s*```/gi, "").trim();
  const firstBracket = s.indexOf("[");
  const firstBrace = s.indexOf("{");
  let startIdx = 0;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIdx = firstBracket;
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  }
  const lastBracket = s.lastIndexOf("]");
  const lastBrace = s.lastIndexOf("}");
  let endIdx = s.length;
  if (lastBracket !== -1 && lastBracket > lastBrace) {
    endIdx = lastBracket + 1;
  } else if (lastBrace !== -1) {
    endIdx = lastBrace + 1;
  }
  return s.slice(startIdx, endIdx).trim();
}

export function repairJsonString(raw: string): string {
  let s = cleanJsonString(raw);
  s = s.replace(/,\s*([\]}])/g, "$1");

  let openBrackets = 0;
  let openBraces = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }
  }

  if (inString) {
    s += '"';
  }

  let closing = "";
  for (let b = 0; b < openBraces; b++) closing += "}";
  for (let k = 0; k < openBrackets; k++) closing += "]";
  return s + closing;
}

export function extractCardsWithRegex(raw: string): CardGenerationDraft[] {
  const cards: CardGenerationDraft[] = [];
  const blockRegex = /\{([\s\S]*?)\}/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(raw)) !== null) {
    const block = blockMatch[1];
    if (!block.includes('"question"') && !block.includes('"answer"')) {
      continue;
    }

    const qMatch =
      block.match(/"question"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:answer|sourceQuote|source_quote|difficulty)"/i) ||
      block.match(/"question"\s*:\s*"([\s\S]*?)"/i);

    const aMatch =
      block.match(/"answer"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:sourceQuote|source_quote|question|difficulty)"/i) ||
      block.match(/"answer"\s*:\s*"([\s\S]*?)"/i);

    const sqMatch =
      block.match(/"(?:sourceQuote|source_quote)"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"(?:difficulty|question|answer)"|$)/i) ||
      block.match(/"(?:sourceQuote|source_quote)"\s*:\s*"([\s\S]*?)"/i);

    const diffMatch = block.match(/"difficulty"\s*:\s*"([^"]+)"/i);

    if (qMatch && aMatch && sqMatch) {
      const q = qMatch[1].replace(/\\"/g, '"').trim();
      const a = aMatch[1].replace(/\\"/g, '"').trim();
      const sq = sqMatch[1].replace(/\\"/g, '"').trim();
      const diffStr = diffMatch ? diffMatch[1].toLowerCase() : "intermediate";
      const diff: DifficultyLevel = diffStr === "beginner" || diffStr === "expert" ? diffStr : "intermediate";

      if (q && a && sq) {
        cards.push({
          question: q,
          answer: a,
          sourceQuote: sq,
          difficulty: diff,
        });
      }
    }
  }

  return cards;
}

export function parseCardDraftsFromJson(rawText: string, providerName = "llm"): CardGenerationDraft[] {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    throw new LLMResponseParsingError(providerName, "Empty message response from LLM.", rawText);
  }

  // Stage 1: Standard clean & parse
  try {
    const cleaned = cleanJsonString(rawText);
    const parsed = JSON.parse(cleaned);
    const rawArray = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.flashcards || Object.values(parsed)[0]);
    if (Array.isArray(rawArray) && rawArray.length > 0) {
      const validated = CardDraftArraySchema.parse(rawArray);
      return validated.map((c) => ({
        question: c.question,
        answer: c.answer,
        sourceQuote: c.sourceQuote,
        difficulty: c.difficulty as DifficultyLevel,
      }));
    }
  } catch {
    // Stage 1 failed, proceed to Stage 2
  }

  // Stage 2: Auto-repaired JSON parse
  try {
    const repaired = repairJsonString(rawText);
    const parsed = JSON.parse(repaired);
    const rawArray = Array.isArray(parsed) ? parsed : (parsed.cards || parsed.flashcards || Object.values(parsed)[0]);
    if (Array.isArray(rawArray) && rawArray.length > 0) {
      const valid = rawArray
        .map((c: any) => ({
          question: String(c.question || ""),
          answer: String(c.answer || ""),
          sourceQuote: String(c.sourceQuote || c.source_quote || ""),
          difficulty: (c.difficulty === "beginner" || c.difficulty === "expert" ? c.difficulty : "intermediate") as DifficultyLevel,
        }))
        .filter((c: any) => c.question && c.answer && c.sourceQuote);

      if (valid.length > 0) {
        return valid;
      }
    }
  } catch {
    // Stage 2 failed, proceed to Stage 3
  }

  // Stage 3: Regex pattern extraction fallback
  const extracted = extractCardsWithRegex(rawText);
  if (extracted.length > 0) {
    return extracted;
  }

  throw new LLMResponseParsingError(providerName, "No valid flashcards found in model output.", rawText);
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
