export interface TextChunkerOptions {
    maxChunkSize?: number;
    overlapSize?: number;
}
export declare class TextChunker {
    private readonly defaultMaxChunkSize;
    private readonly defaultOverlapSize;
    constructor(options?: TextChunkerOptions);
    chunkText(text: string, options?: TextChunkerOptions): string[];
    private splitBySentences;
}
//# sourceMappingURL=text-chunker.d.ts.map