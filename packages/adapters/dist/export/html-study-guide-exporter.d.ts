import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";
export interface HtmlStudyGuideExporterOptions {
    title?: string;
    includeCitations?: boolean;
    includeFoldGuide?: boolean;
}
export declare class HtmlStudyGuideExporter implements ExporterPort {
    readonly format: "html";
    private escapeHtml;
    export(cards: Flashcard[], options?: ExportOptions & HtmlStudyGuideExporterOptions): Promise<ExportResult>;
}
//# sourceMappingURL=html-study-guide-exporter.d.ts.map