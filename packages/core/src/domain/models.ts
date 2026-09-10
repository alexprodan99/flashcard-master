import { z } from "zod";

export const DataSourceTypeSchema = z.enum(["rss", "web", "local", "sitemap", "llms-txt", "notion"]);
export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;

export const DataSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: DataSourceTypeSchema,
  uri: z.string().min(1),
  targetDeck: z.string().default("Default"),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

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
  difficulty: DifficultyLevelSchema.default("intermediate"),
  personaUsed: z.string().default("socratic-mentor"),
  targetDeck: z.string().default("Default"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export interface RawDocument {
  id: string;
  sourceId: string;
  title: string;
  rawContent: string;
  originUrl?: string;
  publishedAt?: string;
  guid?: string;
}

export interface CleanTextDocument {
  id: string;
  sourceId: string;
  title: string;
  textContent: string;
  rawContent?: string;
  originUrl?: string;
  contentHash: string;
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

export const JobLogLevelSchema = z.enum(["info", "warn", "error", "success"]);
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

