import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState, MediaService } from "@flashcard-master/core";
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import crypto from "node:crypto";
import { DocxParser, UnsupportedDocumentError } from "./docx-parser.js";
import { PdfParser, ScannedDocumentError } from "./pdf-parser.js";
import { EpubParser, DrmProtectedEpubError, InvalidEpubError } from "./epub-parser.js";

export interface LocalFileStrategyOptions {
  mediaService?: MediaService;
}

export class LocalFileStrategy implements IngestionStrategy {
  readonly type = "local" as const;

  private docxParser = new DocxParser();
  private pdfParser = new PdfParser();
  private epubParser: EpubParser;

  constructor(options: LocalFileStrategyOptions = {}) {
    this.epubParser = new EpubParser({ mediaService: options.mediaService });
  }

  async fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]> {
    const targetPath = source.uri;
    const docs: RawDocument[] = [];

    if (!fs.existsSync(targetPath)) {
      console.warn(`[LocalFileStrategy] Path does not exist: ${targetPath}`);
      return [];
    }

    try {
      const stats = fs.statSync(targetPath);

      if (stats.isFile()) {
        const ext = path.extname(targetPath).toLowerCase();
        if (ext === ".doc") {
          throw new UnsupportedDocumentError(
            "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
          );
        }

        if (ext === ".epub") {
          const epubDocs = await this.readEpubAsDocuments(targetPath, source.id, stats);
          docs.push(...epubDocs);
        } else if ([".md", ".markdown", ".txt", ".pdf", ".docx"].includes(ext)) {
          const doc = await this.readFileAsDocument(targetPath, source.id, stats);
          if (doc) docs.push(doc);
        }
      } else if (stats.isDirectory()) {
        // Find all matching files in directory tree
        const pattern = "**/*.{md,markdown,txt,pdf,docx,epub}";
        const normalizedTarget = targetPath.replace(/\\/g, "/");
        const files = await fg(pattern, {
          cwd: normalizedTarget,
          absolute: true,
          caseSensitiveMatch: false,
          ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
          onlyFiles: true,
        });

        for (const filePath of files) {
          let fileStat: fs.Stats;
          try {
            fileStat = fs.statSync(filePath);
          } catch (statErr: any) {
            console.warn(`[LocalFileStrategy] Skipping unreadable file ${filePath}: ${statErr.message}`);
            continue;
          }

          try {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === ".epub") {
              const epubDocs = await this.readEpubAsDocuments(filePath, source.id, fileStat);
              docs.push(...epubDocs);
            } else {
              const doc = await this.readFileAsDocument(filePath, source.id, fileStat);
              if (doc) docs.push(doc);
            }
          } catch (docErr: any) {
            if (
              docErr instanceof UnsupportedDocumentError ||
              docErr instanceof ScannedDocumentError ||
              docErr instanceof DrmProtectedEpubError ||
              docErr instanceof InvalidEpubError
            ) {
              console.warn(`[LocalFileStrategy] Skipping file ${filePath}: ${docErr.message}`);
              continue;
            }
            console.warn(`[LocalFileStrategy] Error reading ${filePath}: ${docErr.message}`);
          }
        }
      }
    } catch (err: any) {
      if (
        err instanceof UnsupportedDocumentError ||
        err instanceof ScannedDocumentError ||
        err instanceof DrmProtectedEpubError ||
        err instanceof InvalidEpubError
      ) {
        throw err;
      }
      console.warn(`[LocalFileStrategy] Error reading local path ${targetPath}:`, err.message);
      return [];
    }

    return docs;
  }

  private async readFileAsDocument(
    filePath: string,
    sourceId: string,
    stats: fs.Stats
  ): Promise<RawDocument | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      let content = "";
      let title = "";

      if (ext === ".doc") {
        throw new UnsupportedDocumentError(
          "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
        );
      } else if (ext === ".docx") {
        const buffer = fs.readFileSync(filePath);
        const result = await this.docxParser.parse(buffer, path.basename(filePath));
        if (!result) return null;
        title = result.title;
        content = result.markdown;
      } else if (ext === ".pdf") {
        const buffer = fs.readFileSync(filePath);
        const result = await this.pdfParser.parse(buffer, path.basename(filePath));
        if (!result) return null;
        title = result.title;
        content = result.text;
      } else {
        content = fs.readFileSync(filePath, "utf8");
        title = this.extractTitle(content, filePath);
      }

      const normalizedPath = filePath.replace(/\\/g, "/");
      const docId = crypto
        .createHash("sha256")
        .update(`${sourceId}:${normalizedPath}`)
        .digest("hex")
        .slice(0, 32);

      return {
        id: docId,
        sourceId,
        title,
        rawContent: content,
        originUrl: `file://${normalizedPath}`,
        publishedAt: stats.mtime.toISOString(),
        guid: normalizedPath,
      };
    } catch (err: any) {
      if (err instanceof UnsupportedDocumentError || err instanceof ScannedDocumentError) {
        throw err;
      }
      console.warn(`[LocalFileStrategy] Failed to read file ${filePath}:`, err.message);
      return null;
    }
  }

  private async readEpubAsDocuments(
    filePath: string,
    sourceId: string,
    stats: fs.Stats
  ): Promise<RawDocument[]> {
    try {
      const result = await this.epubParser.parseFile(filePath);
      if (!result || result.chapters.length === 0) {
        return [];
      }

      const normalizedPath = filePath.replace(/\\/g, "/");
      const filename = path.basename(filePath);

      return result.chapters.map((chapter) => {
        const docId = crypto
          .createHash("sha256")
          .update(`${sourceId}:${normalizedPath}:${chapter.href || chapter.id}`)
          .digest("hex")
          .slice(0, 32);

        const displayTitle = chapter.title.startsWith(filename)
          ? chapter.title
          : `${filename} - ${chapter.title}`;

        return {
          id: docId,
          sourceId,
          title: displayTitle,
          rawContent: chapter.markdown,
          originUrl: `file://${normalizedPath}#${chapter.href}`,
          publishedAt: stats.mtime.toISOString(),
          guid: `${normalizedPath}#${chapter.href}`,
        };
      });
    } catch (err: any) {
      if (err instanceof DrmProtectedEpubError || err instanceof InvalidEpubError) {
        throw err;
      }
      console.warn(`[LocalFileStrategy] Failed to read EPUB ${filePath}:`, err.message);
      return [];
    }
  }

  private extractTitle(content: string, filePath: string): string {
    // 1. Try extracting YAML frontmatter title (e.g. title: "My Title" or title: My Title)
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      const titleMatch = yaml.match(/^title:\s*["']?(.*?)["']?$/m);
      if (titleMatch && titleMatch[1].trim().length > 0) {
        return titleMatch[1].trim();
      }
    }

    // 2. Try extracting first Markdown H1 header (# Title)
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1].trim().length > 0) {
      return h1Match[1].trim();
    }

    // 3. Fallback to filename without extension
    const base = path.basename(filePath, path.extname(filePath));
    return base || "Untitled Note";
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    let clean = raw.rawContent || "";

    // 1. Strip YAML frontmatter if present
    clean = clean.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

    // 2. Normalize line endings (\r\n -> \n)
    clean = clean.replace(/\r\n/g, "\n");

    // 3. Trim trailing whitespace on individual lines
    clean = clean
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");

    // 4. Collapse 3+ consecutive newlines to 2 newlines (\n\n)
    clean = clean.replace(/\n{3,}/g, "\n\n");

    // 5. Trim leading and trailing whitespace
    clean = clean.trim();

    // 6. Calculate SHA-256 hash
    const contentHash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");

    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: clean,
      rawContent: raw.rawContent,
      originUrl: raw.originUrl,
      contentHash,
    };
  }
}
