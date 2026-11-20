import { z } from "zod";

export const DataSourceTypeSchema = z.enum([
  "rss",
  "web",
  "local",
  "sitemap",
  "llms-txt",
  "notion",
  "audio",
  "video",
  "youtube",
]);
export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

export const SttProviderSchema = z.enum(["openai", "gemini", "whisper-local"]);
export type SttProvider = z.infer<typeof SttProviderSchema>;

export const MediaExtractionModeSchema = z.enum(["subtitles", "stt", "auto"]);
export type MediaExtractionMode = z.infer<typeof MediaExtractionModeSchema>;

export const MediaSlicingOverrideSchema = z.enum(["inherit", "chapters", "timestamps", "none"]);
export type MediaSlicingOverride = z.infer<typeof MediaSlicingOverrideSchema>;

export const SourceSlicingModeSchema = z.enum(["outline", "budget", "timestamps", "chapters", "none"]);
export type SourceSlicingMode = z.infer<typeof SourceSlicingModeSchema>;

export const TimestampRangeSchema = z.object({
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  label: z.string().trim().optional(),
});
export type TimestampRange = z.infer<typeof TimestampRangeSchema>;

export const MediaSourceItemSchema = z.object({
  uri: z.string().trim().min(1),
  title: z.string().trim().optional(),
  extractionMode: MediaExtractionModeSchema.default("auto"),
  subtitlePath: z.string().trim().optional(),
  sttProvider: SttProviderSchema.optional(),
  timestampRanges: z.array(TimestampRangeSchema).optional(),
  slicingMode: MediaSlicingOverrideSchema.optional(),
  intervalMinutes: z.number().int().min(1).max(240).optional(),
});
export type MediaSourceItem = z.output<typeof MediaSourceItemSchema>;
export type MediaSourceItemInput = z.input<typeof MediaSourceItemSchema>;

/**
 * Parses a DataSource.uri payload into normalized MediaSourceItem entries.
 * Supports structured JSON item arrays/objects, legacy JSON string arrays,
 * newline-delimited lists, and comma/space-delimited HTTP(S) URLs.
 */
export function parseMediaSourceItems(rawUri: string): MediaSourceItem[] {
  if (!rawUri || typeof rawUri !== "string") {
    return [];
  }

  const trimmed = rawUri.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const items: MediaSourceItem[] = [];
        for (const entry of parsed) {
          if (typeof entry === "string") {
            const clean = entry.trim();
            if (clean) {
              items.push(MediaSourceItemSchema.parse({ uri: clean }));
            }
          } else if (entry && typeof entry === "object") {
            items.push(MediaSourceItemSchema.parse(entry));
          }
        }
        return items;
      }
      if (parsed && typeof parsed === "object") {
        return [MediaSourceItemSchema.parse(parsed)];
      }
    } catch {
      // Fall through to plain-string / multi-line parsing (e.g., filenames starting with '[')
    }
  }

  const items: MediaSourceItem[] = [];
  const lines = trimmed.split(/[\r\n]+/);
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;

    // Split multiple HTTP(S) URLs on a single line while preserving commas/spaces inside local file paths
    if (/https?:\/\//i.test(cleanLine)) {
      const pieces = cleanLine.split(/[\s,]+(?=https?:\/\/)/i);
      for (const piece of pieces) {
        const cleanPiece = piece.trim().replace(/^[<"']|[>"']$/g, "");
        if (cleanPiece) {
          items.push(MediaSourceItemSchema.parse({ uri: cleanPiece }));
        }
      }
    } else {
      items.push(MediaSourceItemSchema.parse({ uri: cleanLine }));
    }
  }

  return items;
}

export const DataSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: DataSourceTypeSchema,
  uri: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  defaultSlicingMode: SourceSlicingModeSchema.nullable().optional(),
  defaultIntervalMinutes: z.number().int().min(1).max(240).nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

export const SyncModeSchema = z.enum(["new-only", "full"]);
export type SyncMode = z.infer<typeof SyncModeSchema>;

