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
export function parseStructuredCardDrafts(
  input: string | Record<string, any> | unknown[],
  providerName: string,
  options: { difficulty?: DifficultyLevel } = {}
): CardGenerationDraft[] {
  let parsed: any;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new LLMResponseParsingError(providerName, "Empty content received from LLM response.");
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err: any) {
      if (trimmed.startsWith("```")) {
        try {
          const unwrapped = trimmed.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
          parsed = JSON.parse(unwrapped);
        } catch (innerErr: any) {
          throw new LLMResponseParsingError(providerName, `Failed to parse structured JSON: ${innerErr.message}`, trimmed);
        }
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

  return validDrafts;
}

export function cleanJsonString(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }
  let s = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, "");
  s = s.replace(/```json\s*|\s*```/gi, "").trim();
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

/**
 * Checks whether a double quote character at `quoteIndex` in `raw` represents
 * a valid JSON closing quote (or opening key quote) as opposed to an unescaped
 * inner quote inside a string value.
 */
export function isClosingQuote(raw: string, quoteIndex: number): boolean {
  let j = quoteIndex + 1;
  while (j < raw.length && /\s/.test(raw[j])) {
    j++;
  }
  if (j >= raw.length) return true;
  const nextChar = raw[j];

  // Property key delimiter: "key":
  if (nextChar === ":") return true;

  // End of object or array: "value"} or "value"]
  if (nextChar === "}" || nextChar === "]") return true;

  // Next field or element: "value",
  if (nextChar === ",") {
    let k = j + 1;
    while (k < raw.length && /\s/.test(raw[k])) {
      k++;
    }
    if (k >= raw.length) return true;
    const afterComma = raw[k];
    // In JSON, after a comma, the next element can be a string key/value, object, array, or primitive (number, boolean, null)
    if (/["{\[\]0-9\-tfn]/.test(afterComma)) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Sanitizes raw JSON string from LLM responses by:
 * 1. Escaping illegal control characters (raw newlines, carriage returns, tabs, and all 0x00-0x1F chars) inside string literals.
 * 2. Escaping unescaped inner double quotes inside string values (e.g. C# code snippets or quotes).
 */
export function sanitizeJsonString(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let inString = false;
  let escapeNext = false;
  let result = "";

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escapeNext) {
      escapeNext = false;
      result += ch;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
        continue;
      } else {
        if (isClosingQuote(raw, i)) {
          inString = false;
          result += ch;
          continue;
        } else {
          // Unescaped inner quote within a string value
          result += '\\"';
          continue;
        }
      }
    }

    if (inString) {
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
      if (ch === "\b") {
        result += "\\b";
        continue;
      }
      if (ch === "\f") {
        result += "\\f";
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (code === 0) continue; // strip null bytes
        result += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
    }

    result += ch;
  }

  return result;
}

/**
 * Extracts balanced JSON object strings `{ ... }` from arbitrary text
 * by tracking brace depth while respecting quotes and escapes.
 * Unlike a flat regex, this correctly handles nested braces inside
 * strings or code snippets (e.g. C# class/method bodies in flashcards).
 */
export function extractJsonObjects(raw: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let startIdx = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

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
      if (ch === "{") {
        if (depth === 0) {
          startIdx = i;
        }
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          objects.push(raw.slice(startIdx, i + 1));
          startIdx = -1;
        } else if (depth < 0) {
          depth = 0;
          startIdx = -1;
        }
      }
    }
  }

  return objects;
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

export function extractFlexCard(obj: any): CardGenerationDraft | null {
  if (!obj || typeof obj !== "object") return null;

  const question = obj.question || obj.front || obj.prompt || obj.q || obj.Question || obj.Front;
  const answer = obj.answer || obj.back || obj.response || obj.a || obj.Answer || obj.Back;
  const sourceQuote =
    obj.sourceQuote ||
    obj.source_quote ||
    obj.quote ||
    obj.citation ||
    obj.source ||
    obj.sourceCitation ||
    obj.verbatim_quote ||
    obj.Quote ||
    obj.SourceQuote;
  const difficulty = obj.difficulty || obj.level || obj.Difficulty || "intermediate";

  if (question && answer) {
    const qStr = String(question).trim();
    const aStr = String(answer).trim();
    const sqStr = String(sourceQuote || aStr).trim();
    const diffStr = String(difficulty).toLowerCase().trim();
    const validDiff: DifficultyLevel = diffStr === "beginner" || diffStr === "expert" || diffStr === "mixed" ? diffStr : "intermediate";

    if (qStr.length > 0 && aStr.length > 0) {
      return {
        question: qStr,
        answer: aStr,
        sourceQuote: sqStr || aStr,
        difficulty: validDiff,
      };
    }
  }
  return null;
}

export function extractCardsDeep(parsed: any): CardGenerationDraft[] {
  const results: CardGenerationDraft[] = [];
  if (!parsed) return results;

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const card = extractFlexCard(item);
      if (card) {
        results.push(card);
      } else if (typeof item === "object") {
        results.push(...extractCardsDeep(item));
      }
    }
  } else if (typeof parsed === "object") {
    const directCard = extractFlexCard(parsed);
    if (directCard) {
      results.push(directCard);
    } else {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) || typeof val === "object") {
          results.push(...extractCardsDeep(val));
        }
      }
    }
  }
  return results;
}

