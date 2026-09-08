import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DocumentExportService } from "../src/export/document-export-service.js";
import { type DiscoveredDocument, MediaService } from "@flashcard-master/core";
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
    it("inlines optimized WebP media as Base64 Data URLs (data:image/webp;base64) in Standalone HTML", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });
      const validPngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
        0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      const asset = await mediaService.saveMedia(validPngBuffer, "image/png");

      expect(asset.filename.endsWith(".webp")).toBe(true);
      expect(asset.mimeType).toBe("image/webp");

      const docWithMedia: DiscoveredDocument = {
        id: "doc-media-webp",
        sourceId: "src-1",
        title: "Optimized Architecture",
        url: "https://example.com/arch",
        textContent: `Here is the architecture:\n\n![System Diagram](/api/media/${asset.filename})\n\nDone.`,
        wordCount: 10,
      };

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export([docWithMedia], {
        format: "html",
        mode: "merged",
        sourceName: "Optimized Doc",
      });

      expect(result.mimeType).toBe("text/html");
      const html = result.content as string;
      expect(html).toContain("data:image/webp;base64,");
      expect(html).toContain('<figcaption>System Diagram</figcaption>');
      expect(html).not.toContain(`/api/media/${asset.filename}`);
    });

    it("inlines compact e-reader WebP Base64 by default and downscales large images", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const sharp = (await import("sharp")).default;
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });

      // Generate a large 1000x800 image
      const largeBuffer = await sharp({
        create: {
          width: 1000,
          height: 800,
          channels: 3,
          background: { r: 60, g: 120, b: 240 },
        },
      })
        .jpeg()
        .toBuffer();

      const asset = await mediaService.saveMedia(largeBuffer, "image/jpeg");

      const doc: DiscoveredDocument = {
        id: "doc-large-img",
        sourceId: "src-1",
        title: "Large Image Doc",
        textContent: `![Architecture](/api/media/${asset.filename})`,
      };

      const mediaExporter = new DocumentExportService(mediaService);
      const compactResult = await mediaExporter.export([doc], {
        format: "html",
        mode: "merged",
        sourceName: "Compact Test",
        imageQuality: "compact",
      });

      const highResult = await mediaExporter.export([doc], {
        format: "html",
        mode: "merged",
        sourceName: "High Quality Test",
        imageQuality: "high",
      });

      const compactHtml = compactResult.content as string;
      const highHtml = highResult.content as string;

      expect(compactHtml).toContain("data:image/webp;base64,");
      expect(compactHtml.length).toBeLessThan(highHtml.length);
    });

    it("supports grayscale e-ink mode in standalone HTML export", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const sharp = (await import("sharp")).default;
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });

      const colorBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 100, b: 50 },
        },
      })
        .png()
        .toBuffer();

      const asset = await mediaService.saveMedia(colorBuffer, "image/png");

      const doc: DiscoveredDocument = {
        id: "doc-color-img",
        sourceId: "src-1",
        title: "Color Image Doc",
        textContent: `![Diagram](/api/media/${asset.filename})`,
      };

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export([doc], {
        format: "html",
        mode: "merged",
        sourceName: "Grayscale Test",
        grayscale: true,
      });

      const html = result.content as string;
      expect(html).toContain("data:image/webp;base64,");
      const match = html.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
      expect(match).not.toBeNull();

      const decoded = Buffer.from(match![1], "base64");
      const rawPixels = await sharp(decoded).raw().toBuffer();
      // Grayscale pixel check: R == G == B
      expect(rawPixels[0]).toBe(rawPixels[1]);
      expect(rawPixels[1]).toBe(rawPixels[2]);
    });

    it("preserves SVG vector diagrams verbatim without rasterization in standalone HTML export", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="purple"/></svg>`;
      const asset = await mediaService.saveMedia(Buffer.from(svgContent), "image/svg+xml");

      const doc: DiscoveredDocument = {
        id: "doc-svg",
        sourceId: "src-1",
        title: "SVG Architecture",
        textContent: `![Vector Flow](/api/media/${asset.filename})`,
      };

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export([doc], {
        format: "html",
        mode: "merged",
        sourceName: "SVG Export",
      });

      const html = result.content as string;
      expect(html).toContain("data:image/svg+xml;base64,");
      expect(html).not.toContain(`/api/media/${asset.filename}`);

      // Verify decoded base64 matches original svg string
      const match = html.match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/);
      expect(match).not.toBeNull();
      const decodedSvg = Buffer.from(match![1], "base64").toString("utf-8");
      expect(decodedSvg).toBe(svgContent);
    });

    it("inlines multi-image collections in parallel and achieves substantial compression", async () => {
      const { MediaService } = await import("@flashcard-master/core");
      const sharp = (await import("sharp")).default;
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });

      // Create 5 different synthetic images
      const filenames: string[] = [];
      for (let i = 0; i < 5; i++) {
        const buf = await sharp({
          create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: i * 40, g: 100 + i * 20, b: 200 - i * 30 },
          },
        })
          .jpeg()
          .toBuffer();
        const asset = await mediaService.saveMedia(buf, "image/jpeg");
        filenames.push(asset.filename);
      }

      const docs: DiscoveredDocument[] = filenames.map((fn, idx) => ({
        id: `doc-multi-${idx}`,
        sourceId: "src-1",
        title: `Document ${idx + 1}`,
        textContent: `Article paragraph content.\n\n![Diagram ${idx + 1}](/api/media/${fn})`,
        wordCount: 15,
      }));

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export(docs, {
        format: "html",
        mode: "merged",
        sourceName: "Multi-Image Batch",
        imageQuality: "compact",
      });

      const html = result.content as string;
      expect(result.documentCount).toBe(5);
      // All 5 images should be inlined as WebP
      expect(html).not.toContain("/api/media/");
      const webpMatches = html.match(/data:image\/webp;base64,/g);
      expect(webpMatches).toHaveLength(5);
    });

    it("inlines local media as Base64 Data URLs and renders responsive <figure> in Standalone HTML (fallback for raw buffer)", async () => {
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

  describe("EPUB Mode", () => {
    it("exports valid EPUB 3.0 container with uncompressed mimetype as first entry", async () => {
      const result = await exporter.export(mockDocs, {
        format: "epub",
        mode: "merged",
        sourceName: "TypeScript Guide & Patterns",
        includeTableOfContents: true,
        includeCitations: true,
      });

      expect(result.filename).toBe("typescript-guide-patterns-knowledge-base.epub");
      expect(result.mimeType).toBe("application/epub+zip");
      expect(result.documentCount).toBe(3);
      expect(Buffer.isBuffer(result.content)).toBe(true);

      const buffer = result.content as Buffer;

      // EPUB Standard invariant: The local header compressionMethod for the first file (mimetype) must be 0 (STORE)
      // In ZIP specification, bytes 8-9 in local file header represent the compression method
      const firstEntryCompression = buffer.readUInt16LE(8);
      expect(firstEntryCompression).toBe(0);

      // Verify mimetype starts right after the 30-byte local header + 8-byte filename "mimetype"
      const mimetypeRawContent = buffer.slice(38, 38 + "application/epub+zip".length).toString("utf-8");
      expect(mimetypeRawContent).toBe("application/epub+zip");

      // Load with JSZip to verify internal structure
      const zip = await JSZip.loadAsync(buffer);

      // Check mimetype entry
      const mimetypeFile = zip.file("mimetype");
      expect(mimetypeFile).not.toBeNull();
      const mimetypeText = await mimetypeFile!.async("string");
      expect(mimetypeText).toBe("application/epub+zip");

      // Check container.xml
      const containerFile = zip.file("META-INF/container.xml");
      expect(containerFile).not.toBeNull();
      const containerText = await containerFile!.async("string");
      expect(containerText).toContain('full-path="OEBPS/content.opf"');
      expect(containerText).toContain('media-type="application/oebps-package+xml"');

      // Check content.opf
      const opfFile = zip.file("OEBPS/content.opf");
      expect(opfFile).not.toBeNull();
      const opfText = await opfFile!.async("string");
      expect(opfText).toContain("<dc:title>TypeScript Guide &amp; Patterns</dc:title>");
      expect(opfText).toContain("<dc:identifier id=\"BookId\">urn:uuid:");
      expect(opfText).toContain('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />');
      expect(opfText).toContain('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />');
      expect(opfText).toContain('<item id="css" href="styles.css" media-type="text/css" />');
      expect(opfText).toContain('<item id="chapter_1" href="chapter_1.xhtml" media-type="application/xhtml+xml" />');
      expect(opfText).toContain('<item id="chapter_2" href="chapter_2.xhtml" media-type="application/xhtml+xml" />');
      expect(opfText).toContain('<item id="chapter_3" href="chapter_3.xhtml" media-type="application/xhtml+xml" />');
      expect(opfText).toContain('<itemref idref="chapter_1" />');
      expect(opfText).toContain('<itemref idref="chapter_2" />');
      expect(opfText).toContain('<itemref idref="chapter_3" />');

      // Check nav.xhtml
      const navFile = zip.file("OEBPS/nav.xhtml");
      expect(navFile).not.toBeNull();
      const navText = await navFile!.async("string");
      expect(navText).toContain('<nav epub:type="toc" id="toc">');
      expect(navText).toContain('<li><a href="chapter_1.xhtml">1. Introduction to TypeScript</a></li>');
      expect(navText).toContain('<li><a href="chapter_2.xhtml">2. Advanced Generics &amp; Constraints [Deep-Dive]</a></li>');

      // Check toc.ncx (EPUB 2 backward fallback)
      const ncxFile = zip.file("OEBPS/toc.ncx");
      expect(ncxFile).not.toBeNull();
      const ncxText = await ncxFile!.async("string");
      expect(ncxText).toContain("<ncx xmlns=");
      expect(ncxText).toContain('<content src="chapter_1.xhtml" />');

      // Check styles.css
      const cssFile = zip.file("OEBPS/styles.css");
      expect(cssFile).not.toBeNull();
      const cssText = await cssFile!.async("string");
      expect(cssText).toContain(".chapter-header");

      // Check chapter XHTML files
      const ch1File = zip.file("OEBPS/chapter_1.xhtml");
      expect(ch1File).not.toBeNull();
      const ch1Text = await ch1File!.async("string");
      expect(ch1Text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(ch1Text).toContain('<html xmlns="http://www.w3.org/1999/xhtml" lang="en">');
      expect(ch1Text).toContain('<h1 class="chapter-title">Introduction to TypeScript</h1>');
      expect(ch1Text).toContain('<p>TypeScript is a strongly typed programming language that builds on JavaScript.</p>');
      expect(ch1Text).toContain('https://example.com/docs/intro');

      // Check chapter 2 with special characters
      const ch2File = zip.file("OEBPS/chapter_2.xhtml");
      expect(ch2File).not.toBeNull();
      const ch2Text = await ch2File!.async("string");
      expect(ch2Text).toContain("Advanced Generics &amp; Constraints [Deep-Dive]");
    });

    it("handles empty document collections gracefully with placeholder chapter", async () => {
      const result = await exporter.export([], {
        format: "epub",
        sourceName: "Empty Collection",
      });

      expect(result.filename).toBe("empty-collection-knowledge-base.epub");
      expect(result.mimeType).toBe("application/epub+zip");
      expect(result.documentCount).toBe(0);

      const zip = await JSZip.loadAsync(result.content as Buffer);
      const ch1 = await zip.file("OEBPS/chapter_1.xhtml")!.async("string");
      expect(ch1).toContain("No documents found in this knowledge base collection");
    });

    it("embeds and localizes referenced media assets into OEBPS/images/", async () => {
      const mediaService = new MediaService({ mediaDir: path.join(tempDir, "media") });
      const asset1 = await mediaService.saveMedia(Buffer.from("image-1-bytes"), "image/webp");
      const asset2 = await mediaService.saveMedia(Buffer.from("image-2-bytes"), "image/png");

      const docsWithMedia: DiscoveredDocument[] = [
        {
          id: "doc-m1",
          sourceId: "src-1",
          title: "Architecture Diagrams",
          textContent: `Overview diagram:\n\n![Diagram](/api/media/${asset1.filename})\n\nSecondary chart:\n\n![Chart](/api/media/${asset2.filename})`,
          wordCount: 10,
        },
      ];

      const mediaExporter = new DocumentExportService(mediaService);
      const result = await mediaExporter.export(docsWithMedia, {
        format: "epub",
        sourceName: "Media Book",
      });

      const zip = await JSZip.loadAsync(result.content as Buffer);

      // Verify images packaged into OEBPS/images/
      expect(zip.file(`OEBPS/images/${asset1.filename}`)).not.toBeNull();
      expect(zip.file(`OEBPS/images/${asset2.filename}`)).not.toBeNull();

      // Verify chapter XHTML rewrites paths to relative images/
      const chapterContent = await zip.file("OEBPS/chapter_1.xhtml")!.async("string");
      expect(chapterContent).toContain(`<img src="images/${asset1.filename}" alt="Diagram" />`);
      expect(chapterContent).toContain(`<img src="images/${asset2.filename}" alt="Chart" />`);
      expect(chapterContent).not.toContain(`/api/media/${asset1.filename}`);

      // Verify content.opf manifest includes images
      const opfContent = await zip.file("OEBPS/content.opf")!.async("string");
      expect(opfContent).toContain(`href="images/${asset1.filename}" media-type="image/webp"`);
      expect(opfContent).toContain(`href="images/${asset2.filename}" media-type="image/png"`);
    });

    it("writes EPUB binary directly to disk when outputPath is specified", async () => {
      const outputPath = path.join(tempDir, "output", "handbook.epub");
      const result = await exporter.export(mockDocs, {
        format: "epub",
        sourceName: "Handbook",
        outputPath,
      });

      expect(result.filename).toBe("handbook-knowledge-base.epub");
      const exists = await fs.stat(outputPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const diskBytes = await fs.readFile(outputPath);
      expect(diskBytes.length).toBe((result.content as Buffer).length);
    });
  });
});

