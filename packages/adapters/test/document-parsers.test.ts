import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DocxParser,
  PdfParser,
  LocalFileStrategy,
  UnsupportedDocumentError,
  ScannedDocumentError,
} from "../src/index.js";
import {
  createMinimalPdf,
  createEmptyScannedPdf,
  createMultiPagePdf,
  createMinimalDocx,
  createLegacyDocBuffer,
  createCyrillicPdf,
} from "./fixtures-helper.js";
import type { DataSource } from "@flashcard-master/core";

describe("Document Parsers (Story 17.2)", () => {
  let tempDir: string;
  const docxParser = new DocxParser();
  const pdfParser = new PdfParser();
  const localStrategy = new LocalFileStrategy();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-parsers-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {}
    }
  });

  describe("DocxParser", () => {
    it("converts DOCX headings and tables to structured Markdown", async () => {
      const docxBuffer = await createMinimalDocx({
        heading: "Chapter 1: Limits & Continuity",
        paragraph: "A function is continuous if the limit equals the value.",
        table: [
          ["Function", "Limit x->0", "Continuous?"],
          ["sin(x)/x", "1", "No (removable)"],
          ["cos(x)", "1", "Yes"],
        ],
      });

      const result = await docxParser.parse(docxBuffer, "Calculus.docx");
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Chapter 1: Limits & Continuity");
      expect(result!.markdown).toContain("# Chapter 1: Limits & Continuity");
      expect(result!.markdown).toContain("A function is continuous if the limit equals the value.");
      expect(result!.markdown).toContain("| Function | Limit x->0 | Continuous? |");
      expect(result!.markdown).toContain("| --- | --- | --- |");
      expect(result!.markdown).toContain("| sin(x)/x | 1 | No (removable) |");
      expect(result!.markdown).toContain("| cos(x) | 1 | Yes |");
      expect(result!.wordCount).toBeGreaterThan(10);
    });

    it("rejects legacy binary .doc file extension upfront", async () => {
      const dummyBuffer = Buffer.from("Not a real docx");
      await expect(docxParser.parse(dummyBuffer, "legacy.doc")).rejects.toThrow(
        UnsupportedDocumentError
      );
      await expect(docxParser.parse(dummyBuffer, "legacy.doc")).rejects.toThrow(
        "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
      );
    });

    it("rejects file with OLE magic bytes upfront even if named .docx", async () => {
      const oleBuffer = createLegacyDocBuffer();
      await expect(docxParser.parse(oleBuffer, "disguised.docx")).rejects.toThrow(
        UnsupportedDocumentError
      );
      await expect(docxParser.parse(oleBuffer, "disguised.docx")).rejects.toThrow(
        "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
      );
    });

    it("handles zero-byte or corrupt docx files safely without throwing unhandled exceptions", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const emptyResult = await docxParser.parse(emptyBuffer, "empty.docx");
      expect(emptyResult).toBeNull();

      const corruptBuffer = Buffer.from("PK corrupt zip content that terminates abruptly");
      const corruptResult = await docxParser.parse(corruptBuffer, "corrupt.docx");
      expect(corruptResult).toBeNull();
    });

    it("parses DOCX file directly from filesystem via parseFile", async () => {
      const docxBuf = await createMinimalDocx({
        heading: "Filesystem Note",
        paragraph: "Reading directly from disk path.",
      });
      const filePath = path.join(tempDir, "filesystem-test.docx");
      fs.writeFileSync(filePath, docxBuf);

      const result = await docxParser.parseFile(filePath);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Filesystem Note");
      expect(result!.markdown).toContain("# Filesystem Note");
      expect(result!.markdown).toContain("Reading directly from disk path.");

      // Non-existent file returns null
      const missing = await docxParser.parseFile(path.join(tempDir, "non-existent.docx"));
      expect(missing).toBeNull();
    });
  });

  describe("PdfParser", () => {
    it("extracts text and page metadata from standard text-based PDF", async () => {
      const pdfBuffer = createMinimalPdf(
        "Introduction to Database Systems. ACID properties ensure transaction reliability."
      );
      const result = await pdfParser.parse(pdfBuffer, "Database.pdf");

      expect(result).not.toBeNull();
      expect(result!.totalPages).toBe(1);
      expect(result!.text).toContain("<!-- page: 1 -->");
      expect(result!.text).toContain("Introduction to Database Systems. ACID properties ensure transaction reliability.");
      expect(result!.pages.length).toBe(1);
      expect(result!.pages[0].pageNumber).toBe(1);
      expect(result!.pages[0].text).toContain("Introduction to Database Systems");
    });

    it("detects zero-text or scanned image-only PDF and throws ScannedDocumentError", async () => {
      const scannedPdfBuffer = createEmptyScannedPdf(3);

      await expect(pdfParser.parse(scannedPdfBuffer, "scanned.pdf")).rejects.toThrow(
        ScannedDocumentError
      );
      await expect(pdfParser.parse(scannedPdfBuffer, "scanned.pdf")).rejects.toThrow(
        "Document contains scanned images with no selectable text layer. OCR is not supported."
      );
    });

    it("deduplicates recurring running headers, footers, and page numbers across pages", async () => {
      const multiPageBuffer = createMultiPagePdf([
        [
          "Distributed Systems Principles",
          "Chapter 1: RPC and Messaging",
          "Remote procedure calls abstract network communication across nodes.",
          "Page 1",
          "Confidential - Internal Use Only",
        ],
        [
          "Distributed Systems Principles",
          "Chapter 2: Idempotency",
          "Idempotent operations can be applied multiple times without altering the result.",
          "Page 2",
          "Confidential - Internal Use Only",
        ],
        [
          "Distributed Systems Principles",
          "Chapter 3: Consensus",
          "Paxos and Raft solve distributed consensus under network partition scenarios.",
          "Page 3",
          "Confidential - Internal Use Only",
        ],
      ]);

      const result = await pdfParser.parse(multiPageBuffer, "distributed-systems.pdf");
      expect(result).not.toBeNull();
      expect(result!.totalPages).toBe(3);

      // Page numbers ("Page 1", "Page 2", "Page 3") should be stripped
      expect(result!.text).not.toContain("Page 1");
      expect(result!.text).not.toContain("Page 2");
      expect(result!.text).not.toContain("Page 3");

      // Running header and footer should appear on page 1, but be stripped/deduplicated on pages 2 and 3
      const page2 = result!.pages[1].text;
      const page3 = result!.pages[2].text;

      expect(page2).toContain("Chapter 2: Idempotency");
      expect(page2).not.toContain("Distributed Systems Principles");
      expect(page2).not.toContain("Confidential - Internal Use Only");

      expect(page3).toContain("Chapter 3: Consensus");
      expect(page3).not.toContain("Distributed Systems Principles");
      expect(page3).not.toContain("Confidential - Internal Use Only");

      // Verify page markers are present
      expect(result!.text).toContain("<!-- page: 1 -->");
      expect(result!.text).toContain("<!-- page: 2 -->");
      expect(result!.text).toContain("<!-- page: 3 -->");
    });

    it("handles zero-byte or corrupt PDF files safely without throwing unhandled exceptions", async () => {
      const emptyBuffer = Buffer.alloc(0);
      const emptyResult = await pdfParser.parse(emptyBuffer, "empty.pdf");
      expect(emptyResult).toBeNull();

      const corruptBuffer = Buffer.from("%PDF-corrupted truncated binary stream");
      const corruptResult = await pdfParser.parse(corruptBuffer, "corrupt.pdf");
      expect(corruptResult).toBeNull();
    });

    it("parses PDF file directly from filesystem via parseFile", async () => {
      const pdfBuf = createMinimalPdf("File-based PDF content on filesystem.");
      const filePath = path.join(tempDir, "filesystem-test.pdf");
      fs.writeFileSync(filePath, pdfBuf);

      const result = await pdfParser.parseFile(filePath);
      expect(result).not.toBeNull();
      expect(result!.totalPages).toBe(1);
      expect(result!.text).toContain("File-based PDF content on filesystem.");

      // Non-existent file returns null
      const missing = await pdfParser.parseFile(path.join(tempDir, "non-existent.pdf"));
      expect(missing).toBeNull();
    });

    it("successfully parses non-Latin (Cyrillic) PDF text without triggering ScannedDocumentError", async () => {
      const cyrillicBuffer = createCyrillicPdf();
      const result = await pdfParser.parse(cyrillicBuffer, "russian-notes.pdf");

      expect(result).not.toBeNull();
      expect(result!.totalPages).toBe(1);
      expect(result!.wordCount).toBeGreaterThan(0);
      // Cyrillic characters are correctly detected as letters and not rejected as scanned image
      expect(result!.text).toContain("<!-- page: 1 -->");
    });

    it("extracts title from PDF metadata and does not confuse author with title", async () => {
      const pdfBuffer = createMinimalPdf(
        "Neal Ford, Rebecca Parsons\nBuilding Evolutionary Architectures\nChapter 1 text here.",
        {
          title: "Building Evolutionary Architectures",
          author: "Neal Ford, Rebecca Parsons, Patrick Kua",
        }
      );
      const result = await pdfParser.parse(pdfBuffer, "book.pdf");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Building Evolutionary Architectures");
      expect(result!.metadata?.Title).toBe("Building Evolutionary Architectures");
    });

    it("skips author lines ending in comma or ampersand when falling back to page 1 text", async () => {
      const pdfBuffer = createMultiPagePdf([
        [
          "Neal Ford,",
          "Rebecca Parsons,",
          "Patrick Kua & Pramod Sadalage",
          "Forewords by Mark Richards & Martin Fowler",
          "Building Evolutionary Architectures",
          "Detailed content on evolutionary software governance.",
        ],
      ]);
      const result = await pdfParser.parse(pdfBuffer, "fallback-book.pdf");

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Building Evolutionary Architectures");
    });
  });

  describe("LocalFileStrategy Integration", () => {
    it("discovers and parses mixed .md, .docx, and .pdf files while ignoring unsupported files", async () => {
      // 1. Markdown file
      fs.writeFileSync(
        path.join(tempDir, "note.md"),
        "# Markdown Note\n\nMarkdown notes are fast and simple."
      );

      // 2. DOCX file
      const docxBuf = await createMinimalDocx({
        heading: "Word Specification",
        paragraph: "This document was generated in Microsoft Word.",
        table: [
          ["Prop", "Value"],
          ["Author", "Team"],
        ],
      });
      fs.writeFileSync(path.join(tempDir, "spec.docx"), docxBuf);

      // 3. PDF file
      const pdfBuf = createMinimalPdf(
        "Portable Document Format textbook content with sufficient length."
      );
      fs.writeFileSync(path.join(tempDir, "textbook.pdf"), pdfBuf);

      // 4. Ignored non-text / non-document file
      fs.writeFileSync(path.join(tempDir, "image.png"), "fake png data");

      const source: DataSource = {
        id: "source-mixed-1",
        name: "Mixed Vault",
        type: "local",
        uri: tempDir,
        targetDeck: "Default",
        tags: [],
        isActive: true,
      };

      const docs = await localStrategy.fetch(source);

      expect(docs.length).toBe(3);
      const titles = docs.map((d) => d.title);
      expect(titles).toContain("Markdown Note");
      expect(titles).toContain("Word Specification");
      expect(titles.some((t) => t.includes("Portable Document Format") || t.includes("textbook"))).toBe(true);

      // Verify DOCX contains GFM table
      const docxDoc = docs.find((d) => d.title === "Word Specification");
      expect(docxDoc).toBeDefined();
      expect(docxDoc!.rawContent).toContain("| Prop | Value |");

      // Verify PDF contains page marker
      const pdfDoc = docs.find((d) => d.originUrl?.endsWith(".pdf"));
      expect(pdfDoc).toBeDefined();
      expect(pdfDoc!.rawContent).toContain("<!-- page: 1 -->");

      // Clean text extraction on each doc
      for (const raw of docs) {
        const clean = localStrategy.extractCleanText(raw);
        expect(clean.textContent.length).toBeGreaterThan(0);
        expect(clean.contentHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("explicitly rejects legacy .doc files at upload / fetch", async () => {
      const docPath = path.join(tempDir, "ancient-document.doc");
      fs.writeFileSync(docPath, createLegacyDocBuffer());

      const source: DataSource = {
        id: "source-doc-fail",
        name: "Legacy Doc",
        type: "local",
        uri: docPath,
        targetDeck: "Default",
        tags: [],
        isActive: true,
      };

      await expect(localStrategy.fetch(source)).rejects.toThrow(UnsupportedDocumentError);
      await expect(localStrategy.fetch(source)).rejects.toThrow(
        "Legacy binary .doc is not supported. Please convert to .docx or .pdf"
      );
    });

    it("safely skips scanned zero-text PDFs during folder traversal with warning", async () => {
      // Valid file
      fs.writeFileSync(path.join(tempDir, "valid.txt"), "This is a valid document with adequate text.");

      // Scanned PDF
      const scannedPdf = createEmptyScannedPdf(2);
      fs.writeFileSync(path.join(tempDir, "scanned-empty.pdf"), scannedPdf);

      const source: DataSource = {
        id: "source-scanned-skip",
        name: "Folder with Scanned PDF",
        type: "local",
        uri: tempDir,
        targetDeck: "Default",
        tags: [],
        isActive: true,
      };

      const docs = await localStrategy.fetch(source);
      // Scanned PDF was skipped, valid.txt was ingested
      expect(docs.length).toBe(1);
      expect(docs[0].title).toBe("valid");
    });

    it("ingests a single standalone .docx file via single-file URI", async () => {
      const docxBuf = await createMinimalDocx({
        heading: "Single Document",
        paragraph: "Single-file upload test paragraph.",
      });
      const singleDocxPath = path.join(tempDir, "uploaded.docx");
      fs.writeFileSync(singleDocxPath, docxBuf);

      const source: DataSource = {
        id: "source-single-docx",
        name: "Uploaded Docx",
        type: "local",
        uri: singleDocxPath,
        targetDeck: "Default",
        tags: [],
        isActive: true,
      };

      const docs = await localStrategy.fetch(source);
      expect(docs.length).toBe(1);
      expect(docs[0].title).toBe("Single Document");
      expect(docs[0].rawContent).toContain("# Single Document");
      expect(docs[0].originUrl).toBe(`file://${singleDocxPath.replace(/\\/g, "/")}`);
    });

    it("ingests a single standalone .pdf file via single-file URI", async () => {
      const pdfBuf = createMinimalPdf("Standalone PDF document content with sufficient words.");
      const singlePdfPath = path.join(tempDir, "uploaded.pdf");
      fs.writeFileSync(singlePdfPath, pdfBuf);

      const source: DataSource = {
        id: "source-single-pdf",
        name: "Uploaded PDF",
        type: "local",
        uri: singlePdfPath,
        targetDeck: "Default",
        tags: [],
        isActive: true,
      };

      const docs = await localStrategy.fetch(source);
      expect(docs.length).toBe(1);
      expect(docs[0].rawContent).toContain("Standalone PDF document content");
      expect(docs[0].rawContent).toContain("<!-- page: 1 -->");
      expect(docs[0].originUrl).toBe(`file://${singlePdfPath.replace(/\\/g, "/")}`);
    });

    it("explicitly throws ScannedDocumentError when targeting a single scanned PDF file", async () => {
      const scannedPdf = createEmptyScannedPdf(2);
      const singleScannedPath = path.join(tempDir, "scanned-only.pdf");
      fs.writeFileSync(singleScannedPath, scannedPdf);

      const source: DataSource = {
        id: "source-single-scanned",
        name: "Single Scanned PDF",
        type: "local",
        uri: singleScannedPath,
        targetDeck: "Default",
        tags: [],
        isActive: true,
      };

      await expect(localStrategy.fetch(source)).rejects.toThrow(ScannedDocumentError);
      await expect(localStrategy.fetch(source)).rejects.toThrow(
        "Document contains scanned images with no selectable text layer. OCR is not supported."
      );
    });
  });
});