export function extractCardFromRegexBlock(block: string): CardGenerationDraft | null {
  const qMatch =
    block.match(/"(?:question|front|prompt|q)"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:answer|back|response|a|sourceQuote|source_quote|quote|difficulty)"/i) ||
    block.match(/"(?:question|front|prompt|q)"\s*:\s*"([\s\S]*?)"/i);

  const aMatch =
    block.match(/"(?:answer|back|response|a)"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:sourceQuote|source_quote|quote|citation|source|difficulty|question|front)"/i) ||
    block.match(/"(?:answer|back|response|a)"\s*:\s*"([\s\S]*?)"/i);

  const sqMatch =
    block.match(/"(?:sourceQuote|source_quote|quote|citation|source|verbatim)"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"(?:difficulty|question|front|answer|back)"|$)/i) ||
    block.match(/"(?:sourceQuote|source_quote|quote|citation|source|verbatim)"\s*:\s*"([\s\S]*?)"/i);

  const diffMatch = block.match(/"(?:difficulty|level)"\s*:\s*"([^"]+)"/i);

  if (qMatch && aMatch) {
    const q = qMatch[1].replace(/\\"/g, '"').trim();
    const a = aMatch[1].replace(/\\"/g, '"').trim();
    const sq = sqMatch ? sqMatch[1].replace(/\\"/g, '"').trim() : a;
    const diffStr = diffMatch ? diffMatch[1].toLowerCase().trim() : "intermediate";
    const diff: DifficultyLevel = diffStr === "beginner" || diffStr === "expert" || diffStr === "mixed" ? diffStr : "intermediate";

    if (q && a) {
      return {
        question: q,
        answer: a,
        sourceQuote: sq || a,
        difficulty: diff,
      };
    }
  }
  return null;
}

export function extractCardsWithRegex(raw: string): CardGenerationDraft[] {
  const cards: CardGenerationDraft[] = [];
  // Pre-sanitize raw text so unescaped inner quotes in code snippets don't distort brace depth tracking
  const sanitizedRaw = sanitizeJsonString(raw);
  const objectBlocks = extractJsonObjects(sanitizedRaw);

  // Try parsing each extracted object block directly first
  for (const block of objectBlocks) {
    if (
      !block.includes('"question"') &&
      !block.includes('"front"') &&
      !block.includes('"prompt"') &&
      !block.includes('"q"')
    ) {
      continue;
    }

    // Try parsing the individual object after sanitization
    try {
      const sanitized = sanitizeJsonString(block);
      const parsed = JSON.parse(sanitized);
      const card = extractFlexCard(parsed);
      if (card) {
        cards.push(card);
        continue;
      }
    } catch {
      // Fall through to regex-based field extraction
    }

    const card = extractCardFromRegexBlock(block);
    if (card) {
      cards.push(card);
    }
  }

  // If extractJsonObjects found nothing (e.g. unclosed block at end of truncated string),
  // try flat regex extraction as a last resort
  if (cards.length === 0) {
    const blockRegex = /\{([\s\S]*?)\}/g;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRegex.exec(sanitizedRaw || raw)) !== null) {
      const block = blockMatch[1];
      if (
        !block.includes('"question"') &&
        !block.includes('"front"') &&
        !block.includes('"prompt"') &&
        !block.includes('"q"')
      ) {
        continue;
      }

      const card = extractCardFromRegexBlock(block);
      if (card) {
        cards.push(card);
      }
    }
  }

  return cards;
}

