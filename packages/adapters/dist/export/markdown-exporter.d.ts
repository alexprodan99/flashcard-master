import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";
export interface MarkdownExporterOptions {
    title?: string;
    includeFrontmatter?: boolean;
    includeCitations?: boolean;
    includeBadges?: boolean;
}
export declare class MarkdownExporter implements ExporterPort {
    readonly format: "markdown";
    private formatBlockquote;
    export(cards: Flashcard[], options?: ExportOptions & MarkdownExporterOptions): Promise<ExportResult>;
}
//# sourceMappingURL=markdown-exporter.d.ts.map