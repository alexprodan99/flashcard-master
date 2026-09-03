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

  it("scales chunk size with chunkMultiplier", () => {
    const p1 = "Paragraph 1 discusses leader election mechanics and heartbeat timers.";
    const p2 = "Paragraph 2 discusses log replication and index consistency.";
    const text = `${p1}\n\n${p2}`;

    // Base size 80 splits into 2 chunks
    const baseChunks = chunker.chunkText(text, { maxChunkSize: 80 });
    expect(baseChunks.length).toBe(2);

    // Multiplier 2x (size 160) fits both paragraphs in 1 chunk
    const scaledChunks = chunker.chunkText(text, { maxChunkSize: 80, chunkMultiplier: 2 });
    expect(scaledChunks.length).toBe(1);
    expect(scaledChunks[0]).toContain(p1);
    expect(scaledChunks[0]).toContain(p2);
  });

  it("returns entire text as single chunk when fullDocument is true or chunkMultiplier is 0", () => {
    const text = "A".repeat(5000);
    const fullDocChunks = chunker.chunkText(text, { maxChunkSize: 100, fullDocument: true });
    expect(fullDocChunks.length).toBe(1);
    expect(fullDocChunks[0].length).toBe(5000);

    const zeroMultiplierChunks = chunker.chunkText(text, { maxChunkSize: 100, chunkMultiplier: 0 });
    expect(zeroMultiplierChunks.length).toBe(1);
    expect(zeroMultiplierChunks[0].length).toBe(5000);
  });
});
