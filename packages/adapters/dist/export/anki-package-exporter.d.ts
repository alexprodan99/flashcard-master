import type { Flashcard } from "@flashcard-master/core";
import type { ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";
export declare class AnkiPackageExporter implements ExporterPort {
    readonly format: "apkg";
    private computeFieldChecksum;
    private escapeHtml;
    export(cards: Flashcard[], options?: ExportOptions): Promise<ExportResult>;
}
//# sourceMappingURL=anki-package-exporter.d.ts.map