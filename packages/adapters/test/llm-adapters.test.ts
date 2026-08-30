import { describe, it, expect } from "vitest";
import { OpenAIAdapter } from "../src/llm/openai-adapter.js";
import { GeminiAdapter } from "../src/llm/gemini-adapter.js";
import { AnthropicAdapter } from "../src/llm/anthropic-adapter.js";
import { OllamaAdapter } from "../src/llm/ollama-adapter.js";
import { createLLMAdapter } from "../src/llm/llm-factory.js";
import { LLMAuthenticationError, LLMRateLimitError, LLMResponseParsingError } from "../src/llm/types.js";

const SAMPLE_DRAFT_RESPONSE = JSON.stringify([
  {
    question: "What does WAL stand for in SQLite?",
    answer: "Write-Ahead Logging",
    sourceQuote: "SQLite utilizes Write-Ahead Logging (WAL) for concurrency.",
    difficulty: "intermediate",
  },
]);

describe("LLM Provider Adapters", () => {
  describe("OpenAIAdapter", () => {
    it("formats prompt, parses JSON output, and returns validated drafts", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: SAMPLE_DRAFT_RESPONSE } }],
        }),
      }) as any;

      const adapter = new OpenAIAdapter({ apiKey: "sk-test", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("SQLite documentation text", {
        difficulty: "intermediate",
        personaPrompt: "You are a senior examiner.",
        targetCount: 1,
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What does WAL stand for in SQLite?");
      expect(drafts[0].sourceQuote).toContain("Write-Ahead Logging");
    });

    it("maps HTTP 401 to LLMAuthenticationError", async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }) as any;

      const adapter = new OpenAIAdapter({ apiKey: "sk-bad", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "beginner",
          personaPrompt: "test",
        })
      ).rejects.toThrow(LLMAuthenticationError);
    });

    it("maps HTTP 429 to LLMRateLimitError", async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      }) as any;

      const adapter = new OpenAIAdapter({ apiKey: "sk-test", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "beginner",
          personaPrompt: "test",
        })
      ).rejects.toThrow(LLMRateLimitError);
    });
  });

  describe("GeminiAdapter", () => {
    it("parses Gemini candidate content parts into drafts", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: SAMPLE_DRAFT_RESPONSE }] } }],
        }),
      }) as any;

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("sample text", {
        difficulty: "intermediate",
        personaPrompt: "test",
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].answer).toBe("Write-Ahead Logging");
    });
  });

  describe("AnthropicAdapter", () => {
    it("parses Anthropic message content into drafts", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ text: SAMPLE_DRAFT_RESPONSE }],
        }),
      }) as any;

      const adapter = new AnthropicAdapter({ apiKey: "claude-key", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("sample text", {
        difficulty: "expert",
        personaPrompt: "test",
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].difficulty).toBe("intermediate");
    });
  });

  describe("OllamaAdapter", () => {
    it("parses local Ollama message response", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: SAMPLE_DRAFT_RESPONSE },
        }),
      }) as any;

      const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("sample text", {
        difficulty: "beginner",
        personaPrompt: "test",
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain("WAL");
    });
  });

  describe("LLMAdapterFactory", () => {
    it("instantiates the requested provider adapter", () => {
      const openai = createLLMAdapter({ provider: "openai", apiKey: "key" });
      expect(openai.providerName).toBe("openai");

      const gemini = createLLMAdapter({ provider: "gemini", apiKey: "key" });
      expect(gemini.providerName).toBe("gemini");

      const anthropic = createLLMAdapter({ provider: "anthropic", apiKey: "key" });
      expect(anthropic.providerName).toBe("anthropic");

      const ollama = createLLMAdapter({ provider: "ollama" });
      expect(ollama.providerName).toBe("ollama");
    });
  });
});