export const SyncStateSchema = z.object({
  sourceId: z.string().uuid(),
  lastSyncedAt: z.string().datetime(),
  lastGuid: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  itemCount: z.number().int().nonnegative().default(0),
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export const DifficultyLevelSchema = z.enum(["beginner", "intermediate", "expert", "mixed"]);
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;

export const PersonaTypeSchema = z.enum(["socratic-mentor", "strict-examiner", "executive-synthesizer"]);
export type PersonaType = z.infer<typeof PersonaTypeSchema>;

export const CardDepthModeSchema = z.enum(["atomic", "deep-dive", "scenario"]);
export type CardDepthMode = z.infer<typeof CardDepthModeSchema>;

export const PersonaDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  systemPrompt: z.string().min(10),
  isBuiltIn: z.boolean().default(false),
});
export type PersonaDefinition = z.infer<typeof PersonaDefinitionSchema>;

export const FlashcardSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid().nullable().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
  sourceQuote: z.string().min(1),
  sourceOriginUrl: z.string().nullable().optional(),
  documentTitle: z.string().nullable().optional(),
  keywords: z.array(z.string().trim()).default([]),
  sourceLocator: z.string().trim().default(""),
  difficulty: DifficultyLevelSchema.default("intermediate"),
  personaUsed: z.string().default("socratic-mentor"),
  targetDeck: z.string().default("Default"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export const CardGenerationDraftSchema = z.object({
  question: z
    .string()
    .trim()
    .min(5)
    .describe("Clear, self-contained, atomic prompt or question focusing on a single core concept."),
  answer: z
    .string()
    .trim()
    .min(1)
    .describe("Comprehensive, factually accurate answer directly addressing the question."),
  citation: z
    .string()
    .trim()
    .min(1)
    .describe("Exact verbatim excerpt quoted from the source text grounding this flashcard."),
  keywords: z
    .array(z.string().trim().min(1))
    .min(1)
    .describe("List of 2 to 5 atomic semantic keywords or key terms for rapid revision drills."),
  sourceLocator: z
    .string()
    .trim()
    .min(1)
    .describe("Document locator coordinate (e.g., section heading, page number, URI, or block ID) where the citation originates."),
  difficulty: DifficultyLevelSchema.optional().describe("Cognitive difficulty level: beginner, intermediate, expert, or mixed."),
});
export type CardGenerationDraftInput = z.input<typeof CardGenerationDraftSchema>;
export type CardGenerationDraftOutput = z.output<typeof CardGenerationDraftSchema>;

export interface RawDocument {
  id: string;
  sourceId: string;
  title: string;
  rawContent: string;
  originUrl?: string;
  publishedAt?: string;
  guid?: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  slicingHint?: {
    mode?: "chapters" | "timestamps" | "none";
    minutesPerChunk?: number;
  };
}

export interface CleanTextDocument {
  id: string;
  sourceId: string;
  title: string;
  textContent: string;
  rawContent?: string;
  originUrl?: string;
  contentHash: string;
  startPage?: number | null;
  endPage?: number | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  slicingHint?: {
    mode?: "chapters" | "timestamps" | "none";
    minutesPerChunk?: number;
  };
}

export const DiscoveredDocumentSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  title: z.string().min(1),
  url: z.string().nullable().optional(),
  textContent: z.string(),
  rawContent: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
  wordCount: z.number().int().nonnegative().default(0),
  startPage: z.number().int().nullable().optional(),
  endPage: z.number().int().nullable().optional(),
  startSeconds: z.number().int().nonnegative().nullable().optional(),
  endSeconds: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type DiscoveredDocument = z.input<typeof DiscoveredDocumentSchema>;

export const MediaAssetSchema = z.object({
  id: z.string(),
  filename: z.string().min(1),
  hash: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  url: z.string().min(1),
  path: z.string().optional(),
  createdAt: z.string().datetime().optional(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export interface MediaOptimizationOptions {
  optimizeWebp?: boolean;
  webpQuality?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export type ImageQuality = "compact" | "standard" | "high";

export interface CompactMediaOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  effort?: number;
  grayscale?: boolean;
}

export const JobTypeSchema = z.enum(["generation", "sync_all", "sync_source", "export"]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  title: z.string().min(1),
  totalSteps: z.number().int().nonnegative().default(1),
  currentStep: z.number().int().nonnegative().default(0),
  progressPercent: z.number().min(0).max(100).default(0),
  currentStepName: z.string().nullable().optional(),
  metadata: z.record(z.any()).default({}),
  resultSummary: z.record(z.any()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobLogLevelSchema = z.enum(["debug", "info", "warn", "error", "success"]);
export type JobLogLevel = z.infer<typeof JobLogLevelSchema>;

export const JobLogSchema = z.object({
  id: z.number().int().optional(),
  jobId: z.string(),
  stepNumber: z.number().int().nonnegative(),
  stepTitle: z.string().min(1),
  level: JobLogLevelSchema,
  message: z.string().min(1),
  details: z.record(z.any()).nullable().optional(),
  timestamp: z.string().optional(),
});
export type JobLog = z.infer<typeof JobLogSchema>;

export const SettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  updatedAt: z.string().optional(),
});
export type Setting = z.infer<typeof SettingSchema>;

export const SecretProviderSchema = z.enum(["openai", "anthropic", "gemini", "ollama", "notion"]);
export type SecretProvider = z.infer<typeof SecretProviderSchema>;

export const KeySourceSchema = z.enum(["database", "environment", "none"]);
export type KeySource = z.infer<typeof KeySourceSchema>;

export const ProviderKeyStatusSchema = z.object({
  provider: z.string(),
  isConfigured: z.boolean(),
  maskedValue: z.string(),
  source: KeySourceSchema,
  endpoint: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});
export type ProviderKeyStatus = z.infer<typeof ProviderKeyStatusSchema>;

export const ProviderVerificationResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  details: z.record(z.any()).optional(),
});
export type ProviderVerificationResult = z.infer<typeof ProviderVerificationResultSchema>;

export const SettingSourceSchema = z.enum(["database", "environment", "default"]);
export type SettingSource = z.infer<typeof SettingSourceSchema>;

export const LocalWhisperModelSchema = z.enum(["tiny", "base", "small", "medium", "large-v3"]);
export type LocalWhisperModel = z.infer<typeof LocalWhisperModelSchema>;

export const GeneralSettingsSchema = z.object({
  // Anki Desktop Integration
  ankiconnectUrl: z.string().default("http://127.0.0.1:8765"),
  ankiconnectApiKey: z.string().default(""),
  ankiconnectTimeoutMs: z.number().int().positive().default(3000),

  // AI Generation Defaults
  defaultAiProvider: z.string().default("ollama"),
  defaultAiModel: z.string().default("phi4-mini"),
  defaultPersona: z.string().default("socratic-mentor"),
  defaultDifficulty: DifficultyLevelSchema.default("intermediate"),
  defaultCardLimit: z.number().int().min(1).max(50).default(5),
  defaultGroundingEnforced: z.boolean().default(true),

  // Worker Pool & Task Processing
  maxGenerationWorkers: z.number().int().min(1).max(16).default(2),
  maxSyncWorkers: z.number().int().min(1).max(16).default(2),
  maxExportWorkers: z.number().int().min(1).max(16).default(2),
  workerTimeoutMinutes: z.number().int().min(0).max(120).default(15),

  // Slicing Defaults
  defaultSlicingMode: z.enum(["outline", "budget", "none"]).default("outline"),
  defaultPageBudget: z.number().int().min(1).max(100).default(10),

  // Speech-to-Text & Media Defaults
  defaultSttProvider: SttProviderSchema.default("openai"),
  localWhisperModel: LocalWhisperModelSchema.default("base"),
  localWhisperEndpoint: z.string().default(""),
  defaultSubtitleLanguage: z.string().default("en"),

  // EPUB Publishing Metadata
  epubDefaultAuthor: z.string().default("Flashcard Master"),
  epubDefaultPublisher: z.string().default("Flashcard Master Studio"),
});
export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

export const GeneralSettingsResponseSchema = z.object({
  settings: GeneralSettingsSchema,
  sources: z.record(z.string(), SettingSourceSchema),
  maskedApiKey: z.string(),
});
export type GeneralSettingsResponse = z.infer<typeof GeneralSettingsResponseSchema>;


