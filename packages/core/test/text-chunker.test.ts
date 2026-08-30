import { describe, it, expect } from "vitest";
import { TextChunker } from "../src/services/text-chunker.js";

describe("TextChunker", () => {
  const chunker = new TextChunker({ maxChunkSize: 100, overlapSize: 20 });

  it("returns empty array for empty or whitespace text", () => {
    expect(chunker.chunkText("")).toEqual([]);
    expect(chunker.chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns single chunk when text is under maxChunkSize", () => {
    const text = "Short note on Raft consensus.";
    const chunks = chunker.chunkText(text);
    expect(chunks).toEqual([text]);
  });

  it("splits multi-paragraph text across chunks with overlap", () => {
    const p1 = "Paragraph 1 discusses leader election mechanics and heartbeat timers.";
    const p2 = "Paragraph 2 discusses log replication and index consistency.";
    const p3 = "Paragraph 3 discusses committed state and safety invariants.";
    const text = `${p1}\n\n${p2}\n\n${p3}`;

    const chunks = chunker.chunkText(text, { maxChunkSize: 120, overlapSize: 20 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]).toContain(p1);
    expect(chunks[1]).toContain(p2);
  });
});
