import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { WorkerExecutor } from "../src/workers/worker-executor.js";
import type { JobExecutionContext } from "../src/jobs/job-manager.js";
import {
  createDatabaseClient,
  FlashcardRepository,
  CardDeduplicationService,
} from "@flashcard-master/core";

describe("WorkerExecutor", () => {
  let tmpDir: string;
  let mockWorkerPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles progress, step logging, and main-thread card commits via IPC", async () => {
    // Create a mock worker script that interacts with the executor via IPC
    mockWorkerPath = path.join(tmpDir, "mock-card-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "STEP_PROGRESS",
            jobId: msg.jobId,
            currentStep: 1,
            totalSteps: 2,
            stepName: "Processing Doc 1"
          });

          parentPort.postMessage({
            type: "STEP_LOG",
            jobId: msg.jobId,
            stepNumber: 1,
            stepTitle: "Processing Doc 1",
            level: "info",
            message: "Extracting cards from text..."
          });

          // Request main thread to commit cards to SQLite
          parentPort.postMessage({
            type: "COMMIT_CARDS",
            jobId: msg.jobId,
            stepNumber: 1,
            stepTitle: "Commit Doc 1",
            targetDeck: "Vocabulary",
            sourceId: "src-1",
            documentTitle: "Glossary.md",
            cards: [
              { question: "What is WAL?", answer: "Write-Ahead Logging", sourceQuote: "WAL is Write-Ahead Logging", difficulty: "beginner" },
              { question: "What is IPC?", answer: "Inter-Process Communication", sourceQuote: "IPC is Inter-Process Communication", difficulty: "intermediate" }
            ]
          });
        }

        if (msg.action === "COMMIT_CARDS_ACK") {
          parentPort.postMessage({
            type: "TASK_COMPLETE",
            jobId: msg.jobId,
            resultSummary: {
              cardsCreated: msg.createdCount,
              duplicatesSkipped: msg.duplicatesCount,
              stepAck: msg.stepNumber
            }
          });
        }
      });
    `;
    fs.writeFileSync(mockWorkerPath, scriptContent, "utf8");

    const db = createDatabaseClient({ inMemory: true });
    const cardRepo = new FlashcardRepository(db);
    const dedupService = new CardDeduplicationService();

    const executor = new WorkerExecutor({
      cardRepo,
      dedupService,
      workerScriptPath: mockWorkerPath,
    });

    const progressUpdates: any[] = [];
    const logEntries: any[] = [];
    let summary: any = null;

    const mockCtx: JobExecutionContext = {
      jobId: "test-job-123",
      signal: new AbortController().signal,
      updateProgress: (current, total, step) => {
        progressUpdates.push({ current, total, step });
      },
      log: (stepNumber, stepTitle, level, message, details) => {
        const entry = { id: logEntries.length + 1, jobId: "test-job-123", stepNumber, stepTitle, level, message, details, timestamp: new Date().toISOString() };
        logEntries.push(entry);
        return entry as any;
      },
      setResultSummary: (res) => {
        summary = res;
      },
    };

    const taskPayload = {
      type: "generation" as const,
      payload: {
        documents: [],
        provider: "mock",
      },
    };

    const result = await executor.executeTask(taskPayload, mockCtx);

    expect(result.cardsCreated).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.stepAck).toBe(1);
    expect(result.newCards).toBeDefined();
    expect(result.newCards.length).toBe(2);

    // Verify main thread database writes
    const cardsInDb = cardRepo.list({ targetDeck: "Vocabulary" });
    expect(cardsInDb.length).toBe(2);
    expect(cardsInDb.map((c) => c.question)).toContain("What is WAL?");
    expect(cardsInDb.map((c) => c.question)).toContain("What is IPC?");

    // Verify progress and logs
    expect(progressUpdates.length).toBe(1);
    expect(progressUpdates[0]).toEqual({
      current: 1,
      total: 2,
      step: "Processing Doc 1",
    });

    expect(logEntries.length).toBe(1);
    expect(logEntries[0].message).toBe("Extracting cards from text...");
    expect(summary).toEqual(result);
  });

  it("handles sync commitments from worker on the main thread", async () => {
    mockWorkerPath = path.join(tmpDir, "mock-sync-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "COMMIT_SYNC_RESULT",
            jobId: msg.jobId,
            sourceId: "src-abc",
            stepNumber: 1,
            documents: []
          });
        }

        if (msg.action === "COMMIT_SYNC_ACK") {
          parentPort.postMessage({
            type: "TASK_COMPLETE",
            jobId: msg.jobId,
            resultSummary: {
              sourceId: msg.sourceId,
              newCount: msg.newCount,
              totalFetched: msg.totalFetched
            }
          });
        }
      });
    `;
    fs.writeFileSync(mockWorkerPath, scriptContent, "utf8");

    const mockIngestionService = {
      syncSource: vi.fn().mockResolvedValue({ newCount: 5, totalFetched: 10 }),
    };

    const executor = new WorkerExecutor({
      ingestionService: mockIngestionService as any,
      workerScriptPath: mockWorkerPath,
    });

    const mockCtx: JobExecutionContext = {
      jobId: "sync-job-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({} as any),
      setResultSummary: () => {},
    };

    const result = await executor.executeTask(
      { type: "sync_all", payload: { sources: [] } },
      mockCtx
    );

    expect(mockIngestionService.syncSource).toHaveBeenCalledWith(
      "src-abc",
      expect.objectContaining({
        signal: mockCtx.signal,
        onLog: expect.any(Function),
      })
    );
    expect(result.newCount).toBe(5);
    expect(result.totalFetched).toBe(10);
  });

  it("handles task cancellation via AbortSignal", async () => {
    mockWorkerPath = path.join(tmpDir, "mock-long-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "STEP_PROGRESS",
            jobId: msg.jobId,
            currentStep: 1,
            totalSteps: 100,
            stepName: "Step 1"
          });
          // Loop indefinitely waiting for abort
          setInterval(() => {}, 1000);
        }
      });
    `;
    fs.writeFileSync(mockWorkerPath, scriptContent, "utf8");

    const executor = new WorkerExecutor({
      workerScriptPath: mockWorkerPath,
    });

    const abortController = new AbortController();

    const mockCtx: JobExecutionContext = {
      jobId: "abort-job-1",
      signal: abortController.signal,
      updateProgress: () => {},
      log: () => ({} as any),
      setResultSummary: () => {},
    };

    const taskPromise = executor.executeTask(
      { type: "generation", payload: { documents: [], provider: "mock" } },
      mockCtx
    );

    // Trigger abort shortly after start
    setTimeout(() => {
      abortController.abort();
    }, 50);

    await expect(taskPromise).rejects.toThrow("Task aborted by user");
  });

  it("handles worker errors gracefully", async () => {
    mockWorkerPath = path.join(tmpDir, "mock-error-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "TASK_ERROR",
            jobId: msg.jobId,
            error: "Intentional LLM adapter connection failure"
          });
        }
      });
    `;
    fs.writeFileSync(mockWorkerPath, scriptContent, "utf8");

    const executor = new WorkerExecutor({
      workerScriptPath: mockWorkerPath,
    });

    const mockCtx: JobExecutionContext = {
      jobId: "error-job-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({} as any),
      setResultSummary: () => {},
    };

    await expect(
      executor.executeTask(
        { type: "generation", payload: { documents: [], provider: "mock" } },
        mockCtx
      )
    ).rejects.toThrow("Intentional LLM adapter connection failure");
  });

  it("runs an export task using the real task-worker implementation", async () => {
    const compiledWorker = path.resolve(__dirname, "../dist/workers/task-worker.js");
    if (!fs.existsSync(compiledWorker)) {
      // If running before tsc compile, resolve from dist
      return;
    }

    const executor = new WorkerExecutor({
      workerScriptPath: compiledWorker,
    });

    const logs: any[] = [];
    let summary: any = null;

    const mockCtx: JobExecutionContext = {
      jobId: "export-job-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: (_step, _title, level, message) => {
        logs.push({ level, message });
        return {} as any;
      },
      setResultSummary: (res) => {
        summary = res;
      },
    };

    const sampleDoc = {
      id: "doc-1",
      sourceId: "src-1",
      title: "Worker Architecture",
      textContent: "Worker threads run CPU and network intensive tasks.",
      url: "https://example.com/worker.md",
      wordCount: 8,
      createdAt: new Date().toISOString(),
    };

    const result = await executor.executeTask(
      {
        type: "export",
        payload: {
          exportKind: "documents",
          format: "markdown",
          sourceName: "Architecture Docs",
          documents: [sampleDoc as any],
        },
      },
      mockCtx
    );

    expect(result.filename).toBeDefined();
    expect(result.documentCount).toBe(1);
    expect(logs.some((l) => l.message.includes("Successfully compiled"))).toBe(true);
    expect(summary.documentCount).toBe(1);
  }, 15000);

  it("progressively streams cards via ctx.emitCard and preserves keywords and sourceLocator in SQLite", async () => {
    mockWorkerPath = path.join(tmpDir, "mock-stream-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "COMMIT_CARDS",
            jobId: msg.jobId,
            stepNumber: 1,
            stepTitle: "Chunk 1",
            targetDeck: "Distributed",
            sourceId: "src-distributed",
            documentTitle: "Raft.md",
            cards: [
              {
                question: "What is Raft?",
                answer: "A consensus algorithm",
                sourceQuote: "Raft is a consensus algorithm",
                difficulty: "intermediate",
                keywords: ["raft", "consensus", "distributed"],
                sourceLocator: "Section 1, paragraph 2"
              }
            ]
          });
        }

        if (msg.action === "COMMIT_CARDS_ACK") {
          parentPort.postMessage({
            type: "TASK_COMPLETE",
            jobId: msg.jobId,
            resultSummary: {
              cardsCreated: msg.createdCount,
              duplicatesSkipped: msg.duplicatesCount,
            }
          });
        }
      });
    `;
    fs.writeFileSync(mockWorkerPath, scriptContent, "utf8");

    const db = createDatabaseClient({ inMemory: true });
    const cardRepo = new FlashcardRepository(db);
    const dedupService = new CardDeduplicationService();

    const executor = new WorkerExecutor({
      cardRepo,
      dedupService,
      workerScriptPath: mockWorkerPath,
    });

    const emittedCards: any[] = [];
    const mockCtx: JobExecutionContext = {
      jobId: "stream-job-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({} as any),
      setResultSummary: () => {},
      emitCard: (card) => {
        emittedCards.push(card);
      },
    };

    const result = await executor.executeTask(
      { type: "generation", payload: { documents: [], provider: "mock" } },
      mockCtx
    );

    expect(result.cardsCreated).toBe(1);
    expect(emittedCards.length).toBe(1);
    expect(emittedCards[0].question).toBe("What is Raft?");
    expect(emittedCards[0].keywords).toEqual(["raft", "consensus", "distributed"]);
    expect(emittedCards[0].sourceLocator).toBe("Section 1, paragraph 2");

    // Verify stored in SQLite
    const inDb = cardRepo.list({ targetDeck: "Distributed" });
    expect(inDb.length).toBe(1);
    expect(inDb[0].keywords).toEqual(["raft", "consensus", "distributed"]);
    expect(inDb[0].sourceLocator).toBe("Section 1, paragraph 2");
  });
});
