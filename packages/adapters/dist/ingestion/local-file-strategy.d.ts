import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
export declare class LocalFileStrategy implements IngestionStrategy {
    readonly type: "local";
    fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]>;
    private readFileAsDocument;
    private extractTitle;
    extractCleanText(raw: RawDocument): CleanTextDocument;
}
//# sourceMappingURL=local-file-strategy.d.ts.map