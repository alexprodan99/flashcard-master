import { describe, it, expect } from "vitest";
import { OpenAIAdapter } from "../src/llm/openai-adapter.js";
import { GeminiAdapter } from "../src/llm/gemini-adapter.js";
import { AnthropicAdapter } from "../src/llm/anthropic-adapter.js";
import { OllamaAdapter } from "../src/llm/ollama-adapter.js";
import { createLLMAdapter } from "../src/llm/llm-factory.js";
import { LLMAuthenticationError, LLMRateLimitError } from "../src/llm/types.js";

const SAMPLE_DRAFT_RESPONSE = JSON.stringify([
  {
    question: "What does WAL stand for in SQLite?",
    answer: "Write-Ahead Logging",
    sourceQuote: "SQLite utilizes Write-Ahead Logging (WAL) for concurrency.",
    difficulty: "intermediate",
  },
]);

const SAMPLE_CODE_FENCED_RESPONSE = `\`\`\`json
[
  {
    "question": "What does WAL stand for in SQLite?",
    "answer": "Write-Ahead Logging",
    "sourceQuote": "SQLite utilizes Write-Ahead Logging (WAL) for concurrency.",
    "difficulty": "intermediate"
  }
]
\`\`\``;

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

    it("parses markdown code fenced JSON output without errors", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: SAMPLE_CODE_FENCED_RESPONSE } }],
        }),
      }) as any;

      const adapter = new OpenAIAdapter({ apiKey: "sk-test", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("SQLite documentation text", {
        difficulty: "intermediate",
        personaPrompt: "You are a senior examiner.",
        targetCount: 1,
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].answer).toBe("Write-Ahead Logging");
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
          candidates: [{ content: { parts: [{ text: SAMPLE_CODE_FENCED_RESPONSE }] } }],
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
          content: [{ text: SAMPLE_CODE_FENCED_RESPONSE }],
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

    it("maps HTTP error response to LLMNetworkError preserving exact status and body", async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 404,
        text: async () => '{"type":"error","error":{"type":"not_found_error","message":"model: not-found"}}',
      }) as any;

      const adapter = new AnthropicAdapter({ apiKey: "claude-key", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "intermediate",
          personaPrompt: "test",
        })
      ).rejects.toThrow("HTTP error 404");
    });
  });

  describe("OllamaAdapter", () => {
    it("parses local Ollama message response", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: SAMPLE_CODE_FENCED_RESPONSE },
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

  describe("parseCardDraftsFromJson (Resilience & Auto-Repair)", () => {
    it("parses valid JSON array directly", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const drafts = parseCardDraftsFromJson(SAMPLE_DRAFT_RESPONSE, "test");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What does WAL stand for in SQLite?");
    });

    it("recovers completed cards from truncated unterminated JSON when token limit is hit", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const truncated = `[
        {
          "question": "What is Raft?",
          "answer": "Consensus algorithm",
          "sourceQuote": "Raft is a consensus protocol",
          "difficulty": "intermediate"
        },
        {
          "question": "What is Paxos?",
          "answer": "Classic consensus",
          "sourceQuote": "Paxos is a consensus protocol that is cut off...`;

      const drafts = parseCardDraftsFromJson(truncated, "anthropic");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What is Raft?");
      expect(drafts[0].answer).toBe("Consensus algorithm");
    });

    it("extracts cards with unescaped internal double quotes inside source quotes or code snippets", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const dirtyJson = `[
        {
          "question": "How to run the CLI?",
          "answer": "Use the model flag",
          "sourceQuote": "Execute agy --model="claude-3-5" to start.",
          "difficulty": "expert"
        }
      ]`;

      const drafts = parseCardDraftsFromJson(dirtyJson, "anthropic");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("How to run the CLI?");
      expect(drafts[0].sourceQuote).toContain('agy --model="claude-3-5"');
      expect(drafts[0].difficulty).toBe("expert");
    });

    it("extracts cards formatted as Claude XML tags", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const xml = `<flashcards>
        <card>
          <question>What is bmad-help?</question>
          <answer>It is a built-in skill.</answer>
          <sourceQuote>The bmad-help skill is available directly in your AI session.</sourceQuote>
          <difficulty>intermediate</difficulty>
        </card>
      </flashcards>`;

      const drafts = parseCardDraftsFromJson(xml, "anthropic");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What is bmad-help?");
      expect(drafts[0].answer).toBe("It is a built-in skill.");
    });

    it("extracts cards formatted as markdown bulleted Q&A pairs", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const md = `- Question: What is bmad-help?
- Answer: It is a skill.
- Source Quote: The bmad-help skill is available directly.
- Difficulty: intermediate

- Question: What does it inspect?
- Answer: It inspects your project.
- Source Quote: it inspects your project, sees what you’ve completed.
- Difficulty: intermediate`;

      const drafts = parseCardDraftsFromJson(md, "anthropic");
      expect(drafts.length).toBe(2);
      expect(drafts[0].question).toBe("What is bmad-help?");
      expect(drafts[1].question).toBe("What does it inspect?");
    });

    it("strips thinking blocks and parses embedded JSON array", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const thinkingJson = `<thinking>I should analyze the document carefully.</thinking>
[
  {
    "question": "What is bmad-help?",
    "answer": "It is a skill.",
    "sourceQuote": "The bmad-help skill is available directly.",
    "difficulty": "intermediate"
  }
]`;

      const drafts = parseCardDraftsFromJson(thinkingJson, "anthropic");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What is bmad-help?");
    });

    it("throws LLMResponseParsingError when no valid cards can be extracted from empty or garbage response", async () => {
      const { parseCardDraftsFromJson, LLMResponseParsingError } = await import("../src/llm/types.js");
      expect(() => parseCardDraftsFromJson("I cannot fulfill this request.", "anthropic")).toThrow(
        LLMResponseParsingError
      );
      expect(() => parseCardDraftsFromJson("", "anthropic")).toThrow(LLMResponseParsingError);
    });

    it("parses and preserves 'mixed' difficulty level from LLM output across JSON, XML, and Markdown formats", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");

      // JSON
      const jsonStr = JSON.stringify([
        {
          question: "What is an architectural invariant?",
          answer: "A rule that must never be broken.",
          sourceQuote: "Architectural invariants are non-negotiable.",
          difficulty: "mixed",
        },
      ]);
      const jsonCards = parseCardDraftsFromJson(jsonStr, "openai");
      expect(jsonCards[0].difficulty).toBe("mixed");

      // XML
      const xmlStr = `<card>
        <question>What is an architectural invariant?</question>
        <answer>A non-negotiable rule.</answer>
        <source_quote>Architectural invariants are non-negotiable.</source_quote>
        <difficulty>mixed</difficulty>
      </card>`;
      const xmlCards = parseCardDraftsFromJson(xmlStr, "gemini");
      expect(xmlCards[0].difficulty).toBe("mixed");

      // Markdown
      const mdStr = `- Question: What is an architectural invariant?
- Answer: A non-negotiable rule.
- Source Quote: Architectural invariants are non-negotiable.
- Difficulty: mixed`;
      const mdCards = parseCardDraftsFromJson(mdStr, "anthropic");
      expect(mdCards[0].difficulty).toBe("mixed");
    });

    it("generates adaptive progression prompt when difficulty is 'mixed' across all adapters", async () => {
      let capturedPrompts: string[] = [];

      const mockFetch = async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.system) {
          capturedPrompts.push(body.system);
        } else if (body.messages && body.messages[0]?.role === "system") {
          capturedPrompts.push(body.messages[0].content);
        } else if (body.contents) {
          capturedPrompts.push(body.contents[0].parts[0].text);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: SAMPLE_DRAFT_RESPONSE } }],
            candidates: [{ content: { parts: [{ text: SAMPLE_DRAFT_RESPONSE }] } }],
            content: [{ type: "text", text: SAMPLE_DRAFT_RESPONSE }],
            message: { content: SAMPLE_DRAFT_RESPONSE },
          }),
        };
      };

      const openai = new OpenAIAdapter({ apiKey: "test", customFetch: mockFetch as any });
      await openai.generateQAPairs("sample text", {
        difficulty: "mixed",
        personaPrompt: "Persona intro.",
        targetCount: 6,
      });

      const gemini = new GeminiAdapter({ apiKey: "test", customFetch: mockFetch as any });
      await gemini.generateQAPairs("sample text", {
        difficulty: "mixed",
        personaPrompt: "Persona intro.",
        targetCount: 6,
      });

      const anthropic = new AnthropicAdapter({ apiKey: "test", customFetch: mockFetch as any });
      await anthropic.generateQAPairs("sample text", {
        difficulty: "mixed",
        personaPrompt: "Persona intro.",
        targetCount: 6,
      });

      const ollama = new OllamaAdapter({ baseUrl: "http://localhost:11434", customFetch: mockFetch as any });
      await ollama.generateQAPairs("sample text", {
        difficulty: "mixed",
        personaPrompt: "Persona intro.",
        targetCount: 6,
      });

      expect(capturedPrompts.length).toBe(4);
      for (const prompt of capturedPrompts) {
        expect(prompt).toContain("balanced progression");
        expect(prompt).toContain("beginner fundamentals");
        expect(prompt).toContain("expert trade-offs");
      }
    });
  });
});
