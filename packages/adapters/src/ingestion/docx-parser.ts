import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { htmlToCleanText } from "../utils/html-cleaner.js";

export class UnsupportedDocumentError extends Error {
  constructor(message: string = "Legacy binary .doc is not supported. Please convert to .docx or .pdf") {
    super(message);
    this.name = "UnsupportedDocumentError";
  }
}

export interface DocxParseResult {
  title: string;
  markdown: string;
  wordCount: number;
}

export function isLegacyDocBuffer(buffer: Buffer | Uint8Array): boolean {
  if (!buffer || buffer.length < 4) return false;
  return (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  );
}

export function isLegacyDocFile(filename?: string): boolean {
  if (!filename) return false;
  return /\.doc$/i.test(filename.trim());
}

export class DocxParser {
  async parse(buffer: Buffer | Uint8Array, filename?: string): Promise<DocxParseResult | null> {
    if (isLegacyDocFile(filename) || isLegacyDocBuffer(buffer)) {
      throw new UnsupportedDocumentError(
        "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
      );
    }

    if (!buffer || buffer.length === 0) {
      console.warn("[DocxParser] Encountered empty or zero-byte DOCX file.");
      return null;
    }

    try {
      const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const result = await mammoth.convertToHtml({ buffer: nodeBuffer });
      const html = result.value || "";
      const markdown = htmlToCleanText(html, undefined, { preserveInlineFormatting: true });
      const title = this.extractTitle(markdown, filename);
      const words = markdown.trim().match(/\S+/g);
      const wordCount = words ? words.length : 0;

      return {
        title,
        markdown,
        wordCount,
      };
    } catch (err: any) {
      if (err instanceof UnsupportedDocumentError) {
        throw err;
      }
      console.warn(`[DocxParser] Failed to parse DOCX: ${err.message}`);
      return null;
    }
  }

  async parseFile(filePath: string): Promise<DocxParseResult | null> {
    const filename = path.basename(filePath);
    if (isLegacyDocFile(filename)) {
      throw new UnsupportedDocumentError(
        "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
      );
    }

    if (!fs.existsSync(filePath)) {
      console.warn(`[DocxParser] File does not exist: ${filePath}`);
      return null;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      return await this.parse(buffer, filename);
    } catch (err: any) {
      if (err instanceof UnsupportedDocumentError) {
        throw err;
      }
      console.warn(`[DocxParser] Error reading file ${filePath}: ${err.message}`);
      return null;
    }
  }

  private extractTitle(markdown: string, filename?: string): string {
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1].trim()) {
      return h1Match[1].trim();
    }

    if (filename) {
      const base = path.basename(filename, path.extname(filename));
      if (base && base.trim()) {
        return base.trim();
      }
    }

    return "Untitled Document";
  }
}
