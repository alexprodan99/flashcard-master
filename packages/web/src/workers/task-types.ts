import type {
  JobType,
  JobLogLevel,
  DifficultyLevel,
  PersonaType,
  CardDepthMode,
  CleanTextDocument,
  DiscoveredDocument,
  DataSource,
  Flashcard,
} from "@flashcard-master/core";

// =======================================================
// TASK PAYLOADS (Main Thread -> Worker)
// =======================================================

export interface GenerationTaskPayload {
  documents: Array<{
    id: string;
    sourceId: string;
    title: string;
    textContent: string;
    originUrl?: string;
  }>;
  provider: string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  persona?: PersonaType;
  difficulty?: DifficultyLevel;
  depthMode?: CardDepthMode;
  chunkMultiplier?: number;
  fullDocument?: boolean;
  limit?: number;
  targetDeckOverride?: string;
  enforceGrounding?: boolean;
}

export interface SyncTaskPayload {
  sources: DataSource[];
}

export interface ExportTaskPayload {
  exportKind: "documents" | "cards";
  format: string;
  mode?: "merged" | "split";
  sourceName?: string;
  documents?: DiscoveredDocument[];
  cards?: Flashcard[];
  outputPath?: string;
}

export type TaskPayload =
  | { type: "generation"; payload: GenerationTaskPayload }
  | { type: "sync_all" | "sync_source"; payload: SyncTaskPayload }
  | { type: "export"; payload: ExportTaskPayload };

// =======================================================
// IPC MESSAGES: MAIN THREAD -> WORKER
// =======================================================

export type WorkerInboundMessage =
  | {
      action: "START_TASK";
      jobId: string;
      task: TaskPayload;
    }
  | {
      action: "ABORT_TASK";
      jobId: string;
    }
  | {
      action: "COMMIT_CARDS_ACK";
      jobId: string;
      stepNumber: number;
      createdCount: number;
      duplicatesCount: number;
      totalUnique: number;
    }
  | {
      action: "COMMIT_SYNC_ACK";
      jobId: string;
      sourceId: string;
      newCount: number;
      totalFetched: number;
    };

// =======================================================
// IPC MESSAGES: WORKER -> MAIN THREAD
// =======================================================

export interface GeneratedCardDraftPayload {
  question: string;
  answer: string;
  sourceQuote: string;
  difficulty: DifficultyLevel;
}

export type WorkerOutboundMessage =
  | {
      type: "STEP_PROGRESS";
      jobId: string;
      currentStep: number;
      totalSteps: number;
      stepName?: string;
    }
  | {
      type: "STEP_LOG";
      jobId: string;
      stepNumber: number;
      stepTitle: string;
      level: JobLogLevel;
      message: string;
      details?: Record<string, any>;
    }
  | {
      type: "COMMIT_CARDS";
      jobId: string;
      stepNumber: number;
      stepTitle: string;
      targetDeck: string;
      sourceId?: string;
      documentTitle?: string;
      originUrl?: string;
      cards: GeneratedCardDraftPayload[];
      persona?: string;
      tags?: string[];
    }
  | {
      type: "COMMIT_SYNC_RESULT";
      jobId: string;
      sourceId: string;
      stepNumber: number;
      documents: Array<{
        title: string;
        url?: string;
        textContent: string;
        contentHash: string;
        wordCount: number;
      }>;
    }
  | {
      type: "TASK_COMPLETE";
      jobId: string;
      resultSummary: Record<string, any>;
    }
  | {
      type: "TASK_ERROR";
      jobId: string;
      error: string;
      stack?: string;
    };
