import { describe, it, expect } from "vitest";
import { CardDeduplicationService } from "../src/services/card-deduplication-service.js";

describe("CardDeduplicationService", () => {
  const service = new CardDeduplicationService({ similarityThreshold: 0.85 });

  it("identifies exact and normalized duplicate questions", () => {
    const sim1 = service.calculateSimilarity(
      "What is Raft consensus?",
      "what is raft consensus?"
    );
    expect(sim1).toBe(1.0);

    const sim2 = service.calculateSimilarity(
      "What does WAL stand for in SQLite?",
      "What does WAL stand for in SQLite?!"
    );
    expect(sim2).toBe(1.0);
  });

  it("identifies close paraphrases and typo variations", () => {
    const sim = service.calculateSimilarity(
      "What does WAL stand for in SQLite?",
      "What does WAL mean in SQLite?"
    );
    expect(sim).toBeGreaterThanOrEqual(0.75);
  });

  it("distinguishes clearly distinct questions sharing keywords", () => {
    const sim = service.calculateSimilarity(
      "How does Raft leader election work?",
      "How does Raft log replication work?"
    );
    expect(sim).toBeLessThan(0.75);
  });

  it("filters intra-batch duplicates and inter-batch existing cards", () => {
    const existingCards = [
      { question: "What is SQLite Write-Ahead Logging?" },
    ];

    const newCandidates = [
      { question: "What is SQLite Write-Ahead Logging?" }, // Duplicate of existing
      { question: "How does SQLite WAL checkpointing operate?" }, // Unique
      { question: "How does SQLite WAL checkpointing operate?" }, // Intra-batch duplicate of above
    ];

    const result = service.filterUnique(newCandidates, existingCards);

    expect(result.unique.length).toBe(1);
    expect(result.unique[0].question).toBe("How does SQLite WAL checkpointing operate?");

    expect(result.duplicates.length).toBe(2);
    expect(result.duplicates[0].similarity).toBe(1.0);
  });
});
