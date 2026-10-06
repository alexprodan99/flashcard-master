import fs from "node:fs";
import path from "node:path";
import { extractText, getMeta } from "unpdf";

export class ScannedDocumentError extends Error {
  constructor(message: string = "Document contains scanned images with no selectable text layer. OCR is not supported.") {
    super(message);
    this.name = "ScannedDocumentError";
  }
}

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfParseResult {
  title: string;
  text: string;
  pages: PdfPage[];
  totalPages: number;
  metadata?: Record<string, any>;
  wordCount: number;
}

export class PdfParser {
  async parse(buffer: Buffer | Uint8Array, filename?: string): Promise<PdfParseResult | null> {
    if (!buffer || buffer.length === 0) {
      console.warn("[PdfParser] Encountered empty or zero-byte PDF file.");
      return null;
    }

    try {
      const data = Buffer.isBuffer(buffer)
        ? new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
        : buffer instanceof Uint8Array
          ? new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
          : new Uint8Array(buffer);
      const extraction = await extractText(data, { mergePages: false });
      const totalPages = extraction.totalPages || 0;
      if (totalPages <= 0) {
        console.warn("[PdfParser] PDF has zero pages.");
        return null;
      }
      const rawPages = Array.isArray(extraction.text)
        ? extraction.text
        : typeof extraction.text === "string"
          ? [extraction.text]
          : [];

      // Calculate total alphanumeric characters across all extracted pages
      const combinedRawText = rawPages.join(" ");
      const totalAlphaChars = (combinedRawText.match(/[\p{L}\p{N}]/gu) || []).length;

      // Scanned PDF detection heuristic: require at least 20 alphanumeric chars per page
      if (totalPages > 0 && totalAlphaChars < 20 * totalPages) {
        throw new ScannedDocumentError(
          "Document contains scanned images with no selectable text layer. OCR is not supported."
        );
      }

      // Deduplicate recurring running headers, footers, and page numbers
      const cleanedPageTexts = this.deduplicateHeadersAndFooters(rawPages);

      const pages: PdfPage[] = cleanedPageTexts.map((text, idx) => ({
        pageNumber: idx + 1,
        text,
      }));

      // Generate merged text with page markers
      const textWithMarkers = pages
        .map((p) => `<!-- page: ${p.pageNumber} -->\n\n${p.text}`)
        .join("\n\n")
        .trim();

      // Extract metadata and title
      const meta = await getMeta(data).catch(() => null);
      const title = this.extractTitle(meta, cleanedPageTexts, filename);

      const words = cleanedPageTexts.join(" ").match(/\S+/g);
      const wordCount = words ? words.length : 0;

      return {
        title,
        text: textWithMarkers,
        pages,
        totalPages,
        metadata: meta?.info,
        wordCount,
      };
    } catch (err: any) {
      if (err instanceof ScannedDocumentError) {
        throw err;
      }
      console.warn(`[PdfParser] Failed to parse PDF: ${err.message}`);
      return null;
    }
  }

  async parseFile(filePath: string): Promise<PdfParseResult | null> {
    if (!fs.existsSync(filePath)) {
      console.warn(`[PdfParser] File does not exist: ${filePath}`);
      return null;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      return await this.parse(buffer, path.basename(filePath));
    } catch (err: any) {
      if (err instanceof ScannedDocumentError) {
        throw err;
      }
      console.warn(`[PdfParser] Error reading file ${filePath}: ${err.message}`);
      return null;
    }
  }

