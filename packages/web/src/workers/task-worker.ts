import { parentPort } from "node:worker_threads";
import {
  CardGenerationService,
  PromptBuilder,
  GroundingGuard,
  PersonaStudioService,
  type CleanTextDocument,
} from "@flashcard-master/core";
import { createLLMAdapter, DocumentExportService } from "@flashcard-master/adapters";
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  GenerationTaskPayload,
  SyncTaskPayload,
  ExportTaskPayload,
} from "./task-types.js";

if (parentPort) {
  let isAborted = false;
  let currentJobId = "";

  // Ack resolver maps
  let cardAckResolver: ((val: any) => void) | null = null;
  let syncAckResolver: ((val: any) => void) | null = null;

  parentPort.on("message", async (msg: WorkerInboundMessage) => {
    if (msg.action === "ABORT_TASK") {
      isAborted = true;
      return;
    }

    if (msg.action === "COMMIT_CARDS_ACK") {
      if (cardAckResolver) {
        cardAckResolver(msg);
        cardAckResolver = null;
      }
      return;
    }

    if (msg.action === "COMMIT_SYNC_ACK") {
      if (syncAckResolver) {
        syncAckResolver(msg);
        syncAckResolver = null;
      }
      return;
    }

    if (msg.action === "START_TASK") {
      isAborted = false;
      currentJobId = msg.jobId;

      try {
        if (msg.task.type === "generation") {
          await executeGeneration(msg.jobId, msg.task.payload);
        } else if (msg.task.type === "sync_all" || msg.task.type === "sync_source") {
          await executeSync(msg.jobId, msg.task.payload);
        } else if (msg.task.type === "export") {
          await executeExport(msg.jobId, msg.task.payload);
        }
      } catch (err: any) {
        postMessage({
          type: "TASK_ERROR",
          jobId: msg.jobId,
          error: err.message || "Unknown error in worker thread",
          stack: err.stack,
        });
      }
    }
  });

  function postMessage(msg: WorkerOutboundMessage) {
    if (parentPort) {
      parentPort.postMessage(msg);
    }
  }

  async function executeGeneration(jobId: string, payload: GenerationTaskPayload) {
    const {
      documents,
      provider,
      model,
      apiKey,
      endpoint,
      persona = "socratic-mentor",
      difficulty = "intermediate",
      depthMode = "atomic",
      chunkMultiplier = 1,
      fullDocument = false,
      limit = 5,
      targetDeckOverride,
      enforceGrounding = true,
    } = payload;

    const personaStudio = new PersonaStudioService();
    const promptBuilder = new PromptBuilder(personaStudio);
    const groundingGuard = new GroundingGuard();

    const llm = createLLMAdapter({
      provider: provider as any,
      model,
      apiKey,
      baseUrl: endpoint,
    });

    const genService = new CardGenerationService(
      llm,
      undefined,
      promptBuilder,
      groundingGuard
    );

    const totalDocs = documents.length;
    let totalDrafts = 0;
    let totalCardsCommitted = 0;
    let totalDuplicatesSkipped = 0;
    let successfulDocsCount = 0;
    let failedDocsCount = 0;

    postMessage({
      type: "STEP_LOG",
      jobId,
      stepNumber: 0,
      stepTitle: "Initialization",
      level: "info",
      message: `Worker initialized for ${totalDocs} document(s) using ${provider} (${model || "default"})`,
    });

    for (let i = 0; i < totalDocs; i++) {
      if (isAborted) {
        throw new Error("Task cancelled by user");
      }

      const doc = documents[i];
      const stepNumber = i + 1;
      const stepTitle = `Document ${stepNumber}/${totalDocs}: ${doc.title}`;

      postMessage({
        type: "STEP_PROGRESS",
        jobId,
        currentStep: stepNumber,
        totalSteps: totalDocs,
        stepName: stepTitle,
      });

      postMessage({
        type: "STEP_LOG",
        jobId,
        stepNumber,
        stepTitle,
        level: "info",
        message: `Analyzing and prompting LLM for "${doc.title}"...`,
      });

      try {
        const cleanDoc: CleanTextDocument = {
          id: doc.id,
          sourceId: doc.sourceId,
          title: doc.title,
          textContent: doc.textContent,
          originUrl: doc.originUrl,
          contentHash: "",
        };

        const drafts = await genService.generateFromDocument(cleanDoc, {
          difficulty,
          persona,
          depthMode,
          targetCountPerChunk: limit,
          chunkOptions: { chunkMultiplier, fullDocument },
          enforceGrounding,
        });

        totalDrafts += drafts.length;

        // Ask main thread to commit cards (dedup and persist)
        const ackPromise = new Promise<any>((resolve) => {
          cardAckResolver = resolve;
        });

        postMessage({
          type: "COMMIT_CARDS",
          jobId,
          stepNumber,
          stepTitle,
          targetDeck: targetDeckOverride || "Default",
          sourceId: doc.sourceId,
          documentTitle: doc.title,
          originUrl: doc.originUrl,
          persona: persona || "socratic-mentor",
          tags: (doc as any).tags || [],
          cards: drafts.map((d) => ({
            question: d.question,
            answer: d.answer,
            sourceQuote: d.sourceQuote,
            difficulty: d.difficulty,
          })),
        });

        const ack = await ackPromise;
        totalCardsCommitted += ack.createdCount || 0;
        totalDuplicatesSkipped += ack.duplicatesCount || 0;
        successfulDocsCount++;

        postMessage({
          type: "STEP_LOG",
          jobId,
          stepNumber,
          stepTitle,
          level: "success",
          message: `Successfully synthesized ${ack.createdCount} card(s) from "${doc.title}" (${ack.duplicatesCount} duplicate(s) filtered)`,
          details: {
            draftsCount: drafts.length,
            createdCount: ack.createdCount,
            duplicatesCount: ack.duplicatesCount,
          },
        });
      } catch (err: any) {
        failedDocsCount++;
        postMessage({
          type: "STEP_LOG",
          jobId,
          stepNumber,
          stepTitle,
          level: "error",
          message: `Generation error for "${doc.title}": ${err.message}`,
          details: { error: err.message },
        });
        // Fault-tolerant: proceed to next document in batch
      }
    }

    postMessage({
      type: "TASK_COMPLETE",
      jobId,
      resultSummary: {
        totalDocuments: totalDocs,
        successfulDocuments: successfulDocsCount,
        failedDocuments: failedDocsCount,
        totalDraftsGenerated: totalDrafts,
        cardsCreated: totalCardsCommitted,
        duplicatesSkipped: totalDuplicatesSkipped,
      },
    });
  }

  async function executeSync(jobId: string, payload: SyncTaskPayload) {
    const { sources } = payload;
    const totalSources = sources.length;
    let totalNewDocs = 0;
    let totalFetchedDocs = 0;

    postMessage({
      type: "STEP_LOG",
      jobId,
      stepNumber: 0,
      stepTitle: "Sync Pipeline",
      level: "info",
      message: `Starting background synchronization for ${totalSources} data source(s)`,
    });

    for (let i = 0; i < totalSources; i++) {
      if (isAborted) {
        throw new Error("Task cancelled by user");
      }

      const source = sources[i];
      const stepNumber = i + 1;
      const stepTitle = `Sync ${stepNumber}/${totalSources}: ${source.name}`;

      postMessage({
        type: "STEP_PROGRESS",
        jobId,
        currentStep: stepNumber,
        totalSteps: totalSources,
        stepName: stepTitle,
      });

      postMessage({
        type: "STEP_LOG",
        jobId,
        stepNumber,
        stepTitle,
        level: "info",
        message: `Syncing source "${source.name}" (${source.type}: ${source.uri})...`,
      });

      try {
        // In worker mode, we request the main thread to run source sync or deliver documents
        const ackPromise = new Promise<any>((resolve) => {
          syncAckResolver = resolve;
        });

        postMessage({
          type: "COMMIT_SYNC_RESULT",
          jobId,
          sourceId: source.id,
          stepNumber,
          documents: [],
        });

        const ack = await ackPromise;
        totalNewDocs += ack.newCount || 0;
        totalFetchedDocs += ack.totalFetched || 0;

        postMessage({
          type: "STEP_LOG",
          jobId,
          stepNumber,
          stepTitle,
          level: "success",
          message: `Synced "${source.name}": fetched ${ack.totalFetched || 0}, ${ack.newCount || 0} new documents`,
          details: ack,
        });
      } catch (err: any) {
        postMessage({
          type: "STEP_LOG",
          jobId,
          stepNumber,
          stepTitle,
          level: "warn",
          message: `Failed to sync "${source.name}": ${err.message}`,
        });
      }
    }

    postMessage({
      type: "TASK_COMPLETE",
      jobId,
      resultSummary: {
        totalSources,
        totalNewDocuments: totalNewDocs,
        totalFetchedDocuments: totalFetchedDocs,
        newCount: totalNewDocs,
        totalFetched: totalFetchedDocs,
      },
    });
  }

  async function executeExport(jobId: string, payload: ExportTaskPayload) {
    postMessage({
      type: "STEP_LOG",
      jobId,
      stepNumber: 1,
      stepTitle: "Exporting",
      level: "info",
      message: `Compiling export format "${payload.format}" (mode: ${payload.mode || "default"})...`,
    });

    if (payload.exportKind === "documents" && payload.documents && payload.documents.length > 0) {
      const exportService = new DocumentExportService();
      const result = await exportService.export(payload.documents, {
        format: payload.format as any,
        mode: payload.mode as any,
        sourceName: payload.sourceName,
        includeTableOfContents: true,
        includeCitations: true,
      });

      const sizeBytes = typeof result.content === "string" ? Buffer.byteLength(result.content) : result.content.byteLength;

      postMessage({
        type: "STEP_LOG",
        jobId,
        stepNumber: 1,
        stepTitle: "Exporting",
        level: "success",
        message: `Successfully compiled ${result.filename} (${sizeBytes} bytes, ${result.documentCount} docs)`,
      });

      postMessage({
        type: "TASK_COMPLETE",
        jobId,
        resultSummary: {
          filename: result.filename,
          sizeBytes,
          documentCount: result.documentCount,
        },
      });
    } else {
      postMessage({
        type: "TASK_COMPLETE",
        jobId,
        resultSummary: { format: payload.format, success: true },
      });
    }
  }
}
