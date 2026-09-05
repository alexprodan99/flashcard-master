import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnkiConnectAdapter } from "../src/export/ankiconnect-adapter.js";
import type { Flashcard } from "@flashcard-master/core";

describe("AnkiConnectAdapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockCards: Flashcard[] = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      question: "What is Raft consensus?",
      answer: "A leader-based distributed consensus protocol.",
      sourceQuote: "Raft is a consensus protocol for managing replicated logs.",
      difficulty: "intermediate",
      personaUsed: "socratic-mentor",
      targetDeck: "Distributed Systems",
      tags: ["raft", "consensus"],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      question: "What is SQLite WAL mode?",
      answer: "Write-Ahead Logging.",
      sourceQuote: "WAL allows concurrent reading and writing.",
      difficulty: "beginner",
      personaUsed: "socratic-mentor",
      targetDeck: "Databases",
      tags: ["sqlite"],
    },
  ];

  it("checks connection health successfully when AnkiConnect is online", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 6, error: null }),
    });

    const adapter = new AnkiConnectAdapter();
    const health = await adapter.checkHealth();

    expect(health.isOnline).toBe(true);
    expect(health.version).toBe(6);
  });

  it("handles offline AnkiConnect gracefully without throwing uncaught errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED 127.0.0.1:8765"));

    const adapter = new AnkiConnectAdapter();
    const health = await adapter.checkHealth();

    expect(health.isOnline).toBe(false);
    expect(health.error).toContain("ECONNREFUSED");

    const result = await adapter.export(mockCards);
    expect(result.successCount).toBe(0);
    expect(result.message).toContain("offline or unreachable");
  });

  it("creates deck, syncs notes, and updates existing notes if duplicate front question exists", async () => {
    let updateFieldsCalled = false;
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);

      if (body.action === "version") {
        return { ok: true, json: async () => ({ result: 6, error: null }) };
      }
      if (body.action === "createDeck") {
        return { ok: true, json: async () => ({ result: 123456789, error: null }) };
      }
      if (body.action === "canAddNotes") {
        // Return 1 addable (true), 1 existing (false)
        return { ok: true, json: async () => ({ result: [true, false], error: null }) };
      }
      if (body.action === "addNote") {
        return { ok: true, json: async () => ({ result: 100001, error: null }) };
      }
      if (body.action === "addNotes") {
        return { ok: true, json: async () => ({ result: [100001], error: null }) };
      }
      if (body.action === "findNotes") {
        return { ok: true, json: async () => ({ result: [100002], error: null }) };
      }
      if (body.action === "updateNoteFields") {
        updateFieldsCalled = true;
        return { ok: true, json: async () => ({ result: null, error: null }) };
      }
      if (body.action === "setNoteTags") {
        return { ok: true, json: async () => ({ result: null, error: null }) };
      }

      return { ok: false, status: 400, statusText: "Bad Request" };
    });

    const adapter = new AnkiConnectAdapter();
    const syncResult = await adapter.syncCards(mockCards, {
      targetDeck: "Distributed Systems",
    });

    expect(syncResult.totalCards).toBe(2);
    expect(syncResult.addedCards).toBe(1);
    expect(syncResult.updatedCards).toBe(1);
    expect(syncResult.duplicateOrFailedCards).toBe(0);
    expect(syncResult.noteIds).toEqual([100001, 100002]);
    expect(updateFieldsCalled).toBe(true);

    const exportResult = await adapter.export(mockCards, {
      targetDeck: "Distributed Systems",
    });
    expect(exportResult.format).toBe("ankiconnect");
    expect(exportResult.successCount).toBe(2);
    expect(exportResult.message).toContain("1 added, 1 updated");
  });

  it("handles empty card array with zero network calls", async () => {
    global.fetch = vi.fn();
    const adapter = new AnkiConnectAdapter();

    const result = await adapter.syncCards([]);
    expect(result.totalCards).toBe(0);
    expect(result.addedCards).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
