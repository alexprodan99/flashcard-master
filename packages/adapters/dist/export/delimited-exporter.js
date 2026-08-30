import fs from "node:fs";
import path from "node:path";
export class DelimitedExporter {
    format;
    delimiter;
    defaultIncludeHeaders;
    constructor(options = {}) {
        this.delimiter = options.delimiter ?? ",";
        this.format = options.formatName ?? (this.delimiter === "\t" ? "tsv" : "csv");
        this.defaultIncludeHeaders = options.includeHeaders ?? true;
    }
    escapeField(value) {
        if (value === null || value === undefined) {
            return "";
        }
        const str = String(value);
        // RFC 4180: If field contains delimiter, double quotes, or newlines, enclose in double quotes
        // and escape internal double quotes as ""
        const needsQuotes = str.includes(this.delimiter) ||
            str.includes('"') ||
            str.includes("\n") ||
            str.includes("\r");
        if (needsQuotes) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }
    async export(cards, options = {}) {
        const includeHeaders = options.includeHeaders ?? this.defaultIncludeHeaders;
        const rows = [];
        // Header row
        if (includeHeaders) {
            const headers = ["Front", "Back", "Tags", "Source Quote", "Difficulty", "Deck"];
            rows.push(headers.map((h) => this.escapeField(h)).join(this.delimiter));
        }
        // Data rows
        for (const card of cards) {
            const tagsStr = (card.tags || []).join("; ");
            const row = [
                card.question,
                card.answer,
                tagsStr,
                card.sourceQuote || "",
                card.difficulty,
                card.targetDeck,
            ];
            rows.push(row.map((val) => this.escapeField(val)).join(this.delimiter));
        }
        // RFC 4180 standard CRLF line breaks
        const outputContent = rows.join("\r\n");
        if (options.outputPath) {
            const targetDir = path.dirname(options.outputPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.writeFileSync(options.outputPath, outputContent, "utf8");
        }
        return {
            format: this.format,
            successCount: cards.length,
            outputPath: options.outputPath,
            data: outputContent,
            message: `Exported ${cards.length} cards to ${this.format.toUpperCase()} format.`,
        };
    }
}
export class CsvExporter extends DelimitedExporter {
    constructor(options = {}) {
        super({ ...options, delimiter: ",", formatName: "csv" });
    }
}
export class TsvExporter extends DelimitedExporter {
    constructor(options = {}) {
        super({ ...options, delimiter: "\t", formatName: "tsv" });
    }
}
//# sourceMappingURL=delimited-exporter.js.map