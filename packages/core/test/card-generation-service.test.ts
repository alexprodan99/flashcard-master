import { describe, it, expect } from "vitest";
import { CardGenerationService } from "../src/services/card-generation-service.js";
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
});
