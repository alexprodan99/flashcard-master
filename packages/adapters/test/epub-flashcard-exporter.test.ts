import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import type { Flashcard } from "@flashcard-master/core";
import { MediaService, SqliteSettingsRepository, SettingsService, createDatabaseClient } from "@flashcard-master/core";
import { EpubFlashcardExporter } from "../src/export/epub-flashcard-exporter.js";

function createMockCard(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: "card-" + Math.random().toString(36).slice(2, 7),
    question: "Sample Question?",
    answer: "Sample Answer.",
    sourceQuote: "Sample verbatim quote from text.",
    sourceLocator: "Section 1.1",
    keywords: ["test", "core"],
    difficulty: "intermediate",
    personaUsed: "socratic-mentor",
    targetDeck: "Default",
    tags: ["test"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("EpubFlashcardExporter", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fc-epub-export-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const sampleCards: Flashcard[] = [
    createMockCard({
      id: "card-1",
      question: "What is Raft consensus?",
      answer: "A consensus algorithm designed to be easy to understand.",
      difficulty: "beginner",
      sourceQuote: "Raft is a consensus algorithm for managing replicated logs.",
      sourceLocator: "Chapter 3, page 42",
      documentTitle: "Distributed Systems Guide",
      sourceOriginUrl: "https://example.com/raft",
      targetDeck: "Distributed Systems",
      personaUsed: "socratic-mentor",
      tags: ["consensus", "raft"],
      keywords: ["raft", "consensus"],
    }),
    createMockCard({
      id: "card-2",
      question: "How does leader election work in Raft?",
      answer: "Nodes transition to candidate state after heartbeat timeout and request votes.",
      difficulty: "intermediate",
      sourceQuote: "If a follower receives no communication over election timeout, it begins an election.",
      sourceLocator: "Chapter 3, page 45",
      documentTitle: "Distributed Systems Guide",
      sourceOriginUrl: "https://example.com/raft",
      targetDeck: "Distributed Systems",
      personaUsed: "strict-examiner",
      tags: ["raft", "election"],
      keywords: ["leader", "election"],
    }),
    createMockCard({
      id: "card-3",
      question: "What is Byzantine Fault Tolerance?",
      answer: "The ability of a system to tolerate arbitrary or malicious node failures.",
      difficulty: "expert",
      sourceQuote: "Byzantine faults involve arbitrary deviations from the protocol.",
      sourceLocator: "Chapter 5, page 88",
      documentTitle: "Distributed Systems Guide",
      targetDeck: "Advanced Systems",
      personaUsed: "analogy-builder",
      tags: ["bft", "security"],
      keywords: ["bft", "fault-tolerance"],
    }),
  ];

  it("exports a valid EPUB 3.0 ZIP container with STORE compression for mimetype", async () => {
    const exporter = new EpubFlashcardExporter();
    const result = await exporter.export(sampleCards);

    expect(result.format).toBe("epub");
    expect(result.successCount).toBe(3);
    expect(result.data).toBeDefined();

    const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data as any);
    expect(buffer.length).toBeGreaterThan(100);

    // Verify ZIP magic bytes
    expect(buffer.toString("ascii", 0, 2)).toBe("PK");

    // Byte 8 is the compression method for the first file in ZIP (0 = STORE)
    expect(buffer.readUInt16LE(8)).toBe(0);

    // Byte offset 30 onwards contains the filename and uncompressed content
    expect(buffer.toString("utf-8", 30, 58)).toBe("mimetypeapplication/epub+zip");
  });

  it("produces standard EPUB 3.0 directory structure with container.xml and content.opf", async () => {
    const exporter = new EpubFlashcardExporter();
    const result = await exporter.export(sampleCards);
    const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data as any);

    const zip = await JSZip.loadAsync(buffer);

    // 1. mimetype
    const mimetype = await zip.file("mimetype")?.async("string");
    expect(mimetype).toBe("application/epub+zip");

    // 2. META-INF/container.xml
    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    expect(containerXml).toBeDefined();
    expect(containerXml).toContain('full-path="OEBPS/content.opf"');
    expect(containerXml).toContain('media-type="application/oebps-package+xml"');

    // 3. OEBPS/content.opf
    const contentOpf = await zip.file("OEBPS/content.opf")?.async("string");
    expect(contentOpf).toBeDefined();
    expect(contentOpf).toContain('<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">');
    expect(contentOpf).toContain("<dc:creator>Flashcard Master</dc:creator>");
    expect(contentOpf).toContain("<dc:publisher>Flashcard Master Studio</dc:publisher>");
    expect(contentOpf).toContain('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />');
    expect(contentOpf).toContain('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />');
    expect(contentOpf).toContain('<item id="css" href="styles.css" media-type="text/css" />');

    // 4. OEBPS/nav.xhtml
    const navXhtml = await zip.file("OEBPS/nav.xhtml")?.async("string");
    expect(navXhtml).toBeDefined();
    expect(navXhtml).toContain('<nav epub:type="toc" id="toc">');
    expect(navXhtml).toContain("Distributed Systems (2 Cards)");
    expect(navXhtml).toContain("Advanced Systems (1 Cards)");

    // 5. OEBPS/toc.ncx (EPUB 2 backward compatibility)
    const tocNcx = await zip.file("OEBPS/toc.ncx")?.async("string");
    expect(tocNcx).toBeDefined();
    expect(tocNcx).toContain('<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">');
    expect(tocNcx).toContain("Distributed Systems (2 Cards)");

    // 6. OEBPS/styles.css
    const css = await zip.file("OEBPS/styles.css")?.async("string");
    expect(css).toBeDefined();
    expect(css).toContain("details.flashcard");
    expect(css).toContain("summary.card-question");
  });

  it("groups cards into chapters by deck and renders interactive details/summary blocks", async () => {
    const exporter = new EpubFlashcardExporter();
    const result = await exporter.export(sampleCards);
    const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data as any);
    const zip = await JSZip.loadAsync(buffer);

    // Deck 1: Distributed Systems (cards 1 & 2)
    const deck1Xhtml = await zip.file("OEBPS/deck_1.xhtml")?.async("string");
    expect(deck1Xhtml).toBeDefined();
    expect(deck1Xhtml).toContain("Distributed Systems");
    expect(deck1Xhtml).toContain("2 Flashcards");
    expect(deck1Xhtml).toContain('details class="flashcard"');
    expect(deck1Xhtml).toContain('summary class="card-question"');
    expect(deck1Xhtml).toContain("What is Raft consensus?");
    expect(deck1Xhtml).toContain("How does leader election work in Raft?");
    expect(deck1Xhtml).toContain("A consensus algorithm designed to be easy to understand.");
    expect(deck1Xhtml).toContain("Chapter 3, page 42");
    expect(deck1Xhtml).toContain("socratic-mentor");
    expect(deck1Xhtml).toContain("strict-examiner");

    // Deck 2: Advanced Systems (card 3)
    const deck2Xhtml = await zip.file("OEBPS/deck_2.xhtml")?.async("string");
    expect(deck2Xhtml).toBeDefined();
    expect(deck2Xhtml).toContain("Advanced Systems");
    expect(deck2Xhtml).toContain("What is Byzantine Fault Tolerance?");
    expect(deck2Xhtml).toContain("Chapter 5, page 88");
  });

  it("omits citation box when sourceQuote is missing or includeCitations is false", async () => {
    const cardWithoutQuote = createMockCard({
      id: "card-no-quote",
      question: "What is 2 + 2?",
      answer: "4",
      difficulty: "beginner",
      sourceQuote: "",
      targetDeck: "Math",
    });

    const exporter = new EpubFlashcardExporter();
    const result = await exporter.export([cardWithoutQuote]);
    const zip = await JSZip.loadAsync(result.data as Buffer);
    const xhtml = await zip.file("OEBPS/deck_1.xhtml")?.async("string");

    expect(xhtml).toBeDefined();
    expect(xhtml).toContain("What is 2 + 2?");
    expect(xhtml).not.toContain("Verified Grounding Quote");

    // Now test with includeCitations = false on card that has quote
    const resultNoCitations = await exporter.export(sampleCards, { includeCitations: false });
    const zipNoCitations = await JSZip.loadAsync(resultNoCitations.data as Buffer);
    const xhtmlNoCitations = await zipNoCitations.file("OEBPS/deck_1.xhtml")?.async("string");

    expect(xhtmlNoCitations).toBeDefined();
    expect(xhtmlNoCitations).not.toContain("Verified Grounding Quote");
  });

  it("handles markdown formatting and special characters safely", async () => {
    const markdownCard = createMockCard({
      id: "card-md",
      question: "How do you check `x < 10 && y > 20` with **strict** types?",
      answer: "Use TypeScript guard:\n\n```typescript\nfunction isVal(x: number, y: number): boolean {\n  return x < 10 && y > 20;\n}\n```",
      difficulty: "expert",
      sourceQuote: "Always check `x < 10 && y > 20` using `<guard>` patterns.",
      targetDeck: "Coding",
    });

    const exporter = new EpubFlashcardExporter();
    const result = await exporter.export([markdownCard]);
    const zip = await JSZip.loadAsync(result.data as Buffer);
    const xhtml = await zip.file("OEBPS/deck_1.xhtml")?.async("string");

    expect(xhtml).toBeDefined();
    expect(xhtml).toContain("<code>x &lt; 10 &amp;&amp; y &gt; 20</code>");
    expect(xhtml).toContain("<strong>strict</strong>");
    expect(xhtml).toContain("<pre><code");
    expect(xhtml).toContain("&lt;guard&gt;");
  });

  it("writes to outputPath on disk when specified", async () => {
    const outputPath = path.join(tempDir, "subfolder", "biology-cards.epub");
    const exporter = new EpubFlashcardExporter();

    const result = await exporter.export(sampleCards, { outputPath });
    expect(result.outputPath).toBe(outputPath);

    const exists = await fs.stat(outputPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const fileContent = await fs.readFile(outputPath);
    expect(fileContent.toString("ascii", 0, 2)).toBe("PK");
  });

  it("respects custom author and publisher from SettingsService or options", async () => {
    const db = createDatabaseClient({ inMemory: true });
    const settingsRepo = new SqliteSettingsRepository(db);
    const settingsService = new SettingsService(settingsRepo);
    settingsService.updateGeneralSettings({
      epubDefaultAuthor: "Professor Turing",
      epubDefaultPublisher: "Oxford University Press",
    });

    const exporter = new EpubFlashcardExporter(settingsService);
    const result = await exporter.export(sampleCards);
    const zip = await JSZip.loadAsync(result.data as Buffer);
    const contentOpf = await zip.file("OEBPS/content.opf")?.async("string");

    expect(contentOpf).toContain("<dc:creator>Professor Turing</dc:creator>");
    expect(contentOpf).toContain("<dc:publisher>Oxford University Press</dc:publisher>");
    db.close();
  });

  it("handles empty cards collection gracefully with fallback chapter", async () => {
    const exporter = new EpubFlashcardExporter();
    const result = await exporter.export([]);
    expect(result.successCount).toBe(0);

    const zip = await JSZip.loadAsync(result.data as Buffer);
    const nav = await zip.file("OEBPS/nav.xhtml")?.async("string");
    expect(nav).toContain("Overview (0 Cards)");

    const chapter = await zip.file("OEBPS/deck_1.xhtml")?.async("string");
    expect(chapter).toContain("No flashcards found");
  });

  it("localizes referenced media assets into OEBPS/images/", async () => {
    const mediaDir = path.join(tempDir, "media");
    await fs.mkdir(mediaDir, { recursive: true });
    const mediaService = new MediaService({ mediaDir });

    const imgPayload = Buffer.from("fake-png-image-bytes");
    const asset = await mediaService.saveMedia(imgPayload, "image/png");

    const cardWithMedia = createMockCard({
      id: "card-media-1",
      question: `Identify this diagram:\n\n![Architecture](/api/media/${asset.filename})`,
      answer: "It depicts the consensus cycle.",
      difficulty: "intermediate",
      targetDeck: "Diagrams",
    });

    const exporter = new EpubFlashcardExporter(undefined, mediaService);
    const result = await exporter.export([cardWithMedia]);
    const zip = await JSZip.loadAsync(result.data as Buffer);

    // Verify image was packaged
    const packagedImg = await zip.file(`OEBPS/images/${asset.filename}`)?.async("nodebuffer");
    expect(packagedImg).toBeDefined();
    expect(packagedImg?.toString()).toBe("fake-png-image-bytes");

    // Verify rewritten reference in XHTML
    const xhtml = await zip.file("OEBPS/deck_1.xhtml")?.async("string");
    expect(xhtml).toContain(`src="images/${asset.filename}"`);

    // Verify OPF manifest contains image item
    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    expect(opf).toContain(`href="images/${asset.filename}"`);
    expect(opf).toContain('media-type="image/png"');
  });
});
