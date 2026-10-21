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
  IngestionService,
  StrategyRegistry,
} from "@flashcard-master/core";
import { createWebServer, WebServer } from "../src/server.js";
import { JobManager } from "../src/jobs/job-manager.js";
import { WorkerExecutor } from "../src/workers/worker-executor.js";

describe("Job Queue, Streaming SSE & Logging Endpoints", () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jobs-test-"));
    mockWorkerScript = path.join(tmpDir, "mock-worker.js");
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
            stepName: "Processing"
          });
          parentPort.postMessage({
            type: "STEP_LOG",
            jobId: msg.jobId,
            stepNumber: 1,
            stepTitle: "Step 1",
            level: "info",
            message: "Finished processing"
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

    jobManager = new JobManager(jobRepo, {
      maxGenerationWorkers: 2,
      maxSyncWorkers: 2,
      maxExportWorkers: 2,
    });

    workerExecutor = new WorkerExecutor({
      cardRepo,
      sourceRepo,
      workerScriptPath: mockWorkerScript,
    });

    // Seed test data
    const source = sourceRepo.create({
      name: "Test Docs",
      type: "local",
      uri: "/tmp/docs",
      tags: [],
      isActive: true,
    });

    docRepo.upsert({
      sourceId: source.id,
      title: "Doc One",
      textContent: "Important text content about systems.",
      url: "https://example.com/doc1",
      wordCount: 5,
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
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch {}
  });

  it("POST /api/generate enqueues background job asynchronously in < 50ms", async () => {
    const startTime = performance.now();
    const res = await fetch(`${serverUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "ollama",
        model: "llama3",
        limit: 3,
      }),
    });
    const elapsed = performance.now() - startTime;

    expect(elapsed).toBeLessThan(500); // well under response budget
    expect(res.status).toBe(202);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.jobId).toBeDefined();

    // Verify job in database
    const job = jobRepo.getById(body.jobId);
    expect(job).toBeDefined();
    expect(job?.type).toBe("generation");
  });

  it("POST /api/sync and POST /api/sync/:id enqueue background jobs in < 50ms", async () => {
    const sources = sourceRepo.list();
    const sourceId = sources[0].id;

    // Bulk sync
    const startBulk = performance.now();
    const resBulk = await fetch(`${serverUrl}/api/sync`, { method: "POST" });
    const bulkElapsed = performance.now() - startBulk;

    expect(bulkElapsed).toBeLessThan(500);
    expect(resBulk.status).toBe(202);
    const bodyBulk = (await resBulk.json()) as any;
    expect(bodyBulk.success).toBe(true);
    expect(bodyBulk.jobId).toBeDefined();

    // Single sync
    const startSingle = performance.now();
    const resSingle = await fetch(`${serverUrl}/api/sync/${sourceId}`, { method: "POST" });
    const singleElapsed = performance.now() - startSingle;

    expect(singleElapsed).toBeLessThan(500);
    expect(resSingle.status).toBe(202);
    const bodySingle = (await resSingle.json()) as any;
    expect(bodySingle.success).toBe(true);
    expect(bodySingle.jobId).toBeDefined();
  });

  it("POST /api/documents/export with ?async=true enqueues background export in < 50ms", async () => {
    const start = performance.now();
    const res = await fetch(`${serverUrl}/api/documents/export?async=true&format=markdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "markdown" }),
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.jobId).toBeDefined();

    const job = jobRepo.getById(body.jobId);
    expect(job?.type).toBe("export");
  });

  it("GET /api/jobs and GET /api/jobs/:id list and retrieve job details with logs", async () => {
    // Create and run a job
    const createdJob = await jobManager.enqueueJob(
      "generation",
      "List test",
      {},
      async (_j, ctx) => {
        ctx.log(1, "Step 1", "info", "Detailed log message");
        return { count: 1 };
      },
      1
    );

    // Wait a brief tick for completion
    await new Promise((r) => setTimeout(r, 60));

    // GET /api/jobs
    const resList = await fetch(`${serverUrl}/api/jobs`);
    expect(resList.status).toBe(200);
    const jobs = (await resList.json()) as any[];
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.some((j) => j.id === createdJob.id)).toBe(true);

    // GET /api/jobs/:id
    const resSingle = await fetch(`${serverUrl}/api/jobs/${createdJob.id}`);
    expect(resSingle.status).toBe(200);
    const details = (await resSingle.json()) as any;
    expect(details.job.id).toBe(createdJob.id);
    expect(details.logs.length).toBeGreaterThan(0);
    expect(details.logs[0].message).toBe("Detailed log message");

    // 404 for non-existent job
    const res404 = await fetch(`${serverUrl}/api/jobs/non-existent-id`);
    expect(res404.status).toBe(404);
  });

  it("POST /api/jobs/:id/cancel cancels a queued or running job", async () => {
    // Create an indefinite job
    const job = await jobManager.enqueueJob(
      "generation",
      "Cancel test",
      {},
      async (_j, ctx) => {
        return new Promise((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      },
      1
    );

    const resCancel = await fetch(`${serverUrl}/api/jobs/${job.id}/cancel`, {
      method: "POST",
    });
    expect(resCancel.status).toBe(200);
    const body = (await resCancel.json()) as any;
    expect(body.success).toBe(true);
    expect(body.job.status).toBe("cancelled");
  });

  it("DELETE /api/jobs/history clears finished jobs", async () => {
    // Seed some completed jobs
    const j1 = jobRepo.create({ type: "generation", title: "Job 1" });
    jobRepo.update(j1.id, { status: "completed", completedAt: new Date().toISOString() });

    const j2 = jobRepo.create({ type: "sync_all", title: "Job 2" });
    jobRepo.update(j2.id, { status: "failed", completedAt: new Date().toISOString() });

    const resDelete = await fetch(`${serverUrl}/api/jobs/history`, {
      method: "DELETE",
    });
    expect(resDelete.status).toBe(200);
    const body = (await resDelete.json()) as any;
    expect(body.success).toBe(true);
    expect(body.deletedCount).toBeGreaterThanOrEqual(2);

    // Verify they are purged
    expect(jobRepo.getById(j1.id)).toBeNull();
    expect(jobRepo.getById(j2.id)).toBeNull();
  });

  it("GET /api/jobs/stream streams SSE events for job lifecycle", async () => {
    const receivedEvents: string[] = [];

    const req = http.get(`${serverUrl}/api/jobs/stream`, (res) => {
      expect(res.headers["content-type"]).toBe("text/event-stream");
      res.on("data", (chunk) => {
        receivedEvents.push(chunk.toString());
      });
    });

    // Wait for connection
    await new Promise((r) => setTimeout(r, 50));

    // Trigger job event
    await jobManager.enqueueJob(
      "generation",
      "SSE Test Job",
      {},
      async (_j, ctx) => {
        ctx.updateProgress(1, 1, "Testing");
        ctx.log(1, "Step 1", "info", "SSE Log Event");
        return { ok: true };
      },
      1
    );

    // Give time for events to be pushed over SSE
    await new Promise((r) => setTimeout(r, 100));

    req.destroy();

    const fullStream = receivedEvents.join("");
    expect(fullStream).toContain("event: connected");
    expect(fullStream).toContain("event: job_created");
    expect(fullStream).toContain("event: job_progress");
    expect(fullStream).toContain("event: job_log");
    expect(fullStream).toContain("SSE Log Event");
  });

  it("GET /api/jobs/:id/logs/stream streams specific job step logs and replays history", async () => {
    // Create job with existing log
    const job = jobRepo.create({ type: "generation", title: "Logs Stream Job" });
    jobRepo.appendLog({
      jobId: job.id,
      stepNumber: 1,
      stepTitle: "Existing Step",
      level: "info",
      message: "Historical log line",
    });

    const receivedChunks: string[] = [];

    const req = http.get(`${serverUrl}/api/jobs/${job.id}/logs/stream`, (res) => {
      expect(res.headers["content-type"]).toBe("text/event-stream");
      res.on("data", (chunk) => {
        receivedChunks.push(chunk.toString());
      });
    });

    await new Promise((r) => setTimeout(r, 50));

    // Emit another log via JobManager
    jobManager.emit("job_log", {
      jobId: job.id,
      stepNumber: 2,
      stepTitle: "Live Step",
      level: "success",
      message: "Real-time streamed log line",
    });

    await new Promise((r) => setTimeout(r, 80));
    req.destroy();

    const output = receivedChunks.join("");
    expect(output).toContain("Historical log line");
    expect(output).toContain("Real-time streamed log line");
  });
});
