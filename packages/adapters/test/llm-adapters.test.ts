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

    it("parses JSON response string into drafts without errors", async () => {
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

  describe("Adaptive Progression Prompting", () => {
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

    it("throws LLMResponseParsingError for empty string or whitespace-only input", () => {
      expect(() => parseStructuredCardDrafts("", "openai")).toThrow(LLMResponseParsingError);
      expect(() => parseStructuredCardDrafts("   \n\t  ", "anthropic")).toThrow(LLMResponseParsingError);
    });

    it("throws LLMResponseParsingError for non-JSON conversational prose without valid cards", () => {
      const rawText = "I cannot fulfill this request because of policy restrictions.";
      try {
        parseStructuredCardDrafts(rawText, "anthropic");
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(LLMResponseParsingError);
        expect(err.rawResponse).toBe(rawText);
      }
    });

    it("parses and preserves all difficulty levels ('beginner', 'intermediate', 'expert', 'mixed')", () => {
      const payload = JSON.stringify([
        { question: "Q1", answer: "A1", difficulty: "beginner" },
        { question: "Q2", answer: "A2", difficulty: "expert" },
        { question: "Q3", answer: "A3", difficulty: "mixed" },
      ]);
      const drafts = parseStructuredCardDrafts(payload, "gemini");
      expect(drafts[0].difficulty).toBe("beginner");
      expect(drafts[1].difficulty).toBe("expert");
      expect(drafts[2].difficulty).toBe("mixed");
    });

    it("maintains symmetrical sourceQuote and citation fields", () => {
      const payload = JSON.stringify([
        { question: "Q1", answer: "A1", sourceQuote: "Quote text" },
        { question: "Q2", answer: "A2", citation: "Citation text" },
      ]);
      const drafts = parseStructuredCardDrafts(payload, "openai");
      expect(drafts[0].sourceQuote).toBe("Quote text");
      expect(drafts[0].citation).toBe("Quote text");
      expect(drafts[1].sourceQuote).toBe("Citation text");
      expect(drafts[1].citation).toBe("Citation text");
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