  private deduplicateHeadersAndFooters(rawPages: string[]): string[] {
    if (rawPages.length === 0) return [];

    const PAGE_NUM_REGEX = /^(?:(?:page|p\.)\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i;
    const DASHED_PAGE_REGEX = /^[-–—]\s*\d+\s*[-–—]$/;
    const BRACKETED_PAGE_REGEX = /^\[\s*\d+\s*\]$/;

    const isPageNumber = (line: string): boolean => {
      const trimmed = line.trim();
      return (
        PAGE_NUM_REGEX.test(trimmed) ||
        DASHED_PAGE_REGEX.test(trimmed) ||
        BRACKETED_PAGE_REGEX.test(trimmed)
      );
    };

    // Step 1: Split each page into lines and strip standalone page numbers at top/bottom
    const parsedPagesLines: string[][] = rawPages.map((pageText) => {
      const lines = pageText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Check first 2 lines for page numbers
      while (lines.length > 0 && isPageNumber(lines[0])) {
        lines.shift();
      }
      if (lines.length > 1 && isPageNumber(lines[1])) {
        lines.splice(1, 1);
      }

      // Check last 2 lines for page numbers
      while (lines.length > 0 && isPageNumber(lines[lines.length - 1])) {
        lines.pop();
      }
      if (lines.length > 1 && isPageNumber(lines[lines.length - 2])) {
        lines.splice(lines.length - 2, 1);
      }

      return lines;
    });

    if (rawPages.length < 2) {
      return parsedPagesLines.map((lines) => lines.join("\n\n").trim());
    }

    // Step 2: Detect recurring running headers (top line across multiple pages)
    const headerCandidates = new Map<string, number>();
    for (const lines of parsedPagesLines) {
      if (lines.length > 0) {
        const top = lines[0];
        if (top.length <= 150) {
          headerCandidates.set(top, (headerCandidates.get(top) || 0) + 1);
        }
      }
    }

    // Step 3: Detect recurring running footers (bottom line across multiple pages)
    const footerCandidates = new Map<string, number>();
    for (const lines of parsedPagesLines) {
      if (lines.length > 0) {
        const bottom = lines[lines.length - 1];
        if (bottom.length <= 150) {
          footerCandidates.set(bottom, (footerCandidates.get(bottom) || 0) + 1);
        }
      }
    }

    const recurringHeaders = new Set<string>();
    for (const [line, count] of headerCandidates.entries()) {
      if (count >= 2 && count >= parsedPagesLines.length * 0.4) {
        recurringHeaders.add(line);
      }
    }

    const recurringFooters = new Set<string>();
    for (const [line, count] of footerCandidates.entries()) {
      if (count >= 2 && count >= parsedPagesLines.length * 0.4) {
        recurringFooters.add(line);
      }
    }

    // Step 4: Remove recurring headers and footers from pages after their first appearance
    const seenHeaders = new Set<string>();
    const seenFooters = new Set<string>();

    return parsedPagesLines.map((lines) => {
      const filtered = [...lines];

      // Filter running header
      if (filtered.length > 0 && recurringHeaders.has(filtered[0])) {
        const header = filtered[0];
        if (seenHeaders.has(header)) {
          filtered.shift();
        } else {
          seenHeaders.add(header);
        }
      }

      // Filter running footer
      if (filtered.length > 0 && recurringFooters.has(filtered[filtered.length - 1])) {
        const footer = filtered[filtered.length - 1];
        if (seenFooters.has(footer)) {
          filtered.pop();
        } else {
          seenFooters.add(footer);
        }
      }

      return filtered.join("\n\n").trim();
    });
  }

  private extractTitle(
    meta: { info?: Record<string, any> } | null,
    cleanedPages: string[],
    filename?: string
  ): string {
    const metaTitle = meta?.info?.Title;
    if (metaTitle && typeof metaTitle === "string" && metaTitle.trim().length > 0) {
      const clean = metaTitle.trim();
      if (!/^(untitled|document\d*|pdf)$/i.test(clean)) {
        return clean;
      }
    }

    // Try first line of first page
    if (cleanedPages.length > 0 && cleanedPages[0]) {
      const firstLine = cleanedPages[0].split("\n")[0]?.trim();
      if (firstLine && firstLine.length > 0 && firstLine.length < 100) {
        return firstLine.replace(/^#+\s*/, "");
      }
    }

    if (filename) {
      const base = path.basename(filename, path.extname(filename));
      if (base && base.trim()) {
        return base.trim();
      }
    }

    return "Untitled PDF";
  }
}
