import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
export interface WebReaderStrategyOptions {
    timeoutMs?: number;
    customFetch?: typeof fetch;
}
export declare class WebReaderStrategy implements IngestionStrategy {
    readonly type: "web";
    private readonly timeoutMs;
    private readonly fetchFn;
    constructor(options?: WebReaderStrategyOptions);
    fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]>;
    parseHtml(html: string, sourceId: string, originUrl: string): RawDocument | null;
    extractCleanText(raw: RawDocument): CleanTextDocument;
}
//# sourceMappingURL=web-reader-strategy.d.ts.map