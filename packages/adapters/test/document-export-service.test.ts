import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DocumentExportService } from "../src/export/document-export-service.js";
import type { DiscoveredDocument } from "@flashcard-master/core";
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("DocumentExportService", () => {
  let exporter: DocumentExportService;
  let tempDir: string;

  const mockDocs: DiscoveredDocument[] = [
    {
      id: "doc-1",
      sourceId: "src-1",
      title: "Introduction to TypeScript",
      url: "https://example.com/docs/intro",
      textContent: "TypeScript is a strongly typed programming language that builds on JavaScript.",
      wordCount: 10,
      createdAt: "2026-09-01T12:00:00Z",
    },
    {
      id: "doc-2",
      sourceId: "src-1",
      title: "Advanced Generics & Constraints [Deep-Dive]",
      url: "https://example.com/docs/generics",
      textContent: "Generics allow you to write flexible, reusable functions and classes.\n\nConstraint syntax uses the extends keyword.",
      wordCount: 15,
      createdAt: "2026-09-02T12:00:00Z",
    },
    {
      id: "doc-3",
      sourceId: "src-1",
      title: "Internal Notes",
      url: null,
      textContent: "Local draft notes without an origin URL.",
      wordCount: 7,
      createdAt: "2026-09-03T12:00:00Z",
    },
  ];

  beforeEach(async () => {
    exporter = new DocumentExportService();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fc-doc-export-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("Merged Mode", () => {
    it("exports merged Markdown with clickable Table of Contents and citations", async () => {
      const result = await exporter.export(mockDocs, {
        format: "markdown",
        mode: "merged",
        sourceName: "TypeScript Guide",
        includeTableOfContents: true,
        includeCitations: true,
      });

      expect(result.mimeType).toBe("text/markdown");
      expect(result.filename).toBe("typescript-guide-knowledge-base.md");
      expect(result.documentCount).toBe(3);

      const content = result.content as string;
      expect(content).toContain("# TypeScript Guide - Knowledge Base");
      expect(content).toContain("## 📑 Table of Contents");
      expect(content).toContain("1. [Introduction to TypeScript](#1-introduction-to-typescript)");
      expect(content).toContain("2. [Advanced Generics & Constraints \\[Deep-Dive\\]](#2-advanced-generics-constraints-deep-dive)");
      expect(content).toContain("## 1. Introduction to TypeScript");
      expect(content).toContain("🔗 **Source:** <https://example.com/docs/intro>");
      expect(content).toContain("📊 **Word Count:** 10 words");
      expect(content).toContain("TypeScript is a strongly typed programming language");
      expect(content).toContain("[↑ Back to Table of Contents](#table-of-contents)");
    });

    it("exports merged HTML with structured TOC, article cards and safe URL sanitization", async () => {
      const docsWithUntrustedUrl: DiscoveredDocument[] = [
        ...mockDocs,
        {
          id: "doc-xss",
          sourceId: "src-1",
          title: "Malicious <script>alert(1)</script>",
          url: "javascript:alert(document.cookie)",
          textContent: "Untrusted payload",
          wordCount: 2,
        },
      ];

      const result = await exporter.export(docsWithUntrustedUrl, {
        format: "html",
        mode: "merged",
        sourceName: "Safe HTML KB",
      });

      expect(result.mimeType).toBe("text/html");
      expect(result.filename).toBe("safe-html-kb-knowledge-base.html");
      expect(result.documentCount).toBe(4);

      const content = result.content as string;
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("Safe HTML KB");
      expect(content).toContain("<h2>📑 Table of Contents</h2>");
      expect(content).toContain('<a href="#doc-1">1. Introduction to TypeScript</a>');
      expect(content).toContain('<article class="doc-card" id="doc-1">');
      expect(content).toContain('href="https://example.com/docs/intro"');
      expect(content).not.toContain('href="javascript:alert');
      expect(content).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    });

    it("exports merged Plain Text with ASCII banners and dividers", async () => {
      const result = await exporter.export(mockDocs, {
        format: "txt",
        mode: "merged",
        sourceName: "ASCII Notes",
      });

      expect(result.mimeType).toBe("text/plain");
      expect(result.filename).toBe("ascii-notes-knowledge-base.txt");
      const content = result.content as string;
      expect(content).toContain("KNOWLEDGE BASE: ASCII NOTES");
      expect(content).toContain("TABLE OF CONTENTS:");
      expect(content).toContain("1. Introduction to TypeScript");
      expect(content).toContain("[DOCUMENT 1 OF 3] Introduction to TypeScript");
      expect(content).toContain("Source: https://example.com/docs/intro");
      expect(content).toContain("Word Count: 10 words");
    });

    it("exports merged JSON with structured document metadata and word counts", async () => {
      const result = await exporter.export(mockDocs, {
        format: "json",
        mode: "merged",
        sourceName: "JSON Feed",
      });

      expect(result.mimeType).toBe("application/json");
      expect(result.filename).toBe("json-feed-knowledge-base.json");

      const parsed = JSON.parse(result.content as string);
      expect(parsed.title).toBe("JSON Feed - Knowledge Base");
      expect(parsed.totalDocuments).toBe(3);
      expect(parsed.totalWordCount).toBe(32);
      expect(parsed.documents).toHaveLength(3);
      expect(parsed.documents[0].title).toBe("Introduction to TypeScript");
      expect(parsed.documents[0].url).toBe("https://example.com/docs/intro");
    });

    it("writes output directly to disk if outputPath is specified", async () => {
      const outPath = path.join(tempDir, "exported-docs.md");
      const result = await exporter.export(mockDocs, {
        format: "markdown",
        mode: "merged",
        outputPath: outPath,
      });

      expect(result.content).toBeDefined();
      const fileOnDisk = await fs.readFile(outPath, "utf-8");
      expect(fileOnDisk).toBe(result.content);
    });
  });

  describe("Split Mode (ZIP Archive)", () => {
    it("packages individual Markdown files with numbered slugs and README manifest inside a .zip archive", async () => {
      const result = await exporter.export(mockDocs, {
        format: "markdown",
        mode: "split",
        sourceName: "Archived Docs",
      });

      expect(result.mimeType).toBe("application/zip");
      expect(result.filename).toBe("archived-docs-documents-split.zip");
      expect(result.documentCount).toBe(3);
      expect(Buffer.isBuffer(result.content)).toBe(true);

      const zip = await JSZip.loadAsync(result.content as Buffer);
      expect(zip.file("README.md")).not.toBeNull();
      expect(zip.file("01-introduction-to-typescript.md")).not.toBeNull();
      expect(zip.file("02-advanced-generics-constraints-deep-dive.md")).not.toBeNull();
      expect(zip.file("03-internal-notes.md")).not.toBeNull();

      const doc1 = await zip.file("01-introduction-to-typescript.md")!.async("string");
      expect(doc1).toContain("# Introduction to TypeScript");
      expect(doc1).toContain("🔗 **Source:** <https://example.com/docs/intro>");
      expect(doc1).toContain("TypeScript is a strongly typed programming language");

      const readme = await zip.file("README.md")!.async("string");
      expect(readme).toContain("# Archived Docs - Knowledge Base Archive");
      expect(readme).toContain("1. **Introduction to TypeScript**");
    });

    it("packages individual HTML files inside a .zip archive", async () => {
      const result = await exporter.export(mockDocs, {
        format: "html",
        mode: "split",
        sourceName: "HTML Bundle",
      });

      const zip = await JSZip.loadAsync(result.content as Buffer);
      expect(zip.file("01-introduction-to-typescript.html")).not.toBeNull();
      const html1 = await zip.file("01-introduction-to-typescript.html")!.async("string");
      expect(html1).toContain("<!DOCTYPE html>");
      expect(html1).toContain("Introduction to TypeScript");
      expect(html1).toContain("https://example.com/docs/intro");
    });

    it("packages individual JSON files inside a .zip archive", async () => {
      const result = await exporter.export(mockDocs, {
        format: "json",
        mode: "split",
        sourceName: "JSON Bundle",
      });

      const zip = await JSZip.loadAsync(result.content as Buffer);
      expect(zip.file("01-introduction-to-typescript.json")).not.toBeNull();
      const json1 = await zip.file("01-introduction-to-typescript.json")!.async("string");
      const parsed = JSON.parse(json1);
      expect(parsed.title).toBe("Introduction to TypeScript");
      expect(parsed.wordCount).toBe(10);
    });
  });

  describe("Media Asset Pipeline (Offline Export)", () => {
    it("inlines local media as Base64 Data URLs and renders responsive <figure> in Standalone HTML", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });
      const asset = await mediaService.saveMedia(Buffer.from("png-raw-binary-bytes"), "image/png");

      const docWithMedia: DiscoveredDocument = {
        id: "doc-media-1",
        sourceId: "src-1",
        title: "System Architecture",
        url: "https://example.com/arch",
        textContent: `Here is the architecture:\n\n![System Diagram](/api/media/${asset.filename})\n\nAnd some concluding notes.`,
        wordCount: 12,
      };

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export([docWithMedia], {
        format: "html",
        mode: "merged",
        sourceName: "Architecture Doc",
      });

      expect(result.mimeType).toBe("text/html");
      const html = result.content as string;
      expect(html).toContain("data:image/png;base64,");
      expect(html).toContain('<figure class="doc-figure">');
      expect(html).toContain('<figcaption>System Diagram</figcaption>');
      expect(html).toContain('alt="System Diagram"');
      expect(html).not.toContain(`/api/media/${asset.filename}`);
    });

    it("leaves media URL unchanged in Standalone HTML if media file is missing", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });

      const docWithMissingMedia: DiscoveredDocument = {
        id: "doc-media-2",
        sourceId: "src-1",
        title: "Missing Media Doc",
        url: "https://example.com/missing",
        textContent: "![Missing Graphic](/api/media/nonexistent123.png)",
        wordCount: 5,
      };

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export([docWithMissingMedia], {
        format: "html",
        mode: "merged",
        sourceName: "Missing Doc",
      });

      const html = result.content as string;
      expect(html).toContain("/api/media/nonexistent123.png");
    });

    it("bundles referenced media into media/ folder in Split ZIP and rewrites links to ./media/<filename>", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });
      const asset1 = await mediaService.saveMedia(Buffer.from("image-1-bytes"), "image/png");
      const asset2 = await mediaService.saveMedia(Buffer.from("image-2-bytes"), "image/jpeg");

      const docsWithMedia: DiscoveredDocument[] = [
        {
          id: "doc-m1",
          sourceId: "src-1",
          title: "Article with PNG",
          textContent: `Content diagram:\n\n![Diagram](/api/media/${asset1.filename})`,
          wordCount: 5,
        },
        {
          id: "doc-m2",
          sourceId: "src-1",
          title: "Article with JPEG",
          textContent: `Photo figure:\n\n![Photo](/api/media/${asset2.filename})`,
          wordCount: 5,
        },
      ];

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export(docsWithMedia, {
        format: "markdown",
        mode: "split",
        sourceName: "Offline Knowledge Base",
      });

      const zip = await JSZip.loadAsync(result.content as Buffer);
      expect(zip.file(`media/${asset1.filename}`)).not.toBeNull();
      expect(zip.file(`media/${asset2.filename}`)).not.toBeNull();

      const img1Data = await zip.file(`media/${asset1.filename}`)!.async("nodebuffer");
      expect(img1Data).toEqual(Buffer.from("image-1-bytes"));

      const doc1Content = await zip.file("01-article-with-png.md")!.async("string");
      expect(doc1Content).toContain(`![Diagram](./media/${asset1.filename})`);
      expect(doc1Content).not.toContain(`/api/media/${asset1.filename}`);
    });
  });
});
