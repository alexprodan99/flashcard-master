import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  Flashcard,
  FlashcardRepository,
  DataSourceRepository,
  SyncStateRepository,
  CardDeduplicationService,
  IngestionService,
  DocumentRepository,
} from "@flashcard-master/core";
import type { JobExecutionContext } from "../jobs/job-manager.js";
import type {
  TaskPayload,
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from "./task-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_WORKER_HEAP_MB = 512;
const DEFAULT_TASK_TIMEOUT_MS = 3_600_000; // 60 minutes default (configurable, 0 to disable)

export interface WorkerExecutorOptions {
  cardRepo?: FlashcardRepository;
  sourceRepo?: DataSourceRepository;
  syncRepo?: SyncStateRepository;
  dedupService?: CardDeduplicationService;
  ingestionService?: IngestionService;
  documentRepo?: DocumentRepository;
  workerScriptPath?: string;
  maxWorkerHeapMb?: number;
  defaultTimeoutMs?: number;
}

export function resolveDefaultWorkerScriptPath(): string {
  // 1. Same directory task-worker.js (compiled dist/workers/task-worker.js)
  const jsNeighbor = path.resolve(__dirname, "task-worker.js");
  if (fs.existsSync(jsNeighbor)) {
    return jsNeighbor;
  }

  // 2. Compiled dist from src/workers/ (e.g. running from tests)
  const distFromSrc = path.resolve(__dirname, "../../dist/workers/task-worker.js");
  if (fs.existsSync(distFromSrc)) {
    return distFromSrc;
  }

  // 3. Same directory task-worker.ts (running in ts-node or strip-types)
  const tsNeighbor = path.resolve(__dirname, "task-worker.ts");
  if (fs.existsSync(tsNeighbor)) {
    return tsNeighbor;
  }

  // 4. From dist back to src
  const srcPath = path.resolve(__dirname, "../../src/workers/task-worker.ts");
  if (fs.existsSync(srcPath)) {
    return srcPath;
  }

  return jsNeighbor;
}

export class WorkerExecutor {
  private readonly workerScriptPath: string;

  constructor(private readonly options: WorkerExecutorOptions = {}) {
    this.workerScriptPath = options.workerScriptPath || resolveDefaultWorkerScriptPath();
  }

  async executeTask(
    task: TaskPayload,
    ctx: JobExecutionContext
  ): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      let worker: Worker | null = null;
      let isCompleted = false;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        isCompleted = true;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (worker) {
          worker.terminate().catch(() => {});
          worker = null;
        }
      };

      if (ctx.signal.aborted) {
        const err = new Error("Task aborted by user");
        err.name = "AbortError";
        return reject(err);
      }

      try {
        const isTs = this.workerScriptPath.endsWith(".ts");
        const execArgv = isTs
          ? ["--experimental-strip-types"]
          : undefined;

        const heapLimitMb = this.options.maxWorkerHeapMb ?? MAX_WORKER_HEAP_MB;
        worker = new Worker(this.workerScriptPath, {
          execArgv,
          resourceLimits: {
            maxOldGenerationSizeMb: heapLimitMb,
          },
        });

        // Configurable execution timeout guard (0 to disable)
        const rawTimeout = Number((task.payload as any)?.timeoutMs);
        const timeoutMs =
          Number.isFinite(rawTimeout) && rawTimeout >= 0
            ? rawTimeout
            : (this.options.defaultTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS);

        if (typeof timeoutMs === "number" && timeoutMs > 0 && timeoutMs !== Infinity) {
          timeoutTimer = setTimeout(() => {
            if (!isCompleted) {
              const timeoutErr = new Error(`Task execution timed out after ${timeoutMs}ms`);
              timeoutErr.name = "TimeoutError";
              ctx.log(
                0,
                "Execution Timeout",
                "error",
                `Worker task exceeded timeout limit of ${timeoutMs}ms and was terminated`,
                { timeoutMs }
              );
              cleanup();
              reject(timeoutErr);
            }
          }, timeoutMs);
        }

        // Handle task cancellation via AbortSignal
        ctx.signal.addEventListener("abort", () => {
          if (worker && !isCompleted) {
            try {
              const abortMsg: WorkerInboundMessage = {
                action: "ABORT_TASK",
                jobId: ctx.jobId,
              };
              worker.postMessage(abortMsg);
            } catch {}
            cleanup();
            const err = new Error("Task aborted by user");
            err.name = "AbortError";
            reject(err);
          }
        });

        const committedCards: Flashcard[] = [];

        // Listen for IPC messages from worker
        worker.on("message", async (msg: WorkerOutboundMessage) => {
          if (isCompleted || !worker) return;

          try {
            if (msg.type === "STEP_PROGRESS") {
              ctx.updateProgress(msg.currentStep, msg.totalSteps, msg.stepName);
            } else if (msg.type === "STEP_LOG") {
              ctx.log(msg.stepNumber, msg.stepTitle, msg.level, msg.message, msg.details);
            } else if (msg.type === "COMMIT_CARDS") {
              // Main thread: SQLite custodian
              let createdCount = 0;
              let duplicatesCount = 0;

              if (this.options.cardRepo) {
                const existingCards = this.options.cardRepo.list({ targetDeck: msg.targetDeck });
                const drafts = msg.cards.map((c) => ({
                  question: c.question,
                  answer: c.answer,
                  sourceQuote: c.sourceQuote,
                  citation: c.citation || c.sourceQuote,
                  difficulty: c.difficulty,
                  keywords: c.keywords || [],
                  sourceLocator: c.sourceLocator || "",
                }));

                const dedupResult = this.options.dedupService
                  ? this.options.dedupService.filterUnique(drafts, existingCards)
                  : { unique: drafts, duplicates: [] };

                duplicatesCount = dedupResult.duplicates.length;

                let targetSourceId: string | null = msg.sourceId || null;
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                if (targetSourceId && !uuidRegex.test(targetSourceId)) {
                  targetSourceId = null;
                } else if (targetSourceId && this.options.sourceRepo) {
                  try {
                    const found = this.options.sourceRepo.getById(targetSourceId);
                    if (!found) targetSourceId = null;
                  } catch {
                    targetSourceId = null;
                  }
                }

                const validDifficulties = ["beginner", "intermediate", "expert", "mixed"];
                for (const draft of dedupResult.unique) {
                  const normalizedDifficulty = validDifficulties.includes(draft.difficulty as string)
                    ? (draft.difficulty as any)
                    : "intermediate";

                  try {
                    const created = this.options.cardRepo.create({
                      sourceId: targetSourceId,
                      question: draft.question,
                      answer: draft.answer,
                      sourceQuote: draft.sourceQuote || draft.question || "N/A",
                      sourceOriginUrl: msg.originUrl,
                      documentTitle: msg.documentTitle,
                      difficulty: normalizedDifficulty,
                      targetDeck: msg.targetDeck,
                      personaUsed: msg.persona || "socratic-mentor",
                      tags: msg.tags || [],
                      keywords: draft.keywords || [],
                      sourceLocator: draft.sourceLocator || "",
                    });
                    if (created) {
                      committedCards.push(created);
                      ctx.emitCard?.(created);
                    }
                  } catch (createErr: any) {
                    // Fallback to null sourceId if foreign key constraint failed
                    if (targetSourceId && String(createErr.message).includes("FOREIGN KEY")) {
                      targetSourceId = null;
                      const created = this.options.cardRepo.create({
                        sourceId: null,
                        question: draft.question,
                        answer: draft.answer,
                        sourceQuote: draft.sourceQuote || draft.question || "N/A",
                        sourceOriginUrl: msg.originUrl,
                        documentTitle: msg.documentTitle,
                        difficulty: normalizedDifficulty,
                        targetDeck: msg.targetDeck,
                        personaUsed: msg.persona || "socratic-mentor",
                        tags: msg.tags || [],
                        keywords: draft.keywords || [],
                        sourceLocator: draft.sourceLocator || "",
                      });
                      if (created) {
                        committedCards.push(created);
                        ctx.emitCard?.(created);
                      }
                    } else {
                      throw createErr;
                    }
                  }
                  createdCount++;
                }
              }

              const ackMsg: WorkerInboundMessage = {
                action: "COMMIT_CARDS_ACK",
                jobId: msg.jobId,
                stepNumber: msg.stepNumber,
                createdCount,
                duplicatesCount,
                totalUnique: createdCount,
              };
              worker.postMessage(ackMsg);
            } else if (msg.type === "COMMIT_SYNC_RESULT") {
              let newCount = 0;
              let totalFetched = 0;

              if (Array.isArray(msg.documents) && msg.documents.length > 0) {
                try {
                  if (this.options.documentRepo) {
                    this.options.documentRepo.upsertBatch(msg.documents as any);
                  } else {
                    ctx.log(
                      msg.stepNumber || 0,
                      "Storage Warning",
                      "warn",
                      "Document repository not configured; skipping subdocument persistence."
                    );
                  }
                  newCount = msg.documents.length;
                  totalFetched = msg.documents.length;

                  if (this.options.syncRepo) {
                    this.options.syncRepo.upsert({
                      sourceId: msg.sourceId,
                      lastSyncedAt: new Date().toISOString(),
                      itemCount: newCount,
                    });
                  }
                } catch (dbErr: any) {
                  ctx.log(
                    msg.stepNumber || 0,
                    "Database Error",
                    "error",
                    `Failed to persist subdocuments to SQLite: ${dbErr.message}`,
                    { error: dbErr.message }
                  );
                  throw dbErr;
                }
              } else if (
                this.options.ingestionService &&
                (msg.documents === undefined || !this.options.documentRepo)
              ) {
                try {
                  const syncResult = await this.options.ingestionService.syncSource(msg.sourceId, {
                    slicing: msg.slicing,
                    onLog: (level, message, details) => {
                      ctx.log(msg.stepNumber || 0, msg.stepTitle || "Source Sync", level, message, details);
                    },
                    signal: ctx.signal,
                  });
                  newCount = syncResult?.newCount || 0;
                  totalFetched = syncResult?.totalFetched || 0;
                } catch (syncErr: any) {
                  ctx.log(
                    msg.stepNumber || 0,
                    "Sync Error",
                    "warn",
                    `Custodial sync failed for source ${msg.sourceId}: ${syncErr.message}`
                  );
                }
              } else if (this.options.syncRepo && Array.isArray(msg.documents)) {
                this.options.syncRepo.upsert({
                  sourceId: msg.sourceId,
                  lastSyncedAt: new Date().toISOString(),
                  itemCount: 0,
                });
              }

              const ackMsg: WorkerInboundMessage = {
                action: "COMMIT_SYNC_ACK",
                jobId: msg.jobId,
                sourceId: msg.sourceId,
                newCount,
                totalFetched,
              };
              worker.postMessage(ackMsg);
            } else if (msg.type === "TASK_COMPLETE") {
              const summary = msg.resultSummary || {};
              if (committedCards.length > 0 && !summary.newCards) {
                summary.newCards = committedCards;
              }
              ctx.setResultSummary(summary);
              cleanup();
              resolve(summary);
            } else if (msg.type === "TASK_ERROR") {
              cleanup();
              reject(new Error(msg.error));
            }
          } catch (err: any) {
            cleanup();
            reject(err);
          }
        });

        worker.on("error", (err) => {
          if (!isCompleted) {
            cleanup();
            reject(err);
          }
        });

        worker.on("exit", (code) => {
          if (!isCompleted) {
            cleanup();
            if (code !== 0) {
              reject(new Error(`Worker stopped with non-zero exit code: ${code}`));
            } else {
              resolve({});
            }
          }
        });

        // Send start message
        const startMsg: WorkerInboundMessage = {
          action: "START_TASK",
          jobId: ctx.jobId,
          task,
        };
        worker.postMessage(startMsg);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
}
