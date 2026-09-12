import { describe, it, expect, beforeEach } from "vitest";
import { createDatabaseClient, JobRepository } from "@flashcard-master/core";
import { JobManager, type JobExecutionContext } from "../src/jobs/job-manager.js";

describe("JobManager", () => {
  let db: any;
  let jobRepo: JobRepository;
  let jobManager: JobManager;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    jobRepo = new JobRepository(db);
    jobManager = new JobManager(jobRepo, {
      maxGenerationWorkers: 2,
      maxSyncWorkers: 1,
      maxExportWorkers: 1,
    });
  });

  it("initializes with configurable concurrency limits and getters", () => {
    const limits = jobManager.getLimits();
    expect(limits.maxGenerationWorkers).toBe(2);
    expect(limits.maxSyncWorkers).toBe(1);
    expect(limits.maxExportWorkers).toBe(1);

    const counts = jobManager.getActiveCounts();
    expect(counts.generation).toBe(0);
    expect(counts.sync).toBe(0);
    expect(counts.export).toBe(0);
  });

  it("enqueues and executes a task successfully with progress and logs", async () => {
    const createdEvents: any[] = [];
    const progressEvents: any[] = [];
    const logEvents: any[] = [];
    const statusEvents: any[] = [];
    const completedEvents: any[] = [];

    jobManager.on("job_created", (j) => createdEvents.push(j));
    jobManager.on("job_progress", (j) => progressEvents.push(j));
    jobManager.on("job_log", (l) => logEvents.push(l));
    jobManager.on("job_status", (j) => statusEvents.push(j));
    jobManager.on("job_completed", (j) => completedEvents.push(j));

    const job = await jobManager.enqueueJob(
      "generation",
      "Test Gen",
      { deck: "Test" },
      async (_j, ctx: JobExecutionContext) => {
        ctx.updateProgress(1, 2, "Doc 1");
        ctx.log(1, "Doc 1", "info", "Parsed doc");
        ctx.updateProgress(2, 2, "Doc 2");
        ctx.log(2, "Doc 2", "success", "Generated 4 cards");
        ctx.setResultSummary({ cardsCreated: 4 });
        return { success: true };
      },
      2
    );

    expect(job.id).toBeDefined();
    expect(job.status).toBe("queued");
    expect(createdEvents.length).toBe(1);

    // Wait for execution to complete
    await new Promise<void>((resolve) => {
      jobManager.on("job_completed", (completedJob) => {
        if (completedJob.id === job.id) resolve();
      });
    });

    const finalJob = jobManager.getJob(job.id);
    expect(finalJob?.status).toBe("completed");
    expect(finalJob?.progressPercent).toBe(100);
    expect(finalJob?.resultSummary?.cardsCreated).toBe(4);

    const logs = jobManager.getJobLogs(job.id);
    expect(logs.length).toBe(2);
    expect(logs[0].level).toBe("info");
    expect(logs[1].level).toBe("success");

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(logEvents.length).toBe(2);
    expect(completedEvents.length).toBe(1);
  });

  it("enforces strict concurrency pool limits and processes backlog in FIFO order", async () => {
    // maxGenerationWorkers is 2
    let activeRunning = 0;
    let maxObservedActive = 0;
    const completedOrder: number[] = [];

    const createHandler = (index: number, durationMs: number) => {
      return async () => {
        activeRunning++;
        if (activeRunning > maxObservedActive) {
          maxObservedActive = activeRunning;
        }
        await new Promise((r) => setTimeout(r, durationMs));
        activeRunning--;
        completedOrder.push(index);
        return { index };
      };
    };

    // Enqueue 4 jobs simultaneously
    const jobs = await Promise.all([
      jobManager.enqueueJob("generation", "Job 1", {}, createHandler(1, 40)),
      jobManager.enqueueJob("generation", "Job 2", {}, createHandler(2, 40)),
      jobManager.enqueueJob("generation", "Job 3", {}, createHandler(3, 20)),
      jobManager.enqueueJob("generation", "Job 4", {}, createHandler(4, 20)),
    ]);

    expect(jobs.length).toBe(4);

    // Wait for all 4 to finish
    await new Promise<void>((resolve) => {
      let count = 0;
      jobManager.on("job_completed", () => {
        count++;
        if (count === 4) resolve();
      });
    });

    // Concurrency must never have exceeded 2
    expect(maxObservedActive).toBe(2);
    expect(completedOrder.length).toBe(4);

    // All jobs should be in completed state
    for (const j of jobs) {
      const recorded = jobManager.getJob(j.id);
      expect(recorded?.status).toBe("completed");
    }
  });

  it("marks job as completed_with_warnings if any step logs a warning or error", async () => {
    const job = await jobManager.enqueueJob(
      "sync_all",
      "Sync All Sources",
      {},
      async (_j, ctx: JobExecutionContext) => {
        ctx.log(1, "Source 1", "info", "Synced successfully");
        ctx.log(2, "Source 2", "warn", "Source timed out, skipped");
        return { total: 2 };
      }
    );

    await new Promise<void>((resolve) => {
      jobManager.on("job_completed", (j) => {
        if (j.id === job.id) resolve();
      });
    });

    const recorded = jobManager.getJob(job.id);
    expect(recorded?.status).toBe("completed_with_warnings");
  });

  it("marks job as failed when handler throws an error", async () => {
    const failedEvents: any[] = [];
    jobManager.on("job_failed", (j) => failedEvents.push(j));

    const job = await jobManager.enqueueJob(
      "export",
      "Failing Export",
      {},
      async () => {
        throw new Error("Disk full");
      }
    );

    await new Promise<void>((resolve) => {
      jobManager.on("job_failed", (j) => {
        if (j.id === job.id) resolve();
      });
    });

    const recorded = jobManager.getJob(job.id);
    expect(recorded?.status).toBe("failed");
    expect(recorded?.errorMessage).toContain("Disk full");
    expect(failedEvents.length).toBe(1);
  });

  it("cancels a queued job before it starts executing", async () => {
    // Fill the 1-slot sync pool with a slow job
    let finishSlow: (val?: any) => void = () => {};
    const slowJob = await jobManager.enqueueJob("sync_all", "Slow Sync", {}, () => {
      return new Promise<void>((resolve) => {
        finishSlow = resolve;
      });
    });

    // Enqueue second job which should sit in the queue
    const queuedJob = await jobManager.enqueueJob("sync_all", "Queued Sync", {}, async () => {
      return { done: true };
    });

    expect(jobManager.getQueueLengths().sync).toBe(1);

    // Cancel queued job
    const cancelled = jobManager.cancelJob(queuedJob.id);
    expect(cancelled).toBe(true);

    const queuedRecord = jobManager.getJob(queuedJob.id);
    expect(queuedRecord?.status).toBe("cancelled");
    expect(jobManager.getQueueLengths().sync).toBe(0);

    // Finish slow job
    finishSlow();
    await new Promise<void>((resolve) => {
      jobManager.on("job_completed", (j) => {
        if (j.id === slowJob.id) resolve();
      });
    });
  });

  it("cancels an actively running job using AbortSignal", async () => {
    let observedAborted = false;
    const cancelledEvents: any[] = [];
    jobManager.on("job_cancelled", (j) => cancelledEvents.push(j));

    const job = await jobManager.enqueueJob(
      "generation",
      "Long Running Gen",
      {},
      async (_j, ctx) => {
        await new Promise((resolve, reject) => {
          ctx.signal.addEventListener("abort", () => {
            observedAborted = true;
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }
    );

    // Wait until running
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const current = jobManager.getJob(job.id);
        if (current?.status === "running") {
          clearInterval(interval);
          resolve();
        }
      }, 5);
    });

    const cancelPromise = new Promise<void>((resolve) => {
      jobManager.on("job_cancelled", (j) => {
        if (j.id === job.id) resolve();
      });
    });

    const didCancel = jobManager.cancelJob(job.id);
    expect(didCancel).toBe(true);

    await cancelPromise;
    await new Promise((r) => setTimeout(r, 20));

    expect(observedAborted).toBe(true);
    const recorded = jobManager.getJob(job.id);
    expect(recorded?.status).toBe("cancelled");
    expect(cancelledEvents.length).toBe(1);
  });

  it("prunes and clears job history", () => {
    jobRepo.create({ type: "generation", title: "Past 1", status: "completed" });
    jobRepo.create({ type: "generation", title: "Past 2", status: "failed" });
    jobRepo.create({ type: "generation", title: "Active", status: "running" });

    expect(jobManager.listJobs().length).toBe(3);

    const cleared = jobManager.clearHistory();
    expect(cleared).toBe(2);

    const remaining = jobManager.listJobs();
    expect(remaining.length).toBe(1);
    expect(remaining[0].title).toBe("Active");
  });

  it("supports verbose mode and console logging with debug level filtering", async () => {
    let isVerboseActive = false;
    const verboseManager = new JobManager(jobRepo, {
      isVerbose: () => isVerboseActive,
      logToConsole: true,
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      let done1: () => void;
      const p1 = new Promise<void>((r) => { done1 = r; });
      verboseManager.once("job_completed", () => done1());

      await verboseManager.enqueueJob(
        "sync_source",
        "Test Notion Sync",
        { sourceId: "notion-1" },
        async (_j, ctx) => {
          ctx.log(1, "Inspection", "debug", "Crawling subpage depth 2");
          ctx.log(1, "Inspection", "info", "Found 12 blocks");
          return { success: true };
        }
      );

      await p1;

      // When isVerboseActive is false, debug log should not be printed
      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("[START]");
      expect(output).toContain("[INFO]");
      expect(output).toContain("Found 12 blocks");
      expect(output).not.toContain("Crawling subpage depth 2");

      // Now enable verbose mode
      isVerboseActive = true;
      consoleSpy.mockClear();

      let done2: () => void;
      const p2 = new Promise<void>((r) => { done2 = r; });
      verboseManager.once("job_completed", () => done2());

      await verboseManager.enqueueJob(
        "sync_source",
        "Test Notion Sync 2",
        { sourceId: "notion-2" },
        async (_j, ctx) => {
          ctx.log(1, "Inspection", "debug", "Crawling subpage depth 2");
          return { success: true };
        }
      );

      await p2;

      const output2 = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output2).toContain("[DEBUG]");
      expect(output2).toContain("Crawling subpage depth 2");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
