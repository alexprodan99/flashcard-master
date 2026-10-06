import { describe, it, expect } from "vitest";
import { CardGenerationService, formatCardSourceLocator } from "../src/services/card-generation-service.js";
import type { LLMProviderPort, CardGenerationDraft } from "../src/ports/index.js";
import type { CleanTextDocument } from "../src/domain/models.js";

class MockLLMProvider implements LLMProviderPort {
  readonly providerName = "mock-llm";
  public calls: { text: string; options: any }[] = [];

  async generateQAPairs(text: string, options: any): Promise<CardGenerationDraft[]> {
    this.calls.push({ text, options });
    return [
      {
        question: "What is Raft leader election?",
        answer: "The process of selecting a coordinator node via randomized heartbeat timers.",
        sourceQuote: "Leader election in Raft relies on randomized heartbeat timers.",
        difficulty: options.difficulty,
      },
    ];
  }
}

describe("CardGenerationService", () => {
  it("returns empty array when document is empty", async () => {
    const mock = new MockLLMProvider();
    const service = new CardGenerationService(mock);

    const doc: CleanTextDocument = {
      id: "doc-1",
      sourceId: "source-1",
      title: "Empty Doc",
      textContent: "   ",
      contentHash: "abc",
    };

    const drafts = await service.generateFromDocument(doc);
    expect(drafts).toEqual([]);
    expect(mock.calls.length).toBe(0);
  });

  it("chunks document, invokes LLMProviderPort, and attaches metadata", async () => {
    const mock = new MockLLMProvider();
    const service = new CardGenerationService(mock);

    const doc: CleanTextDocument = {
      id: "doc-2",
      sourceId: "source-2",
      title: "Raft Protocol",
      textContent: "Leader election in Raft relies on randomized heartbeat timers.",
      originUrl: "https://raft.github.io",
      contentHash: "hash-raft",
    };

    const drafts = await service.generateFromDocument(doc, {
      difficulty: "expert",
      persona: "strict-examiner",
    });

    expect(drafts.length).toBe(1);
    const card = drafts[0];
    expect(card.question).toBe("What is Raft leader election?");
    expect(card.sourceQuote).toContain("Leader election in Raft");
    expect(card.difficulty).toBe("expert");
    expect(card.sourceId).toBe("source-2");
    expect(card.originUrl).toBe("https://raft.github.io");
    expect(card.documentTitle).toBe("Raft Protocol");
  });

  it("throws fatal error when all chunks fail to generate cards", async () => {
    const failingProvider: LLMProviderPort = {
      providerName: "failing-llm",
      async generateQAPairs(): Promise<CardGenerationDraft[]> {
        throw new Error("[failing-llm] Network communication error: Request timed out");
      },
    };

    const service = new CardGenerationService(failingProvider);
    const doc: CleanTextDocument = {
      id: "doc-3",
      sourceId: "source-3",
      title: "Timeout Doc",
      textContent: "Valid content that will timeout when sending to LLM.",
      contentHash: "hash-timeout",
    };

    await expect(service.generateFromDocument(doc)).rejects.toThrow(
      "[failing-llm] Network communication error: Request timed out"
    );
  });

  it("adaptively backfills discarded ungrounded cards to fulfill target count", async () => {
    let callCount = 0;
    const flakeyQuoteProvider: LLMProviderPort = {
      providerName: "flakey-llm",
      async generateQAPairs(text: string, options: any): Promise<CardGenerationDraft[]> {
        callCount++;
        if (callCount === 1) {
          // First call: returns 2 cards, 1 valid and 1 invalid quote
          return [
            {
              question: "What is Raft?",
              answer: "Consensus protocol.",
              sourceQuote: "Raft is a distributed consensus algorithm designed to be easy to understand.",
              difficulty: options.difficulty,
            },
            {
              question: "Hallucinated question?",
              answer: "Fake answer.",
              sourceQuote: "This sentence does not exist anywhere in the text document.",
              difficulty: options.difficulty,
            },
          ];
        } else {
          // Backfill call: returns valid replacement card
          return [
            {
              question: "How does Raft elect leaders?",
              answer: "Via randomized timers.",
              sourceQuote: "Randomized timers ensure that split votes are rare and resolved quickly across leader elections.",
              difficulty: options.difficulty,
            },
          ];
        }
      },
    };

    const service = new CardGenerationService(flakeyQuoteProvider);
    const doc: CleanTextDocument = {
      id: "doc-4",
      sourceId: "source-4",
      title: "Raft Consensus",
      textContent:
        "Raft is a distributed consensus algorithm designed to be easy to understand. It divides time into terms of arbitrary length. Randomized timers ensure that split votes are rare and resolved quickly across leader elections.",
      contentHash: "hash-4",
    };

    const drafts = await service.generateFromDocument(doc, {
      targetCountPerChunk: 2,
    });

    expect(callCount).toBe(2); // Initial call + backfill retry
    expect(drafts.length).toBe(2);
    expect(drafts[0].question).toBe("What is Raft?");
    expect(drafts[1].question).toBe("How does Raft elect leaders?");
  });

  it("passes depthMode and chunkMultiplier through to PromptBuilder and TextChunker", async () => {
    let capturedPrompt = "";
    const mockProvider: LLMProviderPort = {
      providerName: "test-llm",
      async generateQAPairs(_text: string, options: any): Promise<CardGenerationDraft[]> {
        capturedPrompt = options.personaPrompt;
        return [
          {
            question: "How do Raft terms operate during network partitions?",
            answer: "Terms act as logical clocks. Leaders in disconnected minor partitions cannot commit entries because they fail to acquire quorum votes.",
            sourceQuote: "Terms act as logical clocks in Raft.",
            difficulty: "expert",
          },
        ];
      },
    };

    const service = new CardGenerationService(mockProvider);
    const doc: CleanTextDocument = {
      id: "doc-5",
      sourceId: "source-5",
      title: "Raft Partitions",
      textContent: "Terms act as logical clocks in Raft. When a partition occurs, isolated leaders cannot commit logs.",
      contentHash: "hash-5",
    };

    const drafts = await service.generateFromDocument(doc, {
      depthMode: "deep-dive",
      difficulty: "expert",
      chunkOptions: { chunkMultiplier: 3 },
      targetCountPerChunk: 1,
    });

    expect(drafts.length).toBe(1);
    expect(capturedPrompt).toContain("TASK: Synthesize exactly 3 comprehensive DEEP-DIVE flashcards");
    expect(capturedPrompt).toContain("DEEP-DIVE PEDAGOGICAL RULES");
  });

  describe("formatCardSourceLocator", () => {
    it("formats single page coordinates with draft locator", () => {
      const locator = formatCardSourceLocator("Calculus.pdf", 14, 14, "Section 2.1");
      expect(locator).toBe("Calculus.pdf - Page 14, Section 2.1");
    });

    it("formats single page coordinates without draft locator", () => {
      const locator = formatCardSourceLocator("Calculus.pdf", 14, 14, "");
      expect(locator).toBe("Calculus.pdf - Page 14");
    });

    it("formats multi-page range coordinates with draft locator", () => {
      const locator = formatCardSourceLocator("Physics.pdf", 20, 25, "Section 3.4");
      expect(locator).toBe("Physics.pdf - Pages 20-25, Section 3.4");
    });

    it("avoids duplicate prefix if draft locator already contains doc title while retaining page coordinates", () => {
      const locator = formatCardSourceLocator("Calculus.pdf", 14, 14, "Calculus.pdf - Section 2.1");
      expect(locator).toBe("Calculus.pdf - Page 14, Section 2.1");
    });

    it("avoids duplicate prefix if draft locator already contains doc title without pages", () => {
      const locator = formatCardSourceLocator("Calculus.pdf", null, null, "Calculus.pdf - Section 2.1");
      expect(locator).toBe("Calculus.pdf - Section 2.1");
    });

    it("formats doc title without pages if page numbers are absent", () => {
      const locator = formatCardSourceLocator("Notes", null, null, "Section 1");
      expect(locator).toBe("Notes - Section 1");
    });

    it("does not duplicate page part if document title already contains page", () => {
      const locator = formatCardSourceLocator("Calculus.pdf - Page 14", 14, 14, "Section 2.1");
      expect(locator).toBe("Calculus.pdf - Page 14 - Section 2.1");
    });
  });

  it("propagates startPage and endPage into card sourceLocator during generation", async () => {
    const mockProvider: LLMProviderPort = {
      providerName: "locator-llm",
      async generateQAPairs(): Promise<CardGenerationDraft[]> {
        return [
          {
            question: "What is the derivative of sin(x)?",
            answer: "cos(x)",
            sourceQuote: "The derivative of sin(x) is cos(x).",
            sourceLocator: "Section 2.1",
            difficulty: "intermediate",
          },
        ];
      },
    };

    const service = new CardGenerationService(mockProvider);
    const subdoc: CleanTextDocument = {
      id: "doc-sub",
      sourceId: "source-sub",
      title: "Calculus.pdf",
      textContent: "The derivative of sin(x) is cos(x).",
      contentHash: "hash-calc",
      startPage: 14,
      endPage: 14,
    };

    const drafts = await service.generateFromDocument(subdoc);
    expect(drafts.length).toBe(1);
    expect(drafts[0].sourceLocator).toBe("Calculus.pdf - Page 14, Section 2.1");
  });
});
