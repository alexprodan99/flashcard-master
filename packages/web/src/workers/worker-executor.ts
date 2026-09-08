import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  FlashcardRepository,
  DataSourceRepository,
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

export interface WorkerExecutorOptions {
  cardRepo?: FlashcardRepository;
  sourceRepo?: DataSourceRepository;
  dedupService?: CardDeduplicationService;
  ingestionService?: IngestionService;
  documentRepo?: DocumentRepository;
  workerScriptPath?: string;
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

      const cleanup = () => {
        isCompleted = true;
        if (worker) {
          worker.terminate().catch(() => {});
          worker = null;
        }
      };

      try {
        const isTs = this.workerScriptPath.endsWith(".ts");
        const execArgv = isTs
          ? ["--experimental-strip-types"]
          : undefined;

        worker = new Worker(this.workerScriptPath, { execArgv });

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
                  difficulty: c.difficulty,
                }));

                const dedupResult = this.options.dedupService
                  ? this.options.dedupService.filterUnique(drafts, existingCards)
                  : { unique: drafts, duplicates: [] };

                duplicatesCount = dedupResult.duplicates.length;

                let targetSourceId: string | null = msg.sourceId || null;
                if (targetSourceId && this.options.sourceRepo) {
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
                    this.options.cardRepo.create({
                      sourceId: targetSourceId,
                      question: draft.question,
                      answer: draft.answer,
                      sourceQuote: draft.sourceQuote || draft.question || "N/A",
                      sourceOriginUrl: msg.originUrl,
                      documentTitle: msg.documentTitle,
                      difficulty: normalizedDifficulty,
                      targetDeck: msg.targetDeck,
                      personaUsed: "socratic-mentor",
                      tags: [],
                    });
                  } catch (createErr: any) {
                    // Fallback to null sourceId if foreign key constraint failed
                    if (targetSourceId && String(createErr.message).includes("FOREIGN KEY")) {
                      targetSourceId = null;
                      this.options.cardRepo.create({
                        sourceId: null,
                        question: draft.question,
                        answer: draft.answer,
                        sourceQuote: draft.sourceQuote || draft.question || "N/A",
                        sourceOriginUrl: msg.originUrl,
                        documentTitle: msg.documentTitle,
                        difficulty: normalizedDifficulty,
                        targetDeck: msg.targetDeck,
                        personaUsed: "socratic-mentor",
                        tags: [],
                      });
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
              let syncResult: any = { newCount: 0, totalFetched: 0 };
              if (this.options.ingestionService) {
                syncResult = await this.options.ingestionService.syncSource(msg.sourceId);
              }

              const ackMsg: WorkerInboundMessage = {
                action: "COMMIT_SYNC_ACK",
                jobId: msg.jobId,
                sourceId: msg.sourceId,
                newCount: syncResult.newCount || 0,
                totalFetched: syncResult.totalFetched || 0,
              };
              worker.postMessage(ackMsg);
            } else if (msg.type === "TASK_COMPLETE") {
              ctx.setResultSummary(msg.resultSummary);
              cleanup();
              resolve(msg.resultSummary);
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
