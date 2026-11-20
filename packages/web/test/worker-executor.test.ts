import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { WorkerExecutor, resolveDefaultWorkerScriptPath } from "../src/workers/worker-executor.js";
import type { JobExecutionContext } from "../src/jobs/job-manager.js";
import {
  createDatabaseClient,
  FlashcardRepository,
  CardDeduplicationService,
  DocumentRepository,
  SyncStateRepository,
  DataSourceRepository,
  MediaService,
  IngestionService,
  StrategyRegistry,
} from "@flashcard-master/core";

describe("WorkerExecutor", () => {
  let tmpDir: string;
  let mockWorkerPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {}
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
  }, 30000);

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

  it("enforces execution timeout and terminates worker cleanly", async () => {
    mockWorkerPath = path.join(tmpDir, "mock-timeout-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          // Worker hangs indefinitely
          setInterval(() => {}, 1000);
        }
      });
    `;
    fs.writeFileSync(mockWorkerPath, scriptContent, "utf8");

    const executor = new WorkerExecutor({
      workerScriptPath: mockWorkerPath,
      defaultTimeoutMs: 150,
    });

    const logs: any[] = [];
    const mockCtx: JobExecutionContext = {
      jobId: "timeout-job-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: (stepNumber, stepTitle, level, message, details) => {
        logs.push({ stepNumber, stepTitle, level, message, details });
        return {} as any;
      },
      setResultSummary: () => {},
    };

    await expect(
      executor.executeTask(
        {
          type: "sync_source",
          payload: { sources: [], timeoutMs: 150 },
        },
        mockCtx
      )
    ).rejects.toThrow(/timed out/i);

    expect(logs.some((l) => l.stepTitle === "Execution Timeout" && l.level === "error")).toBe(true);
  });

  it("custodially persists extracted subdocuments and updates syncRepo in COMMIT_SYNC_RESULT", async () => {
    const db = createDatabaseClient({ inMemory: true });
    const sourceRepo = new DataSourceRepository(db);
    const source = sourceRepo.create({
      name: "Report Source",
      type: "local",
      uri: "/tmp/report.docx",
    });
    const documentRepo = new DocumentRepository(db);
    const syncRepo = new SyncStateRepository(db);

    mockWorkerPath = path.join(tmpDir, "mock-doc-sync-worker.js");
    const scriptContent = `
      import { parentPort } from "node:worker_threads";

      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "COMMIT_SYNC_RESULT",
            jobId: msg.jobId,
            sourceId: "${source.id}",
            stepNumber: 1,
            stepTitle: "Syncing Report.docx",
            documents: [
              {
                id: "doc-slice-1",
                sourceId: "${source.id}",
                title: "Report.docx - Section 1",
                textContent: "Executive summary and background.",
                contentHash: "hash-slice-1",
                wordCount: 4,
                startPage: 1,
                endPage: 2
              },
              {
                id: "doc-slice-2",
                sourceId: "${source.id}",
                title: "Report.docx - Section 2",
                textContent: "Architecture and implementation roadmap.",
                contentHash: "hash-slice-2",
                wordCount: 4,
                startPage: 3,
                endPage: 5
              }
            ]
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

    const executor = new WorkerExecutor({
      sourceRepo,
      documentRepo,
      syncRepo,
      workerScriptPath: mockWorkerPath,
      maxWorkerHeapMb: 512,
    });

    const mockCtx: JobExecutionContext = {
      jobId: "sync-doc-job-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({} as any),
      setResultSummary: () => {},
    };

    const result = await executor.executeTask(
      {
        type: "sync_source",
        payload: { sources: [] },
      },
      mockCtx
    );

    expect(result.newCount).toBe(2);
    expect(result.totalFetched).toBe(2);

    // Verify subdocuments are persisted into SQLite document table
    const storedDoc1 = documentRepo.getById("doc-slice-1");
    expect(storedDoc1).toBeDefined();
    expect(storedDoc1?.title).toBe("Report.docx - Section 1");
    expect(storedDoc1?.startPage).toBe(1);
    expect(storedDoc1?.endPage).toBe(2);

    const storedDoc2 = documentRepo.getById("doc-slice-2");
    expect(storedDoc2).toBeDefined();
    expect(storedDoc2?.title).toBe("Report.docx - Section 2");
    expect(storedDoc2?.startPage).toBe(3);
    expect(storedDoc2?.endPage).toBe(5);

    // Verify sync state updated
    const syncState = syncRepo.get(source.id);
    expect(syncState).toBeDefined();
    expect(syncState?.itemCount).toBe(2);
    expect(syncState?.lastSyncedAt).toBeDefined();
  });

  it("executes sync_source end-to-end with real task-worker and persists subdocuments", async () => {
    const db = createDatabaseClient({ inMemory: true });
    const sourceRepo = new DataSourceRepository(db);
    const documentRepo = new DocumentRepository(db);
    const syncRepo = new SyncStateRepository(db);

    const docFile = path.join(tmpDir, "test-notes.md");
    fs.writeFileSync(
      docFile,
      `# Chapter 1
<!-- page: 1 -->
Alpha details on page 1.

# Chapter 2
<!-- page: 5 -->
Beta details on page 5.
`
    );

    const source = sourceRepo.create({
      name: "Local MD Source",
      type: "local",
      uri: docFile,
    });

    const realWorkerPath = resolveDefaultWorkerScriptPath();
    const executor = new WorkerExecutor({
      sourceRepo,
      documentRepo,
      syncRepo,
      workerScriptPath: realWorkerPath,
    });

    const logs: any[] = [];
    const mockCtx: JobExecutionContext = {
      jobId: "real-worker-sync-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: (stepNumber, stepTitle, level, message, details) => {
        logs.push({ stepNumber, stepTitle, level, message, details });
        return {} as any;
      },
      setResultSummary: () => {},
    };

    const result = await executor.executeTask(
      {
        type: "sync_source",
        payload: {
          sources: [source],
          slicing: { mode: "outline" },
        },
      },
      mockCtx
    );

    expect(result.newCount).toBeGreaterThanOrEqual(1);
    const docs = documentRepo.listBySourceId(source.id);
    expect(docs.length).toBeGreaterThanOrEqual(1);
    expect(docs[0].startPage).toBeDefined();
  }, 30000);

  it("propagates mediaDir and localFilesDir into worker START_TASK payloads", async () => {
    const mockDirWorker = path.join(tmpDir, "mock-dir-worker.js");
    fs.writeFileSync(
      mockDirWorker,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "TASK_COMPLETE",
            jobId: msg.jobId,
            resultSummary: {
              mediaDir: msg.task.payload.mediaDir,
              localFilesDir: msg.task.payload.localFilesDir,
            },
          });
        }
      });
    `,
      "utf8"
    );

    const customMediaDir = path.join(tmpDir, "custom-media");
    const customLocalFilesDir = path.join(tmpDir, "custom-local-files");
    const executor = new WorkerExecutor({
      mediaDir: customMediaDir,
      localFilesDir: customLocalFilesDir,
      workerScriptPath: mockDirWorker,
    });

    const mockCtx: JobExecutionContext = {
      jobId: "worker-dir-propagation-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({}) as any,
      setResultSummary: () => {},
    };

    const summary = await executor.executeTask(
      {
        type: "sync_source",
        payload: { sources: [] },
      },
      mockCtx
    );

    expect(summary.mediaDir).toBe(customMediaDir);
    expect(summary.localFilesDir).toBe(customLocalFilesDir);
  });

  it("reads localized media assets from custom mediaDir inside real task-worker during export", async () => {
    const customMediaDir = path.join(tmpDir, "worker-export-media");
    const mediaService = new MediaService({ mediaDir: customMediaDir });
    const svgMarker = "story-22-1-custom-media-marker";
    const asset = await mediaService.saveMedia(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><text>${svgMarker}</text></svg>`),
      "image/svg+xml"
    );

    const outputHtml = path.join(tmpDir, "exported-with-media.html");
    const executor = new WorkerExecutor({
      mediaDir: customMediaDir,
      workerScriptPath: resolveDefaultWorkerScriptPath(),
    });

    const mockCtx: JobExecutionContext = {
      jobId: "real-worker-export-media-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({}) as any,
      setResultSummary: () => {},
    };

    const result = await executor.executeTask(
      {
        type: "export",
        payload: {
          exportKind: "documents",
          format: "html",
          mode: "merged",
          sourceName: "Media Export Test",
          outputPath: outputHtml,
          documents: [
            {
              id: "doc-media-1",
              sourceId: "src-media-1",
              title: "Diagram Note",
              textContent: `Architecture diagram:\n\n![Diagram](${asset.url})`,
              wordCount: 3,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            } as any,
          ],
        },
      },
      mockCtx
    );

    expect(result.documentCount).toBe(1);
    expect(fs.existsSync(outputHtml)).toBe(true);
    const htmlContent = fs.readFileSync(outputHtml, "utf8");
    const expectedBase64 = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><text>${svgMarker}</text></svg>`).toString("base64");
    expect(htmlContent).toContain(expectedBase64);
  }, 30000);

  it("skips known local files pre-parse, preserves existing slices in 'new-only' mode, and re-ingests all in 'full' mode inside real task-worker", async () => {
    const db = createDatabaseClient({ inMemory: true });
    const documentRepo = new DocumentRepository(db);
    const syncRepo = new SyncStateRepository(db);
    const sourceRepo = new DataSourceRepository(db);

    const localDir = path.join(tmpDir, "incremental-worker-docs");
    fs.mkdirSync(localDir, { recursive: true });
    fs.writeFileSync(
      path.join(localDir, "doc1.md"),
      "<!-- page: 1 -->\n\nDoc 1 Page 1.\n\n<!-- page: 2 -->\n\nDoc 1 Page 2.",
      "utf8"
    );

    const source = sourceRepo.create({
      name: "Incremental Local Source",
      type: "local",
      uri: localDir,
    });

    const executor = new WorkerExecutor({
      documentRepo,
      syncRepo,
      workerScriptPath: resolveDefaultWorkerScriptPath(),
    });

    const makeCtx = (jobId: string): JobExecutionContext => ({
      jobId,
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({}) as any,
      setResultSummary: () => {},
    });

    // 1. Initial sync (sliced into 2 subdocuments for doc1)
    const firstResult = await executor.executeTask(
      {
        type: "sync_source",
        payload: {
          sources: [source],
          slicing: { mode: "budget", pagesPerChunk: 1 },
        },
      },
      makeCtx("real-worker-inc-1")
    );
    expect(firstResult.newCount).toBe(2);
    expect(firstResult.skippedCount).toBe(0);
    expect(documentRepo.listBySourceId(source.id)).toHaveLength(2);

    // 2. Add doc2.md and sync with default ('new-only') mode: doc1 must be skipped & its 2 slices preserved
    fs.writeFileSync(
      path.join(localDir, "doc2.md"),
      "<!-- page: 1 -->\n\nDoc 2 Page 1.\n\n<!-- page: 2 -->\n\nDoc 2 Page 2.",
      "utf8"
    );
    const secondResult = await executor.executeTask(
      {
        type: "sync_source",
        payload: {
          sources: [source],
          slicing: { mode: "budget", pagesPerChunk: 1 },
        },
      },
      makeCtx("real-worker-inc-2")
    );
    expect(secondResult.syncMode).toBe("new-only");
    expect(secondResult.skippedCount).toBe(1);
    expect(secondResult.newCount).toBe(2);
    expect(documentRepo.listBySourceId(source.id)).toHaveLength(4);

    // 3. Third sync with no new files skips both doc1 and doc2
    const thirdResult = await executor.executeTask(
      {
        type: "sync_source",
        payload: {
          sources: [source],
          slicing: { mode: "budget", pagesPerChunk: 1 },
        },
      },
      makeCtx("real-worker-inc-3")
    );
    expect(thirdResult.newCount).toBe(0);
    expect(thirdResult.skippedCount).toBe(2);
    expect(documentRepo.listBySourceId(source.id)).toHaveLength(4);

    // 4. Explicit 'full' sync re-parses both files and refreshes all 4 slices
    const fourthResult = await executor.executeTask(
      {
        type: "sync_source",
        payload: {
          sources: [source],
          slicing: { mode: "budget", pagesPerChunk: 1 },
          syncMode: "full",
        },
      },
      makeCtx("real-worker-inc-4")
    );
    expect(fourthResult.syncMode).toBe("full");
    expect(fourthResult.skippedCount).toBe(0);
    expect(fourthResult.newCount).toBe(4);
    expect(documentRepo.listBySourceId(source.id)).toHaveLength(4);

    // 5. Switching a previously sliced local source back to mode='none' in 'full' mode purges stale slices
    const resetResult = await executor.executeTask(
      {
        type: "sync_source",
        payload: {
          sources: [source],
          slicing: { mode: "none" },
          syncMode: "full",
        },
      },
      makeCtx("real-worker-inc-5")
    );
    expect(resetResult.newCount).toBe(2);
    expect(documentRepo.listBySourceId(source.id)).toHaveLength(2);

    db.close();
  }, 30000);

  it("propagates syncMode, knownItemKeys, and skippedCount for non-local sync_all inside real task-worker", async () => {
    const mockIngestionService = {
      syncSource: vi.fn().mockResolvedValue({ newCount: 1, totalFetched: 1, skippedCount: 2 }),
    };

    const webSource1 = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Web Docs 1",
      type: "web" as const,
      uri: "https://example.com/1",
      tags: [],
      isActive: true,
    };
    const webSource2 = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Web Docs 2",
      type: "web" as const,
      uri: "https://example.com/2",
      tags: [],
      isActive: true,
    };

    const executor = new WorkerExecutor({
      ingestionService: mockIngestionService as any,
      workerScriptPath: resolveDefaultWorkerScriptPath(),
    });

    const summary = await executor.executeTask(
      {
        type: "sync_all",
        payload: {
          sources: [webSource1, webSource2],
          knownItemKeysBySource: {
            [webSource1.id]: ["https://example.com/1"],
          },
        },
      },
      {
        jobId: "real-worker-custodial-all-1",
        signal: new AbortController().signal,
        updateProgress: () => {},
        log: () => ({}) as any,
        setResultSummary: () => {},
      }
    );

    expect(mockIngestionService.syncSource).toHaveBeenNthCalledWith(
      1,
      webSource1.id,
      expect.objectContaining({
        syncMode: "new-only",
        knownItemKeys: new Set(["https://example.com/1"]),
      })
    );
    expect(mockIngestionService.syncSource).toHaveBeenNthCalledWith(
      2,
      webSource2.id,
      expect.objectContaining({ syncMode: "new-only" })
    );
    expect(summary.newCount).toBe(2);
    expect(summary.skippedCount).toBe(4);
    expect(summary.totalSkippedDocuments).toBe(4);
  }, 30000);

  it("forwards syncMode into custodial IngestionService.syncSource calls", async () => {
    mockWorkerPath = path.join(tmpDir, "mock-full-mode-worker.js");
    fs.writeFileSync(
      mockWorkerPath,
      `
      import { parentPort } from "node:worker_threads";
      let ackResolve = null;
      parentPort.on("message", async (msg) => {
        if (msg.action === "COMMIT_SYNC_ACK" && ackResolve) {
          ackResolve(msg);
          ackResolve = null;
        }
        if (msg.action === "START_TASK") {
          const ackPromise = new Promise((r) => { ackResolve = r; });
          parentPort.postMessage({
            type: "COMMIT_SYNC_RESULT",
            jobId: msg.jobId,
            sourceId: "src-web-1",
            stepNumber: 1,
            documents: undefined,
            syncMode: msg.task.payload.syncMode,
          });
          const ack = await ackPromise;
          parentPort.postMessage({
            type: "TASK_COMPLETE",
            jobId: msg.jobId,
            resultSummary: {
              newCount: ack.newCount,
              skippedCount: ack.skippedCount,
            },
          });
        }
      });
    `,
      "utf8"
    );

    const mockIngestionService = {
      syncSource: vi.fn().mockResolvedValue({ newCount: 3, totalFetched: 3, skippedCount: 0 }),
    };

    const executor = new WorkerExecutor({
      ingestionService: mockIngestionService as any,
      workerScriptPath: mockWorkerPath,
    });

    const summary = await executor.executeTask(
      { type: "sync_source", payload: { sources: [], syncMode: "full" } },
      {
        jobId: "custodial-full-1",
        signal: new AbortController().signal,
        updateProgress: () => {},
        log: () => ({}) as any,
        setResultSummary: () => {},
      }
    );

    expect(mockIngestionService.syncSource).toHaveBeenCalledWith(
      "src-web-1",
      expect.objectContaining({ syncMode: "full" })
    );
    expect(summary.newCount).toBe(3);
    expect(summary.skippedCount).toBe(0);
  }, 30000);

  it("executes custodial non-local sync through real IngestionService + SQLite DocumentRepository and clears emptied local docs on full mode", async () => {
    const db = createDatabaseClient({ inMemory: true });
    const sourceRepo = new DataSourceRepository(db);
    const syncRepo = new SyncStateRepository(db);
    const cardRepo = new FlashcardRepository(db);
    const docRepo = new DocumentRepository(db);
    const registry = new StrategyRegistry();

    let returnSecond = false;
    registry.register({
      type: "web",
      fetch: async (src, _last, opts) => {
        const uri = returnSecond ? "https://example.com/post-2" : "https://example.com/post-1";
        if ((opts?.syncMode ?? "new-only") !== "full" && opts?.knownItemKeys?.has(uri)) {
          opts?.onItemSkipped?.(uri);
          return [];
        }
        return [{ id: uri, sourceId: src.id, title: uri, originUrl: uri, rawContent: "Content for " + uri, guid: uri }];
      },
      extractCleanText: (raw) => ({
        id: raw.id,
        sourceId: raw.sourceId,
        title: raw.title,
        textContent: raw.rawContent,
        originUrl: raw.originUrl,
        contentHash: "h-" + raw.originUrl,
        wordCount: 3,
      }),
    });

    const realIngestionService = new IngestionService(sourceRepo, syncRepo, registry, docRepo);
    const webSource = sourceRepo.create({
      name: "Custodial Web",
      type: "web",
      uri: "https://example.com/post-1",
    });

    const executor = new WorkerExecutor({
      ingestionService: realIngestionService,
      documentRepo: docRepo,
      cardRepo,
      syncRepo,
    });

    const ctx = {
      jobId: "custodial-real-1",
      signal: new AbortController().signal,
      updateProgress: () => {},
      log: () => ({}) as any,
      setResultSummary: () => {},
    };

    const first = await executor.executeTask(
      { type: "sync_source", payload: { sources: [webSource], syncMode: "new-only" } },
      ctx
    );
    expect(first.newCount).toBe(1);
    expect(docRepo.listBySourceId(webSource.id).map((d) => d.url)).toEqual(["https://example.com/post-1"]);

    // Second run in new-only skips post-1
    const second = await executor.executeTask(
      { type: "sync_source", payload: { sources: [webSource], syncMode: "new-only" } },
      ctx
    );
    expect(second.newCount).toBe(0);
    expect(second.skippedCount).toBe(1);

    // Replace item & run 'full' sync -> old post-1 purged, post-2 persisted
    returnSecond = true;
    const third = await executor.executeTask(
      { type: "sync_source", payload: { sources: [webSource], syncMode: "full" } },
      ctx
    );
    expect(third.newCount).toBe(1);
    expect(docRepo.listBySourceId(webSource.id).map((d) => d.url)).toEqual(["https://example.com/post-2"]);

    // Local source full re-sync on empty directory purges existing docs cleanly
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-empty-local-"));
    try {
      const localSrc = sourceRepo.create({ name: "Empty Local", type: "local", uri: emptyDir });
      docRepo.upsert({
        id: "stale-doc-1",
        sourceId: localSrc.id,
        title: "Stale Deleted File",
        url: path.join(emptyDir, "deleted.md"),
        textContent: "Old content",
        wordCount: 2,
      });
      await executor.executeTask(
        { type: "sync_source", payload: { sources: [localSrc], syncMode: "full" } },
        ctx
      );
      expect(docRepo.listBySourceId(localSrc.id)).toHaveLength(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
    db.close();
  }, 30000);

});
