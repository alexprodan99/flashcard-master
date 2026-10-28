import { EventEmitter } from "node:events";
import os from "node:os";
import type {
  Job,
  JobLog,
  JobType,
  JobStatus,
  JobLogLevel,
  JobRepository,
  Flashcard,
} from "@flashcard-master/core";

export interface ConcurrencyLimits {
  maxGenerationWorkers?: number;
  maxSyncWorkers?: number;
  maxExportWorkers?: number;
  workerTimeoutMinutes?: number;
  autoDetectCpu?: boolean;
}

export interface JobManagerOptions extends ConcurrencyLimits {
  isVerbose?: () => boolean;
  logToConsole?: boolean;
}

export interface JobExecutionContext {
  jobId: string;
  signal: AbortSignal;
  updateProgress: (currentStep: number, totalSteps?: number, stepName?: string) => void;
  log: (stepNumber: number, stepTitle: string, level: JobLogLevel, message: string, details?: Record<string, any>) => JobLog;
  setResultSummary: (summary: Record<string, any>) => void;
  emitCard?: (card: Flashcard) => void;
}

export type JobExecutionHandler = (job: Job, ctx: JobExecutionContext) => Promise<any>;

interface QueuedItem {
  jobId: string;
  type: JobType;
  handler: JobExecutionHandler;
  abortController: AbortController;
  hasWarningsOrErrors: boolean;
}

export class JobManager extends EventEmitter {
  private maxGenerationWorkers: number;
  private maxSyncWorkers: number;
  private maxExportWorkers: number;
  private workerTimeoutMinutes: number;

  private activeGenerationCount = 0;
  private activeSyncCount = 0;
  private activeExportCount = 0;

  private readonly generationQueue: QueuedItem[] = [];
  private readonly syncQueue: QueuedItem[] = [];
  private readonly exportQueue: QueuedItem[] = [];

  private readonly activeJobs = new Map<string, QueuedItem>();

  private readonly isVerboseFn: () => boolean;
  private readonly logToConsole: boolean;

  static getRecommendedConcurrency(): {
    cpuCores: number;
    maxGenerationWorkers: number;
    maxSyncWorkers: number;
    maxExportWorkers: number;
  } {
    const cores = Math.max(1, os.cpus()?.length || 1);
    return {
      cpuCores: cores,
      maxGenerationWorkers: Math.max(1, Math.min(8, Math.floor(cores / 2) || 1)),
      maxSyncWorkers: Math.max(1, Math.min(8, Math.floor(cores / 2) || 1)),
      maxExportWorkers: Math.max(1, Math.min(4, Math.floor(cores / 4) || 1)),
    };
  }

  constructor(
    private readonly jobRepo: JobRepository,
    options: JobManagerOptions = {}
  ) {
    super();
    const recommended = options.autoDetectCpu ? JobManager.getRecommendedConcurrency() : null;

    this.maxGenerationWorkers = options.maxGenerationWorkers !== undefined && options.maxGenerationWorkers > 0
      ? options.maxGenerationWorkers
      : (recommended ? recommended.maxGenerationWorkers : 3);
    this.maxSyncWorkers = options.maxSyncWorkers !== undefined && options.maxSyncWorkers > 0
      ? options.maxSyncWorkers
      : (recommended ? recommended.maxSyncWorkers : 2);
    this.maxExportWorkers = options.maxExportWorkers !== undefined && options.maxExportWorkers > 0
      ? options.maxExportWorkers
      : (recommended ? recommended.maxExportWorkers : 2);
    this.workerTimeoutMinutes = options.workerTimeoutMinutes !== undefined && options.workerTimeoutMinutes >= 0
      ? options.workerTimeoutMinutes
      : 15;
    this.isVerboseFn = options.isVerbose ?? (() => {
      const v = process.env.VERBOSE?.toLowerCase();
      const d = process.env.DEBUG?.toLowerCase();
      return v === "true" || v === "1" || d === "true" || d === "1";
    });
    this.logToConsole = options.logToConsole ?? (process.env.NODE_ENV !== "test");
  }

  isVerbose(): boolean {
    return this.isVerboseFn();
  }

