import { z } from "zod";
export declare const DataSourceTypeSchema: z.ZodEnum<["rss", "web", "local"]>;
export type DataSourceType = z.infer<typeof DataSourceTypeSchema>;
export declare const DataSourceSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["rss", "web", "local"]>;
    uri: z.ZodString;
    targetDeck: z.ZodDefault<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "rss" | "web" | "local";
    id: string;
    name: string;
    uri: string;
    targetDeck: string;
    tags: string[];
    isActive: boolean;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}, {
    type: "rss" | "web" | "local";
    id: string;
    name: string;
    uri: string;
    targetDeck?: string | undefined;
    tags?: string[] | undefined;
    isActive?: boolean | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export declare const SyncStateSchema: z.ZodObject<{
    sourceId: z.ZodString;
    lastSyncedAt: z.ZodString;
    lastGuid: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contentHash: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    itemCount: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sourceId: string;
    lastSyncedAt: string;
    itemCount: number;
    lastGuid?: string | null | undefined;
    contentHash?: string | null | undefined;
}, {
    sourceId: string;
    lastSyncedAt: string;
    lastGuid?: string | null | undefined;
    contentHash?: string | null | undefined;
    itemCount?: number | undefined;
}>;
export type SyncState = z.infer<typeof SyncStateSchema>;
export declare const DifficultyLevelSchema: z.ZodEnum<["beginner", "intermediate", "expert"]>;
export type DifficultyLevel = z.infer<typeof DifficultyLevelSchema>;
export declare const PersonaTypeSchema: z.ZodEnum<["socratic-mentor", "strict-examiner", "executive-synthesizer"]>;
export type PersonaType = z.infer<typeof PersonaTypeSchema>;
export declare const FlashcardSchema: z.ZodObject<{
    id: z.ZodString;
    sourceId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    question: z.ZodString;
    answer: z.ZodString;
    sourceQuote: z.ZodString;
    sourceOriginUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    difficulty: z.ZodDefault<z.ZodEnum<["beginner", "intermediate", "expert"]>>;
    personaUsed: z.ZodDefault<z.ZodString>;
    targetDeck: z.ZodDefault<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    targetDeck: string;
    tags: string[];
    question: string;
    answer: string;
    sourceQuote: string;
    difficulty: "beginner" | "intermediate" | "expert";
    personaUsed: string;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    sourceId?: string | null | undefined;
    sourceOriginUrl?: string | null | undefined;
}, {
    id: string;
    question: string;
    answer: string;
    sourceQuote: string;
    targetDeck?: string | undefined;
    tags?: string[] | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    sourceId?: string | null | undefined;
    sourceOriginUrl?: string | null | undefined;
    difficulty?: "beginner" | "intermediate" | "expert" | undefined;
    personaUsed?: string | undefined;
}>;
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
    originUrl?: string;
    contentHash: string;
}
//# sourceMappingURL=models.d.ts.map