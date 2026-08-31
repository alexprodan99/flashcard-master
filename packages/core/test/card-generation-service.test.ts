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
});
