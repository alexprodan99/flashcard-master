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

  it("verifies verbatim spoken quotes spanning multiple inline [MM:SS - MM:SS] subtitle cues", () => {
    const transcriptSource = `
<!-- chapter: start=0 end=180 title="Consensus Intro" -->
[00:12 - 00:18] Distributed consensus lets a cluster agree on logs
[00:18 - 00:25] even when individual nodes experience transient network partitions.
[01:02:04 - 01:02:10] Followers reset their randomized election timer upon receiving valid AppendEntries RPCs.
`;

    const crossCueDraft: CardGenerationDraft = {
      question: "What does distributed consensus enable during network partitions?",
      answer: "Cluster agreement on logs even when individual nodes experience partitions.",
      sourceQuote:
        "Distributed consensus lets a cluster agree on logs even when individual nodes experience transient network partitions.",
      difficulty: "intermediate",
    };

    const crossCueResult = guard.verifyDraft(crossCueDraft, transcriptSource);
    expect(crossCueResult.isValid).toBe(true);
    expect(crossCueResult.matchConfidence).toBe(0.95);

    const hhmmssDraft: CardGenerationDraft = {
      question: "When do followers reset their election timer?",
      answer: "Upon receiving valid AppendEntries RPCs.",
      sourceQuote: "Followers reset their randomized election timer upon receiving valid AppendEntries RPCs.",
      difficulty: "intermediate",
    };

    const hhmmssResult = guard.verifyDraft(hhmmssDraft, transcriptSource);
    expect(hhmmssResult.isValid).toBe(true);
  });

  it("rejects quotes padded with timestamps that fall below minQuoteLength and hallucinated transcript quotes", () => {
    const transcriptSource = "[00:05 - 00:10] Hi team, welcome to the architecture review session.";

    const paddedShort: CardGenerationDraft = {
      question: "Greeting?",
      answer: "Hi team.",
      sourceQuote: "[00:05 - 00:10] Hi team",
      difficulty: "beginner",
    };

    const shortResult = guard.verifyDraft(paddedShort, transcriptSource);
    expect(shortResult.isValid).toBe(false);
    expect(shortResult.failureReason).toContain("too short");

    const hallucinated: CardGenerationDraft = {
      question: "What topic?",
      answer: "Kubernetes controllers.",
      sourceQuote: "Kubernetes reconciliation loops monitor desired state continuously.",
      difficulty: "intermediate",
    };

    const hallResult = guard.verifyDraft(hallucinated, transcriptSource);
    expect(hallResult.isValid).toBe(false);
  });
});
