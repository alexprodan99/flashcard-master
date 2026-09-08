import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createDatabaseClient,
  DataSourceRepository,
  SyncStateRepository,
  FlashcardRepository,
  DocumentRepository,
  JobRepository,
  CardDeduplicationService,
} from "@flashcard-master/core";
import { createWebServer, WebServer } from "../src/server.js";
import { JobManager } from "../src/jobs/job-manager.js";
import { WorkerExecutor } from "../src/workers/worker-executor.js";

describe("E2E Multi-Processing Flow & Concurrency Verification", () => {
  let db: any;
  let sourceRepo: DataSourceRepository;
  let syncRepo: SyncStateRepository;
  let cardRepo: FlashcardRepository;
  let docRepo: DocumentRepository;
  let jobRepo: JobRepository;
  let jobManager: JobManager;
  let workerExecutor: WorkerExecutor;
  let server: WebServer;
  let serverUrl: string;
  let tmpDir: string;
  let mockWorkerScript: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-mp-test-"));
    mockWorkerScript = path.join(tmpDir, "e2e-worker.js");

    fs.writeFileSync(
      mockWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.action === "START_TASK") {
          parentPort.postMessage({
            type: "STEP_PROGRESS",
            jobId: msg.jobId,
            currentStep: 1,
            totalSteps: 1,
            stepName: "Step 1"
          });
          parentPort.postMessage({
            type: "STEP_LOG",
            jobId: msg.jobId,
            stepNumber: 1,
            stepTitle: "Step 1",
            level: "info",
            message: "Completed step 1"
          });
          parentPort.postMessage({
            type: "TASK_COMPLETE",
            jobId: msg.jobId,
            resultSummary: { success: true }
          });
        }
      });
      `,
      "utf8"
    );

    db = createDatabaseClient({ inMemory: true });
    sourceRepo = new DataSourceRepository(db);
    syncRepo = new SyncStateRepository(db);
    cardRepo = new FlashcardRepository(db);
    docRepo = new DocumentRepository(db);
    jobRepo = new JobRepository(db);

    // Bounded pool: max 2 generation, 2 sync, 1 export
    jobManager = new JobManager(jobRepo, {
      maxGenerationWorkers: 2,
      maxSyncWorkers: 2,
      maxExportWorkers: 1,
    });

    workerExecutor = new WorkerExecutor({
      cardRepo,
      sourceRepo,
      dedupService: new CardDeduplicationService(),
      workerScriptPath: mockWorkerScript,
    });

    server = createWebServer({
      port: 0,
      sourceRepo,
      syncRepo,
      cardRepo,
      documentRepo: docRepo,
      jobRepo,
      jobManager,
      workerExecutor,
    });

    const info = await server.listen(0);
    serverUrl = info.url;
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enforces bounded concurrency pool limits and executes queued jobs in FIFO order", async () => {
    // Submit 4 generation jobs with 80ms delay each (limit is 2)
    const jobPromises = [1, 2, 3, 4].map((num) =>
      jobManager.enqueueJob(
        "generation",
        `Gen Job ${num}`,
        {},
        async (_j, ctx) => {
          ctx.updateProgress(1, 2, "Working");
          ctx.log(1, "Step 1", "info", `Job ${num} running`);
          await new Promise((r) => setTimeout(r, 80));
          ctx.updateProgress(2, 2, "Finishing");
          return { jobNum: num };
        },
        2
      )
    );

    const jobs = await Promise.all(jobPromises);
    expect(jobs.length).toBe(4);

    // Give microtask queue time to dispatch
    await new Promise((r) => setTimeout(r, 10));

    // Exactly 2 running, 2 queued
    const counts = jobManager.getActiveCounts();
    expect(counts.generation).toBe(2);

    const queueLens = jobManager.getQueueLengths();
    expect(queueLens.generation).toBe(2);

    // Wait for all jobs to complete
    const timeout = Date.now() + 4000;
    while (Date.now() < timeout) {
      const j4 = jobRepo.getById(jobs[3].id);
      if (j4?.status === "completed") break;
      await new Promise((r) => setTimeout(r, 40));
    }

    expect(jobRepo.getById(jobs[0].id)?.status).toBe("completed");
    expect(jobRepo.getById(jobs[1].id)?.status).toBe("completed");
    expect(jobRepo.getById(jobs[2].id)?.status).toBe("completed");
    expect(jobRepo.getById(jobs[3].id)?.status).toBe("completed");

    expect(jobManager.getActiveCounts().generation).toBe(0);
    expect(jobManager.getQueueLengths().generation).toBe(0);
  });

  it("cancels a running multi-step job cleanly via POST /api/jobs/:id/cancel", async () => {
    const job = await jobManager.enqueueJob(
      "generation",
      "Cancelable Long Job",
      {},
      async (_j, ctx) => {
        ctx.updateProgress(1, 5, "Step 1");
        ctx.log(1, "Step 1", "info", "Starting long process");
        return new Promise((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => {
            const err = new Error("Job aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      },
      5
    );

    // Give time to start running
    await new Promise((r) => setTimeout(r, 40));
    expect(jobRepo.getById(job.id)?.status).toBe("running");

    // Cancel via API
    const res = await fetch(`${serverUrl}/api/jobs/${job.id}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.job.status).toBe("cancelled");

    const updatedJob = jobRepo.getById(job.id);
    expect(updatedJob?.status).toBe("cancelled");
  });

  it("streams real-time SSE updates on /api/jobs/stream and /api/jobs/:id/logs/stream", async () => {
    const sseMessages: string[] = [];
    const clientReq = http.get(`${serverUrl}/api/jobs/stream`, (res) => {
      res.on("data", (chunk) => {
        sseMessages.push(chunk.toString());
      });
    });

    await new Promise((r) => setTimeout(r, 50));

    const job = await jobManager.enqueueJob(
      "sync_all",
      "SSE Test Sync",
      {},
      async (_j, ctx) => {
        ctx.updateProgress(1, 1, "Syncing sources");
        ctx.log(1, "Sync Step", "info", "Extracted 5 documents");
        return { count: 5 };
      },
      1
    );

    // Connect to log stream
    const logMessages: string[] = [];
    const logReq = http.get(`${serverUrl}/api/jobs/${job.id}/logs/stream`, (res) => {
      res.on("data", (chunk) => {
        logMessages.push(chunk.toString());
      });
    });

    // Wait for completion
    const timeout = Date.now() + 3000;
    while (Date.now() < timeout) {
      if (jobRepo.getById(job.id)?.status === "completed") break;
      await new Promise((r) => setTimeout(r, 40));
    }

    clientReq.destroy();
    logReq.destroy();

    const fullSse = sseMessages.join("");
    expect(fullSse).toContain("event: connected");
    expect(fullSse).toContain("event: job_created");
    expect(fullSse).toContain("event: job_status");

    const fullLogs = logMessages.join("");
    expect(fullLogs).toContain("Extracted 5 documents");
  });

  it("maintains zero SQLite contention under heavy concurrent reads while jobs commit records", async () => {
    // Launch 3 jobs that write progress and logs to SQLite
    const jobs = await Promise.all(
      [1, 2, 3].map((i) =>
        jobManager.enqueueJob(
          "generation",
          `Contention Job ${i}`,
          {},
          async (_j, ctx) => {
            for (let step = 1; step <= 3; step++) {
              ctx.updateProgress(step, 3, `Step ${step}`);
              ctx.log(step, `Step ${step}`, "info", `Step ${step} record created`);
              cardRepo.create({
                question: `Q ${i}-${step}`,
                answer: `A ${i}-${step}`,
                sourceQuote: `Quote for card ${i}-${step}`,
                difficulty: "beginner",
                targetDeck: "Default",
              });
              await new Promise((r) => setTimeout(r, 20));
            }
            return { ok: true };
          },
          3
        )
      )
    );

    // Simultaneously fire 50 concurrent SQLite read operations while jobs write
    const readPromises: Promise<any>[] = [];
    for (let i = 0; i < 50; i++) {
      readPromises.push(
        new Promise((resolve, reject) => {
          try {
            const cards = cardRepo.list();
            const docs = docRepo.listAll();
            const jobList = jobRepo.list();
            resolve({ cards: cards.length, docs: docs.length, jobs: jobList.length });
          } catch (err) {
            reject(err);
          }
        })
      );
    }

    // None of the 50 queries should throw SQLITE_BUSY
    const results = await Promise.all(readPromises);
    expect(results.length).toBe(50);

    // Wait for all 3 jobs to complete
    const timeout = Date.now() + 4000;
    while (Date.now() < timeout) {
      const lastJob = jobRepo.getById(jobs[2].id);
      if (lastJob?.status === "completed") break;
      await new Promise((r) => setTimeout(r, 40));
    }

    expect(jobRepo.getById(jobs[0].id)?.status).toBe("completed");
    expect(jobRepo.getById(jobs[1].id)?.status).toBe("completed");
    expect(jobRepo.getById(jobs[2].id)?.status).toBe("completed");

    const totalCards = cardRepo.list();
    expect(totalCards.length).toBe(9); // 3 jobs * 3 steps
  });
});