  private printConsole(
    level: JobLogLevel | "start" | "done" | "fail" | "cancel",
    jobId: string,
    message: string,
    stepInfo?: { stepNumber: number; stepTitle: string },
    details?: Record<string, any>
  ): void {
    if (!this.logToConsole) return;
    if (level === "debug" && !this.isVerbose()) return;

    const time = new Date().toISOString().split("T")[1].slice(0, 8);
    const shortId = jobId.length > 8 ? jobId.slice(0, 8) : jobId;
    const timeStr = `\x1b[90m[${time}]\x1b[0m`;
    const idStr = `\x1b[90m[${shortId}]\x1b[0m`;

    let badge = "";
    switch (level) {
      case "start":
        badge = "\x1b[34m[START]\x1b[0m";
        break;
      case "done":
        badge = "\x1b[32m[DONE]\x1b[0m";
        break;
      case "fail":
        badge = "\x1b[31m[FAIL]\x1b[0m";
        break;
      case "cancel":
        badge = "\x1b[33m[CANCEL]\x1b[0m";
        break;
      case "debug":
        badge = "\x1b[35m[DEBUG]\x1b[0m";
        break;
      case "info":
        badge = "\x1b[36m[INFO]\x1b[0m";
        break;
      case "warn":
        badge = "\x1b[33m[WARN]\x1b[0m";
        break;
      case "error":
        badge = "\x1b[31m[ERROR]\x1b[0m";
        break;
      case "success":
        badge = "\x1b[32m[SUCCESS]\x1b[0m";
        break;
    }

    const stepStr = stepInfo ? `\x1b[90m(Step ${stepInfo.stepNumber}: ${stepInfo.stepTitle})\x1b[0m ` : "";
    console.log(`${timeStr} ${badge} ${idStr} ${stepStr}${message}`);

    if (details && Object.keys(details).length > 0 && (level === "error" || level === "fail" || this.isVerbose())) {
      console.log(`\x1b[90m          Details: ${JSON.stringify(details)}\x1b[0m`);
    }
  }

  getLimits(): {
    maxGenerationWorkers: number;
    maxSyncWorkers: number;
    maxExportWorkers: number;
    workerTimeoutMinutes: number;
  } {
    return {
      maxGenerationWorkers: this.maxGenerationWorkers,
      maxSyncWorkers: this.maxSyncWorkers,
      maxExportWorkers: this.maxExportWorkers,
      workerTimeoutMinutes: this.workerTimeoutMinutes,
    };
  }

  updateConcurrencyLimits(limits: ConcurrencyLimits): void {
    if (limits.autoDetectCpu) {
      const rec = JobManager.getRecommendedConcurrency();
      this.maxGenerationWorkers = rec.maxGenerationWorkers;
      this.maxSyncWorkers = rec.maxSyncWorkers;
      this.maxExportWorkers = rec.maxExportWorkers;
    }
    if (limits.maxGenerationWorkers !== undefined && limits.maxGenerationWorkers > 0) {
      this.maxGenerationWorkers = Math.max(1, Math.min(16, limits.maxGenerationWorkers));
    }
    if (limits.maxSyncWorkers !== undefined && limits.maxSyncWorkers > 0) {
      this.maxSyncWorkers = Math.max(1, Math.min(16, limits.maxSyncWorkers));
    }
    if (limits.maxExportWorkers !== undefined && limits.maxExportWorkers > 0) {
      this.maxExportWorkers = Math.max(1, Math.min(16, limits.maxExportWorkers));
    }
    if (limits.workerTimeoutMinutes !== undefined && limits.workerTimeoutMinutes >= 0) {
      this.workerTimeoutMinutes = Math.max(0, Math.min(120, limits.workerTimeoutMinutes));
    }

    while (this.activeGenerationCount < this.maxGenerationWorkers && this.generationQueue.length > 0) {
      this.dispatchNext("generation");
    }
    while (this.activeSyncCount < this.maxSyncWorkers && this.syncQueue.length > 0) {
      this.dispatchNext("sync");
    }
    while (this.activeExportCount < this.maxExportWorkers && this.exportQueue.length > 0) {
      this.dispatchNext("export");
    }

    this.emit("limits_updated", this.getLimits());
  }

  getActiveCounts(): { generation: number; sync: number; export: number } {
    return {
      generation: this.activeGenerationCount,
      sync: this.activeSyncCount,
      export: this.activeExportCount,
    };
  }

