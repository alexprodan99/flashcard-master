import type Database from "better-sqlite3";
import { z } from "zod";
import { DataSource, DataSourceType } from "../domain/models.js";
export declare const CreateSourceInputSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["rss", "web", "local"]>;
    uri: z.ZodString;
    targetDeck: z.ZodDefault<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "rss" | "web" | "local";
    name: string;
    uri: string;
    targetDeck: string;
    tags: string[];
    isActive: boolean;
}, {
    type: "rss" | "web" | "local";
    name: string;
    uri: string;
    targetDeck?: string | undefined;
    tags?: string[] | undefined;
    isActive?: boolean | undefined;
}>;
export type CreateSourceInput = z.infer<typeof CreateSourceInputSchema>;
export declare const UpdateSourceInputSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["rss", "web", "local"]>>;
    uri: z.ZodOptional<z.ZodString>;
    targetDeck: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type?: "rss" | "web" | "local" | undefined;
    name?: string | undefined;
    uri?: string | undefined;
    targetDeck?: string | undefined;
    tags?: string[] | undefined;
    isActive?: boolean | undefined;
}, {
    type?: "rss" | "web" | "local" | undefined;
    name?: string | undefined;
    uri?: string | undefined;
    targetDeck?: string | undefined;
    tags?: string[] | undefined;
    isActive?: boolean | undefined;
}>;
export type UpdateSourceInput = z.infer<typeof UpdateSourceInputSchema>;
export declare class DataSourceRepository {
    private readonly db;
    constructor(db: Database.Database);
    private mapRowToDataSource;
    create(rawInput: CreateSourceInput): DataSource;
    getById(id: string): DataSource | null;
    list(filter?: {
        isActive?: boolean;
        type?: DataSourceType;
    }): DataSource[];
    update(id: string, rawInput: UpdateSourceInput): DataSource | null;
    delete(id: string): boolean;
    toggleActive(id: string): DataSource | null;
}
//# sourceMappingURL=source-repository.d.ts.map