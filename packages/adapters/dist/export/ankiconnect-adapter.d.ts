import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";
export interface AnkiConnectOptions {
    endpointUrl?: string;
    timeoutMs?: number;
    apiKey?: string;
}
export interface AnkiConnectHealth {
    isOnline: boolean;
    version?: number;
    error?: string;
}
export interface AnkiConnectSyncResult {
    totalCards: number;
    addedCards: number;
    duplicateOrFailedCards: number;
    noteIds: Array<number | null>;
    error?: string;
}
export declare class AnkiConnectAdapter implements ExporterPort {
    readonly format: "ankiconnect";
    private readonly endpointUrl;
    private readonly timeoutMs;
    private readonly apiKey?;
    constructor(options?: AnkiConnectOptions);
    private escapeHtml;
    invoke<T = any>(action: string, params?: Record<string, any>): Promise<T>;
    checkHealth(): Promise<AnkiConnectHealth>;
    createDeck(deckName: string): Promise<number>;
    syncCards(cards: Flashcard[], options?: ExportOptions): Promise<AnkiConnectSyncResult>;
    export(cards: Flashcard[], options?: ExportOptions): Promise<ExportResult>;
}
//# sourceMappingURL=ankiconnect-adapter.d.ts.map