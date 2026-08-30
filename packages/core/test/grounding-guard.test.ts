import { describe, it, expect } from "vitest";
import { GroundingGuard } from "../src/services/grounding-guard.js";
import type { CardGenerationDraft } from "../src/ports/index.js";

const SAMPLE_TEXT = `
Distributed consensus algorithms ensure that a cluster of machines agree on a sequence of values.
In the Raft protocol, leader election relies on randomized heartbeat timers to prevent split-vote scenarios.
When a follower node experiences a timeout, it transitions to the candidate state and requests votes.
`;

describe("GroundingGuard", () => {
  const guard = new GroundingGuard();

  it("verifies exact verbatim substring citations (Tier 1)", () => {
    const draft: CardGenerationDraft = {
      question: "How does Raft prevent split votes?",
      answer: "By using randomized heartbeat timers.",
      sourceQuote: "leader election relies on randomized heartbeat timers to prevent split-vote scenarios.",
      difficulty: "intermediate",
    };

    const result = guard.verifyDraft(draft, SAMPLE_TEXT);
    expect(result.isValid).toBe(true);
    expect(result.matchConfidence).toBe(1.0);
  });

  it("verifies citations wrapped in outer quotation marks (Tier 2)", () => {
    const draft: CardGenerationDraft = {
      question: "When does a follower transition to candidate?",
      answer: "When it experiences a timeout.",
      sourceQuote: '"When a follower node experiences a timeout, it transitions to the candidate state"',
      difficulty: "beginner",
    };

    const result = guard.verifyDraft(draft, SAMPLE_TEXT);
    expect(result.isValid).toBe(true);
    expect(result.matchConfidence).toBe(0.98);
  });

  it("verifies citations with normalized multiline whitespace and curly quotes (Tier 3)", () => {
    const draft: CardGenerationDraft = {
      question: "What do distributed consensus algorithms do?",
      answer: "Ensure cluster machines agree on sequence of values.",
      sourceQuote: "Distributed   consensus  algorithms ensure that a cluster of machines agree on a sequence of values.",
      difficulty: "intermediate",
    };

    const result = guard.verifyDraft(draft, SAMPLE_TEXT);
    expect(result.isValid).toBe(true);
    expect(result.matchConfidence).toBe(0.95);
  });

  it("rejects hallucinated or altered quotes not present in source", () => {
    const draft: CardGenerationDraft = {
      question: "What is Paxos?",
      answer: "Another consensus algorithm.",
      sourceQuote: "Paxos was invented by Leslie Lamport in 1989.",
      difficulty: "expert",
    };

    const result = guard.verifyDraft(draft, SAMPLE_TEXT);
    expect(result.isValid).toBe(false);
    expect(result.failureReason).toContain("not found");
  });

  it("rejects quotes that are too short to be reliable citations", () => {
    const draft: CardGenerationDraft = {
      question: "What protocol is used?",
      answer: "Raft.",
      sourceQuote: "Raft",
      difficulty: "beginner",
    };

    const result = guard.verifyDraft(draft, SAMPLE_TEXT);
    expect(result.isValid).toBe(false);
    expect(result.failureReason).toContain("too short");
  });

  it("filterValidDrafts filters out invalid drafts and keeps valid ones", () => {
    const validDraft: CardGenerationDraft = {
      question: "How does Raft elect leaders?",
      answer: "Using heartbeat timers.",
      sourceQuote: "leader election relies on randomized heartbeat timers to prevent split-vote scenarios.",
      difficulty: "intermediate",
    };
    const invalidDraft: CardGenerationDraft = {
      question: "Fake Question",
      answer: "Fake Answer",
      sourceQuote: "This quote does not exist in the source document anywhere.",
      difficulty: "intermediate",
    };

    const filtered = guard.filterValidDrafts([validDraft, invalidDraft], SAMPLE_TEXT);
    expect(filtered.length).toBe(1);
    expect(filtered[0].question).toBe("How does Raft elect leaders?");
  });
});
