import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
export declare class FeedParsingError extends Error {
    readonly originalError?: unknown | undefined;
    constructor(message: string, originalError?: unknown | undefined);
}
export interface RssStrategyOptions {
    timeoutMs?: number;
    customFetch?: typeof fetch;
}
export declare function safeIsoDate(dateStr?: string): string | undefined;
export declare class RssIngestionStrategy implements IngestionStrategy {
    readonly type: "rss";
    private readonly parser;
    private readonly timeoutMs;
    private readonly fetchFn;
    constructor(options?: RssStrategyOptions);
    fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]>;
    parseXml(xmlText: string, sourceId: string, originUri?: string): RawDocument[];
    extractCleanText(raw: RawDocument): CleanTextDocument;
}
//# sourceMappingURL=rss-strategy.d.ts.map