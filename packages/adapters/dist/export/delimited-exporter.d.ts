import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";
export interface DelimitedExporterOptions {
    delimiter?: string;
    includeHeaders?: boolean;
    formatName?: string;
}
export declare class DelimitedExporter implements ExporterPort {
    readonly format: string;
    private readonly delimiter;
    private readonly defaultIncludeHeaders;
    constructor(options?: DelimitedExporterOptions);
    private escapeField;
    export(cards: Flashcard[], options?: ExportOptions & {
        includeHeaders?: boolean;
    }): Promise<ExportResult>;
}
export declare class CsvExporter extends DelimitedExporter {
    constructor(options?: Omit<DelimitedExporterOptions, "delimiter" | "formatName">);
}
export declare class TsvExporter extends DelimitedExporter {
    constructor(options?: Omit<DelimitedExporterOptions, "delimiter" | "formatName">);
}
//# sourceMappingURL=delimited-exporter.d.ts.map