  getQueueLengths(): { generation: number; sync: number; export: number } {
    return {
      generation: this.generationQueue.length,
      sync: this.syncQueue.length,
      export: this.exportQueue.length,
    };
  }

  private getPoolForType(type: JobType): "generation" | "sync" | "export" {
    if (type === "generation") return "generation";
    if (type === "sync_all" || type === "sync_source") return "sync";
    return "export";
  }

  async enqueueJob(
    type: JobType,
    title: string,
    metadata: Record<string, any> = {},
    handler?: JobExecutionHandler,
    totalSteps = 1
  ): Promise<Job> {
    const job = this.jobRepo.create({
      type,
      title,
      totalSteps,
      status: "queued",
      metadata,
    });

    this.emit("job_created", job);

    const defaultHandler: JobExecutionHandler = handler || (async () => ({}));
    const item: QueuedItem = {
      jobId: job.id,
      type,
      handler: defaultHandler,
      abortController: new AbortController(),
      hasWarningsOrErrors: false,
    };

    const pool = this.getPoolForType(type);
    if (pool === "generation") {
      this.generationQueue.push(item);
    } else if (pool === "sync") {
      this.syncQueue.push(item);
    } else {
      this.exportQueue.push(item);
    }

    // Schedule processing asynchronously
    queueMicrotask(() => {
      this.dispatchNext(pool);
    });

    return job;
  }

