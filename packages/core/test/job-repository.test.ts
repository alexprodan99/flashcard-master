import { describe, it, expect, beforeEach } from "vitest";
import { createDatabaseClient } from "../src/storage/db.js";
import { JobRepository } from "../src/storage/job-repository.js";

describe("JobRepository", () => {
  let db: any;
  let jobRepo: JobRepository;

  beforeEach(() => {
    db = createDatabaseClient({ inMemory: true });
    jobRepo = new JobRepository(db);
  });

  it("creates and retrieves a background job", () => {
    const job = jobRepo.create({
      type: "generation",
      title: "Generate cards for 3 docs",
      totalSteps: 3,
      metadata: { targetDeck: "Systems", documentIds: ["d1", "d2", "d3"] },
    });

    expect(job.id).toBeDefined();
    expect(job.type).toBe("generation");
    expect(job.status).toBe("queued");
    expect(job.title).toBe("Generate cards for 3 docs");
    expect(job.totalSteps).toBe(3);
    expect(job.currentStep).toBe(0);
    expect(job.progressPercent).toBe(0);
    expect(job.metadata.targetDeck).toBe("Systems");

    const fetched = jobRepo.getById(job.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(job.id);
    expect(fetched?.title).toBe(job.title);
  });

  it("lists jobs filtered by status, type, and limit", () => {
    jobRepo.create({ type: "generation", title: "Gen 1", status: "queued" });
    jobRepo.create({ type: "generation", title: "Gen 2", status: "running" });
    jobRepo.create({ type: "sync_all", title: "Sync All", status: "completed" });
    jobRepo.create({ type: "export", title: "Export EPUB", status: "failed" });

    const all = jobRepo.list();
    expect(all.length).toBe(4);

    const queuedOnly = jobRepo.list({ status: "queued" });
    expect(queuedOnly.length).toBe(1);
    expect(queuedOnly[0].title).toBe("Gen 1");

    const activeOnly = jobRepo.list({ status: ["queued", "running"] });
    expect(activeOnly.length).toBe(2);

    const syncOnly = jobRepo.list({ type: "sync_all" });
    expect(syncOnly.length).toBe(1);
    expect(syncOnly[0].title).toBe("Sync All");

    const limited = jobRepo.list({ limit: 2 });
    expect(limited.length).toBe(2);
  });

  it("updates job progress, step status, and result summary", () => {
    const job = jobRepo.create({
      type: "generation",
      title: "Generating Cards",
      totalSteps: 4,
    });

    const startedAt = new Date().toISOString();
    const updated = jobRepo.update(job.id, {
      status: "running",
      currentStep: 1,
      currentStepName: "Document 1: Raft Paper",
      progressPercent: 25,
      startedAt,
    });

    expect(updated.status).toBe("running");
    expect(updated.currentStep).toBe(1);
    expect(updated.currentStepName).toBe("Document 1: Raft Paper");
    expect(updated.progressPercent).toBe(25);
    expect(updated.startedAt).toBe(startedAt);

    const completedAt = new Date().toISOString();
    const finished = jobRepo.update(job.id, {
      status: "completed",
      currentStep: 4,
      progressPercent: 100,
      completedAt,
      resultSummary: { cardsCreated: 12, duplicatesSkipped: 1 },
    });

    expect(finished.status).toBe("completed");
    expect(finished.progressPercent).toBe(100);
    expect(finished.resultSummary?.cardsCreated).toBe(12);
  });

  it("appends and retrieves structured step-by-step logs in order", () => {
    const job = jobRepo.create({
      type: "generation",
      title: "Batch Generation",
      totalSteps: 2,
    });

    jobRepo.appendLog({
      jobId: job.id,
      stepNumber: 1,
      stepTitle: "Doc 1/2: Ingestion",
      level: "info",
      message: "Parsing text and splitting into 2 chunks",
    });

    jobRepo.appendLog({
      jobId: job.id,
      stepNumber: 1,
      stepTitle: "Doc 1/2: Grounding",
      level: "warn",
      message: "Discarded 1 ungrounded card candidate",
      details: { quote: "Unverified claim" },
    });

    jobRepo.appendLog({
      jobId: job.id,
      stepNumber: 1,
      stepTitle: "Doc 1/2: Commit",
      level: "success",
      message: "Committed 4 cards to deck",
    });

    const logs = jobRepo.getLogs(job.id);
    expect(logs.length).toBe(3);
    expect(logs[0].stepTitle).toBe("Doc 1/2: Ingestion");
    expect(logs[1].level).toBe("warn");
    expect(logs[1].details?.quote).toBe("Unverified claim");
    expect(logs[2].level).toBe("success");
    expect(logs[2].message).toBe("Committed 4 cards to deck");
  });

  it("cascades deletion of logs when a job is deleted", () => {
    const job = jobRepo.create({ type: "export", title: "Export Markdown" });
    jobRepo.appendLog({
      jobId: job.id,
      stepNumber: 1,
      stepTitle: "Exporting",
      level: "info",
      message: "Writing file",
    });

    expect(jobRepo.getLogs(job.id).length).toBe(1);

    const deleted = jobRepo.delete(job.id);
    expect(deleted).toBe(true);
    expect(jobRepo.getById(job.id)).toBeNull();
    expect(jobRepo.getLogs(job.id).length).toBe(0);
  });

  it("clears finished history while preserving running and queued jobs", () => {
    jobRepo.create({ type: "generation", title: "Active 1", status: "running" });
    jobRepo.create({ type: "generation", title: "Active 2", status: "queued" });
    jobRepo.create({ type: "sync_all", title: "Done 1", status: "completed" });
    jobRepo.create({ type: "export", title: "Done 2", status: "failed" });
    jobRepo.create({ type: "export", title: "Done 3", status: "cancelled" });

    const count = jobRepo.clearHistory();
    expect(count).toBe(3);

    const remaining = jobRepo.list();
    expect(remaining.length).toBe(2);
    expect(remaining.every((j) => j.status === "running" || j.status === "queued")).toBe(true);
  });

  it("prunes completed jobs according to retention limits", () => {
    for (let i = 0; i < 5; i++) {
      jobRepo.create({ type: "sync_all", title: `Sync ${i}`, status: "completed" });
    }

    expect(jobRepo.list({ status: "completed" }).length).toBe(5);

    // Keep last 2 completed jobs
    const pruned = jobRepo.pruneCompletedJobs({ keepLastN: 2, olderThanDays: 30 });
    expect(pruned).toBe(3);

    const remaining = jobRepo.list({ status: "completed" });
    expect(remaining.length).toBe(2);
  });
});
