import { parentPort } from "node:worker_threads";
import crypto from "node:crypto";
import {
  CardGenerationService,
  PromptBuilder,
  GroundingGuard,
  PersonaStudioService,
  MediaService,
  DocumentSlicingEngine,
  type CleanTextDocument,
  type GeneratedCardDraft,
  type RawDocument,
  type DiscoveredDocument,
} from "@flashcard-master/core";
import {
  createLLMAdapter,
  DocumentExportService,
  LocalFileStrategy,
} from "@flashcard-master/adapters";
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
      timeoutMs,
    } = payload;

    const isLocalOpenAI = provider === "openai" && typeof endpoint === "string" && (endpoint.includes("localhost") || endpoint.includes("127.0.0.1") || endpoint.includes("::1"));

    // Fall back to environment variable if apiKey is omitted in worker task payload
    let resolvedKey = apiKey;
    if (!resolvedKey) {
      if (provider === "openai") resolvedKey = process.env.OPENAI_API_KEY;
      else if (provider === "anthropic") resolvedKey = process.env.ANTHROPIC_API_KEY;
      else if (provider === "gemini") resolvedKey = process.env.GEMINI_API_KEY;
    }

    if (["openai", "anthropic", "gemini"].includes(provider) && !resolvedKey && !isLocalOpenAI) {
      throw new Error(`No API key provided for ${provider}. Please configure credentials in Settings or provide a key.`);
    }

    const personaStudio = new PersonaStudioService();
    const promptBuilder = new PromptBuilder(personaStudio);
    const groundingGuard = new GroundingGuard();

    const llm = createLLMAdapter({
      provider: provider as any,
      model,
      apiKey: resolvedKey,
      baseUrl: endpoint,
      timeoutMs: typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : undefined,
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

      const cleanDoc: CleanTextDocument = {
        id: doc.id,
        sourceId: doc.sourceId,
        title: doc.title,
        textContent: doc.textContent,
        originUrl: doc.originUrl,
        contentHash: "",
        startPage: doc.startPage ?? null,
        endPage: doc.endPage ?? null,
      };

      let docCreatedCount = 0;
      let docDuplicatesCount = 0;
      let hasTokenLimitTruncation = false;

      try {
          const drafts = await genService.generateFromDocument(cleanDoc, {
            difficulty,
            persona,
            depthMode,
            targetCountPerChunk: limit,
            chunkOptions: { chunkMultiplier, fullDocument },
            enforceGrounding,
            onCardGenerated: async (d: GeneratedCardDraft) => {
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
                cards: [{
                  question: d.question,
                  answer: d.answer,
                  sourceQuote: d.sourceQuote,
                  citation: d.citation || d.sourceQuote,
                  difficulty: d.difficulty,
                  keywords: d.keywords || [],
                  sourceLocator: d.sourceLocator || "",
                }],
              });

              const ack = await ackPromise;
              docCreatedCount += ack.createdCount || 0;
              docDuplicatesCount += ack.duplicatesCount || 0;
              totalCardsCommitted += ack.createdCount || 0;
              totalDuplicatesSkipped += ack.duplicatesCount || 0;
            },
          });

          totalDrafts += drafts.length;
          successfulDocsCount++;

          if ((drafts as any).partial || (drafts as any).isPartial) {
            hasTokenLimitTruncation = true;
          }

          if (hasTokenLimitTruncation) {
            postMessage({
              type: "STEP_LOG",
              jobId,
              stepNumber,
              stepTitle,
              level: "warn",
              message: `Output token limit reached: partial output retained (${docCreatedCount} card(s) preserved for "${doc.title}")`,
              details: {
                partial: true,
                preservedCards: docCreatedCount,
                tokenLimitReached: true,
                draftsCount: drafts.length,
                duplicatesCount: docDuplicatesCount,
              },
            });
          } else {
            postMessage({
              type: "STEP_LOG",
              jobId,
              stepNumber,
              stepTitle,
              level: "success",
              message: `Successfully synthesized ${docCreatedCount} card(s) from "${doc.title}" (${docDuplicatesCount} duplicate(s) filtered)`,
              details: {
                draftsCount: drafts.length,
                createdCount: docCreatedCount,
                duplicatesCount: docDuplicatesCount,
              },
            });
          }
        } catch (err: any) {
          if (docCreatedCount > 0) {
            successfulDocsCount++;
            postMessage({
              type: "STEP_LOG",
              jobId,
              stepNumber,
              stepTitle,
              level: "warn",
              message: `Output token limit reached: partial output retained (${docCreatedCount} card(s) preserved for "${doc.title}"). Details: ${err.message}`,
              details: {
                partial: true,
                preservedCards: docCreatedCount,
                tokenLimitReached: true,
                error: err.message,
              },
            });
          } else {
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
          }
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

  function extractPageBounds(text: string): { startPage: number | null; endPage: number | null } {
    const pageMatches = Array.from(text.matchAll(/<!--\s*page:\s*(\d+)\s*-->/gi));
    if (pageMatches.length > 0) {
      let minPage: number | null = null;
      let maxPage: number | null = null;
      for (const m of pageMatches) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n)) {
          minPage = minPage === null ? n : Math.min(minPage, n);
          maxPage = maxPage === null ? n : Math.max(maxPage, n);
        }
      }
      if (minPage !== null && maxPage !== null) {
        return { startPage: minPage, endPage: maxPage };
      }
    }
    return { startPage: null, endPage: null };
  }

  async function executeSync(jobId: string, payload: SyncTaskPayload) {
    const { sources, slicing } = payload;
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

    const slicingEngine = new DocumentSlicingEngine();
    const localStrategy = new LocalFileStrategy();

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
        if (source.type === "local") {
          postMessage({
            type: "STEP_LOG",
            jobId,
            stepNumber,
            stepTitle,
            level: "info",
            message: `Parsing local files for "${source.name}" in background worker...`,
          });

          let rawDocs: RawDocument[] = [];
          try {
            rawDocs = await localStrategy.fetch(source);
          } catch (fetchErr: any) {
            postMessage({
              type: "STEP_LOG",
              jobId,
              stepNumber,
              stepTitle,
              level: "warn",
              message: `Format error or parsing failure while reading "${source.name}": ${fetchErr.message}`,
              details: { error: fetchErr.message },
            });
            rawDocs = [];
          }

          const isSlicingActive = Boolean(slicing && slicing.mode !== "none");
          const documentsToCommit: DiscoveredDocument[] = [];

          for (let docIdx = 0; docIdx < rawDocs.length; docIdx++) {
            if (isAborted) {
              throw new Error("Task cancelled by user");
            }

            const raw = rawDocs[docIdx];
            postMessage({
              type: "STEP_PROGRESS",
              jobId,
              currentStep: docIdx + 1,
              totalSteps: rawDocs.length,
              stepName: `Parsing: ${raw.title}`,
            });

            postMessage({
              type: "STEP_LOG",
              jobId,
              stepNumber,
              stepTitle,
              level: "info",
              message: `Extracting text and structure from "${raw.title}" (${docIdx + 1}/${rawDocs.length})...`,
            });

            let cleanDoc: CleanTextDocument;
            try {
              cleanDoc = localStrategy.extractCleanText(raw);
            } catch (cleanErr: any) {
              postMessage({
                type: "STEP_LOG",
                jobId,
                stepNumber,
                stepTitle,
                level: "warn",
                message: `Failed to extract clean text from "${raw.title}": ${cleanErr.message}`,
              });
              continue;
            }

            if (cleanDoc.startPage == null && cleanDoc.textContent) {
              const bounds = extractPageBounds(cleanDoc.textContent);
              if (bounds.startPage !== null) {
                cleanDoc.startPage = bounds.startPage;
                cleanDoc.endPage = bounds.endPage;
              }
            }

            const docUrl = cleanDoc.originUrl || raw.originUrl || `file://${source.uri}`;

            if (isSlicingActive) {
              postMessage({
                type: "STEP_LOG",
                jobId,
                stepNumber,
                stepTitle,
                level: "info",
                message: `Applying ${slicing!.mode} slicing to "${cleanDoc.title}"...`,
              });

              let slices: any[] = [];
              try {
                slices = slicingEngine.slice(
                  {
                    sourceId: source.id,
                    title: cleanDoc.title || "Untitled Document",
                    textContent: cleanDoc.textContent,
                    rawContent: raw.rawContent || cleanDoc.rawContent || null,
                    url: docUrl,
                    originUrl: docUrl,
                  },
                  slicing
                );
              } catch (sliceErr: any) {
                postMessage({
                  type: "STEP_LOG",
                  jobId,
                  stepNumber,
                  stepTitle,
                  level: "warn",
                  message: `Document slicing failed for "${cleanDoc.title}": ${sliceErr.message}`,
                });
                slices = [];
              }

              for (const slice of slices) {
                documentsToCommit.push({
                  id: slice.id,
                  sourceId: slice.sourceId,
                  title: slice.title,
                  url: slice.url ?? null,
                  textContent: slice.textContent,
                  rawContent: slice.rawContent || null,
                  contentHash: slice.contentHash,
                  wordCount: slice.wordCount,
                  startPage: slice.startPage ?? null,
                  endPage: slice.endPage ?? null,
                });
              }
            } else {
              const uniqueKey = docUrl || raw.guid || cleanDoc.title;
              const deterministicId = crypto
                .createHash("sha256")
                .update(`${source.id}:${uniqueKey}`)
                .digest("hex")
                .slice(0, 32);

              const wordCount = cleanDoc.textContent.trim()
                ? cleanDoc.textContent.trim().split(/\s+/).length
                : 0;

              documentsToCommit.push({
                id: deterministicId,
                sourceId: source.id,
                title: cleanDoc.title || "Untitled Document",
                url: docUrl,
                textContent: cleanDoc.textContent,
                rawContent: raw.rawContent || cleanDoc.rawContent || null,
                contentHash: cleanDoc.contentHash || null,
                wordCount,
                startPage: cleanDoc.startPage ?? null,
                endPage: cleanDoc.endPage ?? null,
              });
            }
          }

          // Send extracted documents to main thread custodian
          const ackPromise = new Promise<any>((resolve) => {
            syncAckResolver = resolve;
          });

          postMessage({
            type: "COMMIT_SYNC_RESULT",
            jobId,
            sourceId: source.id,
            stepNumber,
            stepTitle,
            documents: documentsToCommit,
            slicing,
          });

          const ack = await ackPromise;
          const newCount = ack.newCount ?? documentsToCommit.length;
          const totalFetched = ack.totalFetched ?? rawDocs.length;
          totalNewDocs += newCount;
          totalFetchedDocs += totalFetched;

          postMessage({
            type: "STEP_LOG",
            jobId,
            stepNumber,
            stepTitle,
            level: "success",
            message: `Synced "${source.name}": processed ${rawDocs.length} file(s), committed ${documentsToCommit.length} document record(s)`,
            details: { ...ack, documentsCount: documentsToCommit.length },
          });
        } else {
          // For non-local sources (e.g. RSS, web), delegate to custodial ingestion service
          const ackPromise = new Promise<any>((resolve) => {
            syncAckResolver = resolve;
          });

          postMessage({
            type: "COMMIT_SYNC_RESULT",
            jobId,
            sourceId: source.id,
            stepNumber,
            stepTitle,
            documents: undefined,
            slicing,
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
        }
      } catch (err: any) {
        if (err.message === "Task cancelled by user" || isAborted) {
          throw err;
        }
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
      const exportService = new DocumentExportService(new MediaService());
      const result = await exportService.export(payload.documents, {
        format: payload.format as any,
        mode: payload.mode as any,
        sourceName: payload.sourceName,
        includeTableOfContents: true,
        includeCitations: true,
        outputPath: payload.outputPath,
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