  private dispatchNext(pool: "generation" | "sync" | "export"): void {
    let queue: QueuedItem[];
    let activeCount: number;
    let maxLimit: number;

    if (pool === "generation") {
      queue = this.generationQueue;
      activeCount = this.activeGenerationCount;
      maxLimit = this.maxGenerationWorkers;
    } else if (pool === "sync") {
      queue = this.syncQueue;
      activeCount = this.activeSyncCount;
      maxLimit = this.maxSyncWorkers;
    } else {
      queue = this.exportQueue;
      activeCount = this.activeExportCount;
      maxLimit = this.maxExportWorkers;
    }

    if (activeCount >= maxLimit || queue.length === 0) {
      return;
    }

    const item = queue.shift();
    if (!item) return;

    // Check if job was cancelled while queued
    const freshJob = this.jobRepo.getById(item.jobId);
    if (!freshJob || freshJob.status === "cancelled") {
      this.dispatchNext(pool);
      return;
    }

    // Allocate slot
    if (pool === "generation") this.activeGenerationCount++;
    else if (pool === "sync") this.activeSyncCount++;
    else this.activeExportCount++;

    this.activeJobs.set(item.jobId, item);

    // Update status to running
    const startedAt = new Date().toISOString();
    const runningJob = this.jobRepo.update(item.jobId, {
      status: "running",
      startedAt,
    });
    this.emit("job_status", runningJob);
    this.printConsole("start", item.jobId, `Starting job: "${runningJob.title}" (type: ${runningJob.type})`);

    // Prepare execution context
    let latestSummary: Record<string, any> | undefined;

    const ctx: JobExecutionContext = {
      jobId: item.jobId,
      signal: item.abortController.signal,
      updateProgress: (currentStep: number, totalSteps?: number, stepName?: string) => {
        const jobRecord = this.jobRepo.getById(item.jobId);
        if (!jobRecord) return;
        const total = totalSteps !== undefined ? totalSteps : jobRecord.totalSteps;
        const percent = total > 0 ? Math.min(100, Math.round((currentStep / total) * 100)) : 0;

        const updated = this.jobRepo.update(item.jobId, {
          currentStep,
          totalSteps: total,
          progressPercent: percent,
          currentStepName: stepName,
        });
        this.emit("job_progress", updated);
      },
      log: (stepNumber: number, stepTitle: string, level: JobLogLevel, message: string, details?: Record<string, any>) => {
        if (level === "warn" || level === "error") {
          item.hasWarningsOrErrors = true;
        }
        const logged = this.jobRepo.appendLog({
          jobId: item.jobId,
          stepNumber,
          stepTitle,
          level,
          message,
          details,
        });
        this.emit("job_log", logged);
        this.printConsole(level, item.jobId, message, { stepNumber, stepTitle }, details);
        return logged;
      },
      setResultSummary: (summary: Record<string, any>) => {
        latestSummary = summary;
      },
      emitCard: (card: Flashcard) => {
        this.emit("card_created", { jobId: item.jobId, card });
      },
    };

    // Enforce worker task timeout
    let timeoutTimer: NodeJS.Timeout | null = null;
    if (this.workerTimeoutMinutes > 0) {
      const timeoutMs = this.workerTimeoutMinutes * 60 * 1000;
      timeoutTimer = setTimeout(() => {
        this.printConsole("warn", item.jobId, `Job exceeded execution timeout limit (${this.workerTimeoutMinutes}m)`);
        item.abortController.abort();
      }, timeoutMs);
    }

    // Execute handler
    item.handler(runningJob, ctx)
      .then((result) => {
        const completedAt = new Date().toISOString();
        const current = this.jobRepo.getById(item.jobId);
        if (current?.status === "cancelled") {
          return;
        }

        const summary = latestSummary || (result && typeof result === "object" ? result : undefined);
        const finalStatus: JobStatus = item.hasWarningsOrErrors ? "completed_with_warnings" : "completed";

        const completedJob = this.jobRepo.update(item.jobId, {
          status: finalStatus,
          progressPercent: 100,
          completedAt,
          resultSummary: summary,
        });

        this.emit("job_status", completedJob);
        this.emit("job_completed", completedJob);
        this.printConsole("done", item.jobId, `Completed job: "${completedJob.title}" (${finalStatus})`, undefined, summary);
      })
      .catch((err: any) => {
        const completedAt = new Date().toISOString();
        const current = this.jobRepo.getById(item.jobId);
        if (current?.status === "cancelled") {
          return;
        }

        if (item.abortController.signal.aborted) {
          const cancelledJob = this.jobRepo.update(item.jobId, {
            status: "cancelled",
            completedAt,
          });
          this.emit("job_status", cancelledJob);
          this.emit("job_cancelled", cancelledJob);
          this.printConsole("cancel", item.jobId, `Job cancelled: "${runningJob.title}"`);
        } else {
          const failedJob = this.jobRepo.update(item.jobId, {
            status: "failed",
            errorMessage: err.message || "Internal error during job execution",
            completedAt,
          });
          this.emit("job_status", failedJob);
          this.emit("job_failed", failedJob);
          this.printConsole("fail", item.jobId, `Job failed: "${runningJob.title}" - ${err.message || "Error"}`, undefined, { error: String(err?.stack || err) });
        }
      })
      .finally(() => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }

        // Free slot
        if (pool === "generation") this.activeGenerationCount--;
        else if (pool === "sync") this.activeSyncCount--;
        else this.activeExportCount--;

        this.activeJobs.delete(item.jobId);
        this.dispatchNext(pool);
      });
  }

  cancelJob(id: string): boolean {
    const job = this.jobRepo.getById(id);
    if (!job) return false;

    // Already finished
    if (
      job.status === "completed" ||
      job.status === "completed_with_warnings" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return false;
    }

    // If currently running, signal abort
    const active = this.activeJobs.get(id);
    if (active) {
      active.abortController.abort();
      const updated = this.jobRepo.update(id, {
        status: "cancelled",
        completedAt: new Date().toISOString(),
      });
      this.emit("job_status", updated);
      this.emit("job_cancelled", updated);
      return true;
    }

    // If still in queue, remove from queue
    const pool = this.getPoolForType(job.type);
    const queue =
      pool === "generation"
        ? this.generationQueue
        : pool === "sync"
          ? this.syncQueue
          : this.exportQueue;

    const idx = queue.findIndex((q) => q.jobId === id);
    if (idx !== -1) {
      queue.splice(idx, 1);
    }

    const updated = this.jobRepo.update(id, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
    this.emit("job_status", updated);
    this.emit("job_cancelled", updated);
    this.printConsole("cancel", id, `Job cancelled while queued: "${job.title}"`);
    return true;
  }

  getJob(id: string): Job | null {
    return this.jobRepo.getById(id);
  }

  getJobLogs(id: string): JobLog[] {
    return this.jobRepo.getLogs(id);
  }

  listJobs(filter?: { status?: JobStatus | JobStatus[]; type?: JobType; limit?: number }): Job[] {
    return this.jobRepo.list(filter);
  }

  pruneJobs(options?: { olderThanDays?: number; keepLastN?: number }): number {
    return this.jobRepo.pruneCompletedJobs(options);
  }

  clearHistory(): number {
    return this.jobRepo.clearHistory();
  }
}
