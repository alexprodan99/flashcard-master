import { describe, it, expect } from "vitest";
import { OpenAIAdapter } from "../src/llm/openai-adapter.js";
import { GeminiAdapter } from "../src/llm/gemini-adapter.js";
import { AnthropicAdapter } from "../src/llm/anthropic-adapter.js";
import { OllamaAdapter } from "../src/llm/ollama-adapter.js";
import { createLLMAdapter } from "../src/llm/llm-factory.js";
import {
  LLMAuthenticationError,
  LLMRateLimitError,
  LLMNetworkError,
  LLMResponseParsingError,
  parseStructuredCardDrafts,
} from "../src/llm/types.js";

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

    it("transmits strict json_schema response_format and extracts cards with enriched fields", async () => {
      let capturedBody: any;
      const mockFetch = async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    cards: [
                      {
                        question: "What is an inverted index in search engines?",
                        answer: "A database index storing mapping from words to their document locations.",
                        citation: "An inverted index is an index data structure storing a mapping from content.",
                        keywords: ["search", "inverted index", "retrieval"],
                        sourceLocator: "Chapter 4, Section 2",
                        difficulty: "intermediate",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        };
      };

      const adapter = new OpenAIAdapter({ apiKey: "sk-test", customFetch: mockFetch as any });
      const drafts = await adapter.generateQAPairs("Sample search document", {
        difficulty: "intermediate",
        personaPrompt: "You are a search systems expert.",
        targetCount: 1,
      });

      expect(capturedBody.response_format.type).toBe("json_schema");
      expect(capturedBody.response_format.json_schema.name).toBe("flashcards");
      expect(capturedBody.response_format.json_schema.strict).toBe(true);
      expect(capturedBody.response_format.json_schema.schema.properties.cards.type).toBe("array");

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain("inverted index");
      expect(drafts[0].keywords).toEqual(["search", "inverted index", "retrieval"]);
      expect(drafts[0].sourceLocator).toBe("Chapter 4, Section 2");
      expect(drafts[0].citation).toContain("mapping from content");
      expect(drafts[0].sourceQuote).toContain("mapping from content");
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

    it("filters out internal thought parts from thinking models and preserves the JSON draft", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: "Let's think step by step. We need to create flashcards about WAL." },
                  { text: SAMPLE_DRAFT_RESPONSE },
                ],
              },
            },
          ],
        }),
      }) as any;

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("sample text", {
        difficulty: "intermediate",
        personaPrompt: "test",
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What does WAL stand for in SQLite?");
    });

    it("concatenates multiple candidate text parts into unified JSON", async () => {
      const part1 = '[{"question": "What is WAL?", "answer": "Write-';
      const part2 = 'Ahead Logging", "sourceQuote": "SQLite utilizes WAL.", "difficulty": "intermediate"}]';
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: part1 }, { text: part2 }],
              },
            },
          ],
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

    it("transmits responseSchema in generationConfig and extracts drafts with enriched fields", async () => {
      let capturedBody: any;
      const mockFetch = async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify([
                        {
                          question: "What is self-attention in Transformer architectures?",
                          answer: "An attention mechanism relating different positions of a single sequence to compute a representation.",
                          citation: "Self-attention is an attention mechanism relating different positions of a single sequence.",
                          keywords: ["transformer", "self-attention", "nlp"],
                          sourceLocator: "Section 3.2, Page 4",
                          difficulty: "expert",
                        },
                      ]),
                    },
                  ],
                },
              },
            ],
          }),
        };
      };

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch as any });
      const drafts = await adapter.generateQAPairs("Attention Is All You Need paper text", {
        difficulty: "expert",
        personaPrompt: "You are a machine learning researcher.",
        targetCount: 1,
      });

      expect(capturedBody.generationConfig.responseMimeType).toBe("application/json");
      expect(capturedBody.generationConfig.responseSchema.type).toBe("ARRAY");
      expect(capturedBody.generationConfig.responseSchema.items.type).toBe("OBJECT");
      expect(capturedBody.generationConfig.responseSchema.items.properties.keywords.type).toBe("ARRAY");

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain("self-attention");
      expect(drafts[0].keywords).toEqual(["transformer", "self-attention", "nlp"]);
      expect(drafts[0].sourceLocator).toBe("Section 3.2, Page 4");
      expect(drafts[0].citation).toContain("relating different positions");
      expect(drafts[0].sourceQuote).toContain("relating different positions");
      expect(drafts[0].difficulty).toBe("expert");
    });

    it("defaults to gemini-3.6-flash when model is omitted", () => {
      const adapter = new GeminiAdapter({ apiKey: "gemini-key" });
      expect(adapter.model).toBe("gemini-3.6-flash");
    });

    it("throws LLMResponseParsingError when candidate finishReason is SAFETY", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ finishReason: "SAFETY" }],
        }),
      }) as any;

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "intermediate",
          personaPrompt: "test",
        })
      ).rejects.toThrow("Generation blocked by Gemini safety filters.");
    });

    it("throws LLMResponseParsingError when candidate finishReason is RECITATION", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ finishReason: "RECITATION" }],
        }),
      }) as any;

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "intermediate",
          personaPrompt: "test",
        })
      ).rejects.toThrow("Generation blocked by Gemini recitation check.");
    });

    it("throws LLMResponseParsingError when prompt is blocked by policy", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          promptFeedback: { blockReason: "PROHIBITED_CONTENT" },
        }),
      }) as any;

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "intermediate",
          personaPrompt: "test",
        })
      ).rejects.toThrow("Prompt blocked by Gemini policy: PROHIBITED_CONTENT");
    });

    it("throws LLMResponseParsingError without leaking thoughts when response has only thought parts", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "I should analyze the document carefully." }],
              },
            },
          ],
        }),
      }) as any;

      const adapter = new GeminiAdapter({ apiKey: "gemini-key", customFetch: mockFetch });
      await expect(
        adapter.generateQAPairs("sample text", {
          difficulty: "intermediate",
          personaPrompt: "test",
        })
      ).rejects.toThrow("No text content returned in Gemini response (only internal thoughts).");
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

    it("concatenates multiple text content parts from Anthropic into unified response", async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: [
            { type: "text", text: '[{"question": "What is Raft?", "answer": ' },
            { type: "text", text: '"Consensus algorithm", "sourceQuote": "Raft is consensus", "difficulty": "intermediate"}]' },
          ],
        }),
      }) as any;

      const adapter = new AnthropicAdapter({ apiKey: "claude-key", customFetch: mockFetch });
      const drafts = await adapter.generateQAPairs("sample text", {
        difficulty: "intermediate",
        personaPrompt: "test",
      });

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What is Raft?");
      expect(drafts[0].answer).toBe("Consensus algorithm");
    });

    it("transmits forced tool calling schema and extracts drafts from tool_use.input.cards", async () => {
      let capturedBody: any;
      const mockFetch = async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [
              {
                type: "tool_use",
                id: "call_abc123",
                name: "emit_flashcards",
                input: {
                  cards: [
                    {
                      question: "How does Raft elect a new cluster leader?",
                      answer: "Candidates request votes from peers; a candidate winning a majority of votes becomes the leader.",
                      citation: "A candidate wins an election if it receives votes from a majority of the servers in the full cluster.",
                      keywords: ["raft", "consensus", "leader election"],
                      sourceLocator: "Section 5.2, Leader election",
                      difficulty: "intermediate",
                    },
                  ],
                },
              },
            ],
          }),
        };
      };

      const adapter = new AnthropicAdapter({ apiKey: "claude-key", customFetch: mockFetch as any });
      const drafts = await adapter.generateQAPairs("Raft consensus algorithm paper text", {
        difficulty: "intermediate",
        personaPrompt: "You are a distributed systems architect.",
        targetCount: 1,
      });

      expect(capturedBody.tools).toBeDefined();
      expect(capturedBody.tools[0].name).toBe("emit_flashcards");
      expect(capturedBody.tool_choice).toEqual({ type: "tool", name: "emit_flashcards" });
      expect(capturedBody.tools[0].input_schema.properties.cards.type).toBe("array");

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain("Raft elect");
      expect(drafts[0].keywords).toEqual(["raft", "consensus", "leader election"]);
      expect(drafts[0].sourceLocator).toBe("Section 5.2, Leader election");
      expect(drafts[0].citation).toContain("majority of the servers");
      expect(drafts[0].sourceQuote).toContain("majority of the servers");
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

    it("transmits batch JSON schema in format option and extracts structured response", async () => {
      let capturedBody: any;
      const mockFetch = async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: {
              content: JSON.stringify([
                {
                  question: "What is the primary trade-off of LSM trees compared to B-trees?",
                  answer: "LSM trees optimize for high-throughput write performance at the cost of slower point lookups.",
                  citation: "Log-Structured Merge-trees provide write optimization by buffering in memory.",
                  keywords: ["lsm-tree", "b-tree", "storage engine"],
                  sourceLocator: "Chapter 3, Storage Engines",
                  difficulty: "expert",
                },
              ]),
            },
          }),
        };
      };

      const adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434", customFetch: mockFetch as any });
      const drafts = await adapter.generateQAPairs("Designing Data-Intensive Applications chapter", {
        difficulty: "expert",
        personaPrompt: "You are a database engine developer.",
        targetCount: 1,
      });

      expect(capturedBody.format).toBeDefined();
      expect(capturedBody.format.type).toBe("array");
      expect(capturedBody.format.items.type).toBe("object");
      expect(capturedBody.format.items.properties.keywords.type).toBe("array");

      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain("LSM trees");
      expect(drafts[0].keywords).toEqual(["lsm-tree", "b-tree", "storage engine"]);
      expect(drafts[0].sourceLocator).toBe("Chapter 3, Storage Engines");
      expect(drafts[0].citation).toContain("Log-Structured Merge-trees");
      expect(drafts[0].sourceQuote).toContain("Log-Structured Merge-trees");
      expect(drafts[0].difficulty).toBe("expert");
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

    it("extracts cards containing C# code snippets with nested curly braces, raw newlines, and unescaped quotes", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const csharpJson = `[
        {
          "question": "How do you check if a user has the "admin" role in claims?",
          "answer": "You define a transformation:\\npublic class MyTransformation : IClaimsTransformation {\\n    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal) {\\n        if (principal.HasClaim(c => c.Type == \\"role\\")) {\\n            return Task.FromResult(principal);\\n        }\\n    }\\n}",
          "sourceQuote": "public class MyTransformation : IClaimsTransformation { }",
          "difficulty": "intermediate"
        }
      ]`;

      const drafts = parseCardDraftsFromJson(csharpJson, "gemini");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain('the "admin" role');
      expect(drafts[0].answer).toContain("IClaimsTransformation");
      expect(drafts[0].answer).toContain("TransformAsync");
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

    it("strips DeepSeek and Ollama <think> tags from model output", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const thinkTagJson = `<think>
I need to generate a card about WAL in SQLite.
Let's see: { "WAL": "Write-Ahead Logging" }
</think>
[
  {
    "question": "What is WAL?",
    "answer": "Write-Ahead Logging",
    "sourceQuote": "SQLite utilizes WAL.",
    "difficulty": "intermediate"
  }
]`;

      const drafts = parseCardDraftsFromJson(thinkTagJson, "ollama");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What is WAL?");
      expect(drafts[0].answer).toBe("Write-Ahead Logging");
    });

    it("sanitizes raw unescaped newlines and tabs inside JSON string values", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      // Use actual unescaped control chars (ASCII 0x0A, 0x09) inside JSON string literal
      const rawWithControlChars = "[\n  {\n    \"question\": \"What is WAL?\",\n    \"answer\": \"Line 1\nLine 2 with \t tab\",\n    \"sourceQuote\": \"Quote\",\n    \"difficulty\": \"intermediate\"\n  }\n]";
      const drafts = parseCardDraftsFromJson(rawWithControlChars, "gemini");
      expect(drafts.length).toBe(1);
      expect(drafts[0].answer).toBe("Line 1\nLine 2 with \t tab");
    });

    it("preserves closing quotes in JSON arrays followed by numbers, booleans, or null", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const jsonWithPrimitives = `[
        {
          "question": "What are response codes?",
          "answer": "Status is 200",
          "sourceQuote": "Status is 200",
          "difficulty": "intermediate",
          "tags": ["http", 200, "active", true, "deprecated", null]
        }
      ]`;

      const drafts = parseCardDraftsFromJson(jsonWithPrimitives, "gemini");
      expect(drafts.length).toBe(1);
      expect(drafts[0].answer).toBe("Status is 200");
    });

    it("extracts card drafts from free-form conversational text containing embedded JSON blocks with nested braces (Stage 3 fallback)", async () => {
      const { parseCardDraftsFromJson } = await import("../src/llm/types.js");
      const preambleText = `Certainly! Here is the flashcard you requested:
      {
        "question": "How do you implement a background worker in C#?",
        "answer": "You write: public class Worker : BackgroundService { protected override async Task ExecuteAsync(CancellationToken ct) { await Task.Delay(1000, ct); } }",
        "sourceQuote": "public class Worker : BackgroundService { }",
        "difficulty": "expert"
      }
      I hope this helps you study!`;

      const drafts = parseCardDraftsFromJson(preambleText, "gemini");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toContain("background worker");
      expect(drafts[0].answer).toContain("BackgroundService");
      expect(drafts[0].difficulty).toBe("expert");
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

  describe("parseStructuredCardDrafts (Native Structured Output Parsing)", () => {
    it("parses valid JSON array directly", () => {
      const drafts = parseStructuredCardDrafts(SAMPLE_DRAFT_RESPONSE, "openai");
      expect(drafts.length).toBe(1);
      expect(drafts[0].question).toBe("What does WAL stand for in SQLite?");
      expect(drafts[0].sourceQuote).toContain("Write-Ahead Logging");
      expect(drafts[0].citation).toContain("Write-Ahead Logging");
      expect(drafts[0].keywords).toEqual([]);
      expect(drafts[0].sourceLocator).toBe("");
    });

    it("parses OpenAI wrapped { cards: [...] } object", () => {
      const payload = JSON.stringify({
        cards: [
          {
            question: "What is WAL?",
            answer: "Write-Ahead Logging",
            citation: "WAL is Write-Ahead Logging",
            keywords: ["wal", "sqlite"],
            sourceLocator: "Sec 1",
            difficulty: "intermediate",
          },
        ],
      });
      const drafts = parseStructuredCardDrafts(payload, "openai");
      expect(drafts.length).toBe(1);
      expect(drafts[0].keywords).toEqual(["wal", "sqlite"]);
      expect(drafts[0].sourceLocator).toBe("Sec 1");
    });

    it("parses Anthropic pre-parsed tool_use object directly", () => {
      const toolInput = {
        cards: [
          {
            question: "What is Raft?",
            answer: "Consensus algorithm",
            citation: "Raft is consensus",
            keywords: ["raft"],
            sourceLocator: "p. 1",
            difficulty: "Expert",
          },
        ],
      };
      const drafts = parseStructuredCardDrafts(toolInput, "anthropic");
      expect(drafts.length).toBe(1);
      expect(drafts[0].difficulty).toBe("expert");
      expect(drafts[0].keywords).toEqual(["raft"]);
    });

    it("normalizes keywords by stringifying, trimming, and filtering nulls/empty strings", () => {
      const toolInput = {
        cards: [
          {
            question: "Question text here?",
            answer: "Answer text here.",
            citation: "Citation text.",
            keywords: [" valid ", null, undefined, "", "  tag  "],
            sourceLocator: "Loc",
          },
        ],
      };
      const drafts = parseStructuredCardDrafts(toolInput, "test");
      expect(drafts[0].keywords).toEqual(["valid", "tag"]);
    });

    it("throws LLMResponseParsingError for empty object {}", () => {
      expect(() => parseStructuredCardDrafts("{}", "openai")).toThrow(LLMResponseParsingError);
      expect(() => parseStructuredCardDrafts({}, "anthropic")).toThrow(LLMResponseParsingError);
    });

    it("throws LLMResponseParsingError for empty array [] or empty cards { cards: [] }", () => {
      expect(() => parseStructuredCardDrafts("[]", "gemini")).toThrow(LLMResponseParsingError);
      expect(() => parseStructuredCardDrafts({ cards: [] }, "anthropic")).toThrow(LLMResponseParsingError);
    });

    it("throws LLMResponseParsingError for malformed JSON string attaching raw text", () => {
      const malformed = '{"cards": [{"question": "cut off...';
      try {
        parseStructuredCardDrafts(malformed, "gemini");
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(LLMResponseParsingError);
        expect(err.rawResponse).toBe(malformed);
      }
    });

    it("recovers completed cards from truncated JSON array when token limit is hit", () => {
      const truncatedObject = `{"cards": [
        {"question": "What is WAL?", "answer": "Write-Ahead Logging", "citation": "WAL mode", "keywords": ["wal", "sqlite"], "sourceLocator": "Section 1"},
        {"question": "What is IPC?", "answer": "Inter-Process Communication", "citation": "IPC message", "keywords": ["ipc"], "sourceLocator": "Section 2"},
        {"question": "What is truncated?", "answer": "Incom`;

      const drafts = parseStructuredCardDrafts(truncatedObject, "openai");
      expect(drafts.length).toBe(2);
      expect(drafts[0].question).toBe("What is WAL?");
      expect(drafts[0].keywords).toEqual(["wal", "sqlite"]);
      expect(drafts[1].question).toBe("What is IPC?");
      expect((drafts as any).isPartial).toBe(true);

      const truncatedRootArray = `[
        {"question": "What is SSE?", "answer": "Server-Sent Events", "citation": "SSE stream", "keywords": ["sse"], "sourceLocator": "Sec 3"},
        {"question": "What is partial?`;

      const rootDrafts = parseStructuredCardDrafts(truncatedRootArray, "gemini");
      expect(rootDrafts.length).toBe(1);
      expect(rootDrafts[0].question).toBe("What is SSE?");
      expect((rootDrafts as any).isPartial).toBe(true);
    });

    it("throws LLMResponseParsingError for card missing question or answer", () => {
      const payload = JSON.stringify([{ question: "", answer: "answer" }]);
      expect(() => parseStructuredCardDrafts(payload, "gemini")).toThrow(LLMResponseParsingError);
    });
  });

  describe("Network and Connection Error Resilience", () => {
    it("maps TypeError fetch failed to LLMNetworkError across all adapters", async () => {
      const mockFailingFetch = async () => {
        throw new TypeError("fetch failed");
      };

      const openai = new OpenAIAdapter({ apiKey: "key", customFetch: mockFailingFetch as any });
      await expect(
        openai.generateQAPairs("text", { difficulty: "beginner", personaPrompt: "p" })
      ).rejects.toThrow(LLMNetworkError);

      const gemini = new GeminiAdapter({ apiKey: "key", customFetch: mockFailingFetch as any });
      await expect(
        gemini.generateQAPairs("text", { difficulty: "beginner", personaPrompt: "p" })
      ).rejects.toThrow(LLMNetworkError);

      const anthropic = new AnthropicAdapter({ apiKey: "key", customFetch: mockFailingFetch as any });
      await expect(
        anthropic.generateQAPairs("text", { difficulty: "beginner", personaPrompt: "p" })
      ).rejects.toThrow(LLMNetworkError);

      const ollama = new OllamaAdapter({ customFetch: mockFailingFetch as any });
      await expect(
        ollama.generateQAPairs("text", { difficulty: "beginner", personaPrompt: "p" })
      ).rejects.toThrow(LLMNetworkError);
    });
  });
});