export function parseXmlCards(text: string): CardGenerationDraft[] {
  const cards: CardGenerationDraft[] = [];
  const cardBlockRegex = /<(?:card|flashcard|item|qa|entry)[\s\S]*?>([\s\S]*?)<\/(?:card|flashcard|item|qa|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardBlockRegex.exec(text)) !== null) {
    const block = match[1];
    const qMatch = block.match(/<(?:question|front|prompt|q)>([\s\S]*?)<\/(?:question|front|prompt|q)>/i);
    const aMatch = block.match(/<(?:answer|back|response|a)>([\s\S]*?)<\/(?:answer|back|response|a)>/i);
    const sqMatch = block.match(/<(?:source_quote|sourcequote|quote|citation|source|verbatim)>([\s\S]*?)<\/(?:source_quote|sourcequote|quote|citation|source|verbatim)>/i);
    const diffMatch = block.match(/<(?:difficulty|level)>([\s\S]*?)<\/(?:difficulty|level)>/i);

    if (qMatch && aMatch) {
      const q = qMatch[1].trim();
      const a = aMatch[1].trim();
      const sq = sqMatch ? sqMatch[1].trim() : a;
      const diffStr = diffMatch ? diffMatch[1].toLowerCase().trim() : "intermediate";
      const diff: DifficultyLevel = diffStr === "beginner" || diffStr === "expert" || diffStr === "mixed" ? diffStr : "intermediate";

      if (q && a) {
        cards.push({
          question: q,
          answer: a,
          sourceQuote: sq || a,
          difficulty: diff,
        });
      }
    }
  }

  return cards;
}

export function parseMarkdownQAPairs(text: string): CardGenerationDraft[] {
  const cards: CardGenerationDraft[] = [];
  const sections = text.split(/(?:\n\s*\n|\r?\n)(?=(?:[-*]\s*)?(?:#{1,4}\s*)?(?:\*{1,2})?(?:Card\s*\d+|\d+\.|\bQuestion\b|\bFront\b|\bQ:))/i);

  for (const section of sections) {
    if (!section.trim()) continue;

    const qMatch =
      section.match(
        /(?:(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Question|Front|Q)\s*(?:\*{1,2}|:)\s*)([^\n]+(?:\n(?!\s*(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Answer|Back|A|Quote|Source|Difficulty))[^\n]+)*)/i
      ) || section.match(/(?:(?:\*{1,2}|#+)\s*Card\s*\d+:\s*)([^\n]+)/i);

    const aMatch = section.match(
      /(?:(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Answer|Back|A)\s*(?:\*{1,2}|:)\s*)([^\n]+(?:\n(?!\s*(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Question|Front|Q|Quote|Source|Difficulty))[^\n]+)*)/i
    );

    const sqMatch = section.match(
      /(?:(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Source\s*Quote|Quote|Citation|Source|Verbatim)\s*(?:\*{1,2}|:)\s*)([^\n]+(?:\n(?!\s*(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Question|Front|Q|Answer|Back|Difficulty))[^\n]+)*)/i
    );

    const diffMatch = section.match(/(?:(?:[-*]\s*)?(?:\*{1,2}|#+)?\s*(?:Difficulty|Level)\s*(?:\*{1,2}|:)\s*)([^\n]+)/i);

    if (qMatch && aMatch) {
      const q = qMatch[1].replace(/^[\s*:"'-]+|[\s*:"'-]+$/g, "").trim();
      const a = aMatch[1].replace(/^[\s*:"'-]+|[\s*:"'-]+$/g, "").trim();
      const sq = sqMatch ? sqMatch[1].replace(/^[\s*:"'-]+|[\s*:"'-]+$/g, "").trim() : a;
      const diffStr = diffMatch ? diffMatch[1].toLowerCase().trim() : "intermediate";
      const diff: DifficultyLevel = diffStr === "beginner" || diffStr === "expert" || diffStr === "mixed" ? diffStr : "intermediate";

      if (q && a) {
        cards.push({
          question: q,
          answer: a,
          sourceQuote: sq || a,
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
    const cards = extractCardsDeep(parsed);
    if (cards.length > 0) {
      return cards;
    }
  } catch {
    // Stage 1 failed, proceed to Stage 1.5
  }

  // Stage 1.5: Sanitized JSON parse (handles unescaped control chars and inner quotes)
  try {
    const cleaned = cleanJsonString(rawText);
    const sanitized = sanitizeJsonString(cleaned);
    const parsed = JSON.parse(sanitized);
    const cards = extractCardsDeep(parsed);
    if (cards.length > 0) {
      return cards;
    }
  } catch {
    // Stage 1.5 failed, proceed to Stage 2
  }

  // Stage 2: Auto-repaired JSON parse
  try {
    const repaired = repairJsonString(rawText);
    const sanitized = sanitizeJsonString(repaired);
    const parsed = JSON.parse(sanitized);
    const cards = extractCardsDeep(parsed);
    if (cards.length > 0) {
      return cards;
    }
  } catch {
    // Stage 2 failed, proceed to Stage 3
  }

  // Stage 3: Robust object-block depth extraction fallback
  const extracted = extractCardsWithRegex(rawText);
  if (extracted.length > 0) {
    return extracted;
  }

  // Stage 4: XML tag parser fallback
  const xmlCards = parseXmlCards(rawText);
  if (xmlCards.length > 0) {
    return xmlCards;
  }

  // Stage 5: Markdown bullet / Q&A text fallback
  const mdCards = parseMarkdownQAPairs(rawText);
  if (mdCards.length > 0) {
    return mdCards;
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
