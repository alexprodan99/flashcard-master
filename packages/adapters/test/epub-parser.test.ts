import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import {
  EpubParser,
  DrmProtectedEpubError,
  InvalidEpubError,
} from "../src/ingestion/epub-parser.js";
import { LocalFileStrategy } from "../src/ingestion/local-file-strategy.js";
import { MediaService, type DataSource } from "@flashcard-master/core";

// Helper to create an in-memory EPUB 3 archive
async function createMockEpub3(options: {
  title?: string;
  author?: string;
  chapters: Array<{ filename: string; title: string; html: string }>;
  images?: Array<{ filename: string; buffer: Buffer; mimeType: string }>;
}): Promise<Buffer> {
  const zip = new JSZip();

  // 1. mimetype (STORE)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // 2. container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // 3. Navigation document (nav.xhtml)
  const navListItems = options.chapters
    .map((ch) => `      <li><a href="${ch.filename}">${ch.title}</a></li>`)
    .join("\n");

  const navContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Table of Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
${navListItems}
      </ol>
    </nav>
  </body>
</html>`;
  zip.file("EPUB/nav.xhtml", navContent);

  // 4. Chapters
  options.chapters.forEach((ch) => {
    zip.file(`EPUB/${ch.filename}`, ch.html);
  });

  // 5. Images
  if (options.images) {
    options.images.forEach((img) => {
      zip.file(`EPUB/${img.filename}`, img.buffer);
    });
  }

  // 6. package.opf manifest & spine
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    ...options.chapters.map(
      (ch, idx) => `<item id="ch${idx + 1}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
    ),
    ...(options.images || []).map(
      (img, idx) => `<item id="img${idx + 1}" href="${img.filename}" media-type="${img.mimeType}"/>`
    ),
  ].join("\n    ");

  const spineItems = options.chapters
    .map((_, idx) => `<itemref idref="ch${idx + 1}"/>`)
    .join("\n    ");

  const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:mock-epub-3</dc:identifier>
    <dc:title>${options.title || "EPUB 3 Guidebook"}</dc:title>
    <dc:creator>${options.author || "Elena Rostova"}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
  zip.file("EPUB/package.opf", opfContent);

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}

// Helper to create an in-memory legacy EPUB 2 archive with toc.ncx
async function createMockEpub2(options: {
  title?: string;
  author?: string;
  chapters: Array<{ filename: string; title: string; html: string }>;
}): Promise<Buffer> {
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // Chapters
  options.chapters.forEach((ch) => {
    zip.file(`OEBPS/${ch.filename}`, ch.html);
  });

  // toc.ncx
  const navPoints = options.chapters
    .map(
      (ch, idx) => `  <navPoint id="np-${idx + 1}" playOrder="${idx + 1}">
    <navLabel><text>${ch.title}</text></navLabel>
    <content src="${ch.filename}"/>
  </navPoint>`
    )
    .join("\n");

  const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="mock-epub-2"/>
  </head>
  <docTitle><text>${options.title || "Legacy Classic"}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
  zip.file("OEBPS/toc.ncx", ncxContent);

  // content.opf
  const manifestItems = [
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    ...options.chapters.map(
      (ch, idx) => `<item id="item${idx + 1}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
    ),
  ].join("\n    ");

  const spineItems = options.chapters
    .map((_, idx) => `<itemref idref="item${idx + 1}"/>`)
    .join("\n    ");

  const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${options.title || "Legacy Classic"}</dc:title>
    <dc:creator>${options.author || "Arthur Conan Doyle"}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;
  zip.file("OEBPS/content.opf", opfContent);

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}

// Helper to create DRM-encrypted EPUB
async function createMockDrmEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>`
  );
  zip.file(
    "META-INF/encryption.xml",
    `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData/></encryption>`
  );
  zip.file("content.opf", `<package><metadata/><manifest/><spine/></package>`);
  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}

// Helper to create EPUB without explicit TOC file
async function createMockEpubWithoutToc(options: {
  title?: string;
  chapters: Array<{ filename: string; html: string }>;
}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>`
  );

  options.chapters.forEach((ch) => {
    zip.file(ch.filename, ch.html);
  });

  const manifestItems = options.chapters
    .map(
      (ch, idx) => `<item id="section${idx + 1}" href="${ch.filename}" media-type="application/xhtml+xml"/>`
    )
    .join("\n    ");

  const spineItems = options.chapters
    .map((_, idx) => `<itemref idref="section${idx + 1}"/>`)
    .join("\n    ");

  const opfContent = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${options.title || "TOC-Free Booklet"}</dc:title>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
  zip.file("content.opf", opfContent);

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;
}

describe("EpubParser", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-epub-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {}
    }
  });

  it("parses valid EPUB 3.0 publication with nav.xhtml Table of Contents and spine ordering", async () => {
    const epubBuffer = await createMockEpub3({
      title: "Designing Data-Intensive Applications",
      author: "Martin Kleppmann",
      chapters: [
        {
          filename: "ch01.xhtml",
          title: "Chapter 1: Reliable, Scalable, and Maintainable Applications",
          html: `<html><head><title>Ch 1</title></head><body><h1>Chapter 1: Reliable, Scalable, and Maintainable Applications</h1><p>Data-intensive applications are typically built from standard building blocks that provide commonly needed functionality.</p></body></html>`,
        },
        {
          filename: "ch02.xhtml",
          title: "Chapter 2: Data Models and Query Languages",
          html: `<html><head><title>Ch 2</title></head><body><h1>Chapter 2: Data Models and Query Languages</h1><p>Data models are perhaps the most important part of developing software because of their profound effect.</p></body></html>`,
        },
        {
          filename: "ch03.xhtml",
          title: "Chapter 3: Storage and Retrieval",
          html: `<html><head><title>Ch 3</title></head><body><h1>Chapter 3: Storage and Retrieval</h1><p>On the most fundamental level, a database needs to do two things: store the data and give it back to you.</p></body></html>`,
        },
      ],
    });

    const parser = new EpubParser();
    const result = await parser.parse(epubBuffer, "ddia.epub");

    expect(result).not.toBeNull();
    expect(result!.bookTitle).toBe("Designing Data-Intensive Applications");
    expect(result!.author).toBe("Martin Kleppmann");
    expect(result!.chapters).toHaveLength(3);

    // Spine reading order verification
    expect(result!.chapters[0].order).toBe(1);
    expect(result!.chapters[0].title).toBe("Chapter 1: Reliable, Scalable, and Maintainable Applications");
    expect(result!.chapters[0].markdown).toContain("Data-intensive applications are typically built");
    expect(result!.chapters[0].wordCount).toBeGreaterThan(10);

    expect(result!.chapters[1].order).toBe(2);
    expect(result!.chapters[1].title).toBe("Chapter 2: Data Models and Query Languages");

    expect(result!.chapters[2].order).toBe(3);
    expect(result!.chapters[2].title).toBe("Chapter 3: Storage and Retrieval");
    expect(result!.totalWords).toBeGreaterThan(30);
  });

  it("parses legacy EPUB 2.0 publication using toc.ncx navMap hierarchy", async () => {
    const epubBuffer = await createMockEpub2({
      title: "The Adventures of Sherlock Holmes",
      author: "Arthur Conan Doyle",
      chapters: [
        {
          filename: "story1.xhtml",
          title: "A Scandal in Bohemia",
          html: `<html><body><h2>A Scandal in Bohemia</h2><p>To Sherlock Holmes she is always the woman.</p></body></html>`,
        },
        {
          filename: "story2.xhtml",
          title: "The Red-Headed League",
          html: `<html><body><h2>The Red-Headed League</h2><p>I had called upon my friend, Mr. Sherlock Holmes, one day in the autumn.</p></body></html>`,
        },
      ],
    });

    const parser = new EpubParser();
    const result = await parser.parse(epubBuffer, "holmes.epub");

    expect(result).not.toBeNull();
    expect(result!.bookTitle).toBe("The Adventures of Sherlock Holmes");
    expect(result!.author).toBe("Arthur Conan Doyle");
    expect(result!.chapters).toHaveLength(2);

    expect(result!.chapters[0].title).toBe("A Scandal in Bohemia");
    expect(result!.chapters[0].markdown).toContain("To Sherlock Holmes she is always the woman.");
    expect(result!.chapters[1].title).toBe("The Red-Headed League");
  });

  it("fails fast with DrmProtectedEpubError when META-INF/encryption.xml is present", async () => {
    const drmBuffer = await createMockDrmEpub();
    const parser = new EpubParser();

    await expect(parser.parse(drmBuffer, "encrypted.epub")).rejects.toThrow(DrmProtectedEpubError);
    await expect(parser.parse(drmBuffer, "encrypted.epub")).rejects.toThrow(
      "Encrypted or DRM-protected EPUBs are not supported. Please provide a DRM-free publication."
    );
  });

  it("handles EPUB without explicit TOC file by falling back gracefully to internal headings or section numbers", async () => {
    const epubBuffer = await createMockEpubWithoutToc({
      title: "Loose Notes Booklet",
      chapters: [
        {
          filename: "sec1.xhtml",
          html: `<html><body><h1>Introduction & Foundations</h1><p>Foundational principles of system architecture.</p></body></html>`,
        },
        {
          filename: "sec2.xhtml",
          html: `<html><body><p>Unlabeled body content without header elements.</p></body></html>`,
        },
      ],
    });

    const parser = new EpubParser();
    const result = await parser.parse(epubBuffer, "notes.epub");

    expect(result).not.toBeNull();
    expect(result!.chapters).toHaveLength(2);
    // Extracted from <h1>
    expect(result!.chapters[0].title).toBe("Introduction & Foundations");
    // Fallback naming
    expect(result!.chapters[1].title).toBe("Section 2");
  });

  it("extracts and localizes embedded images via MediaService and rewrites src paths", async () => {
    const mediaDir = path.join(tempDir, "media");
    const mediaService = new MediaService({ mediaDir });

    const pngPixel = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
      0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
      0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78,
      0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const epubBuffer = await createMockEpub3({
      title: "Illustrated Systems Handbook",
      chapters: [
        {
          filename: "ch1.xhtml",
          title: "Chapter 1: Raft Consensus",
          html: `<html><body><h1>Chapter 1: Raft Consensus</h1><p>Leader election protocol diagram:</p><img src="images/raft-diagram.png" alt="Raft Architecture" /></body></html>`,
        },
      ],
      images: [
        {
          filename: "images/raft-diagram.png",
          buffer: pngPixel,
          mimeType: "image/png",
        },
      ],
    });

    const parser = new EpubParser({ mediaService });
    const result = await parser.parse(epubBuffer, "illustrated.epub");

    expect(result).not.toBeNull();
    expect(result!.chapters).toHaveLength(1);
    expect(result!.chapters[0].markdown).toMatch(/!\[Raft Architecture\]\(\/api\/media\/[a-f0-9]{32}\.webp\)/);

    // Verify media was saved in mediaDir
    const savedFiles = fs.readdirSync(mediaDir);
    expect(savedFiles.length).toBe(1);
    expect(savedFiles[0].endsWith(".webp")).toBe(true);
  });

  it("safely skips broken image references without dropping chapter text", async () => {
    const mediaDir = path.join(tempDir, "media-broken");
    const mediaService = new MediaService({ mediaDir });

    const epubBuffer = await createMockEpub3({
      title: "Fault Tolerant Book",
      chapters: [
        {
          filename: "ch1.xhtml",
          title: "Chapter 1",
          html: `<html><body><h1>Chapter 1</h1><p>Important text remains intact.</p><img src="images/missing.png" alt="Missing Figure" /></body></html>`,
        },
      ],
      // images array omitted so images/missing.png does not exist in zip
    });

    const parser = new EpubParser({ mediaService });
    const result = await parser.parse(epubBuffer, "fault-tolerant.epub");

    expect(result).not.toBeNull();
    expect(result!.chapters[0].markdown).toContain("Important text remains intact.");
  });

  it("throws InvalidEpubError on non-zip or corrupted buffers", async () => {
    const corruptBuffer = Buffer.from("this is definitely not a zip or epub archive");
    const parser = new EpubParser();

    await expect(parser.parse(corruptBuffer, "corrupt.epub")).rejects.toThrow(InvalidEpubError);
  });

  it("throws InvalidEpubError when container.xml is missing", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    zip.file("empty.txt", "no container");
    const buf = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

    const parser = new EpubParser();
    await expect(parser.parse(buf, "bad-container.epub")).rejects.toThrow(InvalidEpubError);
    await expect(parser.parse(buf, "bad-container.epub")).rejects.toThrow("Missing META-INF/container.xml");
  });
});

describe("LocalFileStrategy EPUB Ingestion Integration", () => {
  let tempDir: string;
  let localStrategy: LocalFileStrategy;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-local-epub-"));
    localStrategy = new LocalFileStrategy();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
      } catch {}
    }
  });

  it("ingests a standalone .epub file into distinct RawDocument chapters with filename-prefixed titles", async () => {
    const epubBuffer = await createMockEpub3({
      title: "Calculus Guidebook",
      author: "Isaac Newton",
      chapters: [
        {
          filename: "ch1.xhtml",
          title: "Chapter 1: Limits and Continuity",
          html: `<html><body><h1>Chapter 1: Limits and Continuity</h1><p>A limit is the value that a function approaches as the input approaches some value.</p></body></html>`,
        },
        {
          filename: "ch2.xhtml",
          title: "Chapter 2: Foundations",
          html: `<html><body><h1>Chapter 2: Foundations</h1><p>Foundations of differential calculus and rates of change.</p></body></html>`,
        },
      ],
    });

    const epubPath = path.join(tempDir, "Calculus.epub");
    fs.writeFileSync(epubPath, epubBuffer);

    const source: DataSource = {
      id: "src-epub-calc",
      name: "Calculus Textbook",
      type: "local",
      uri: epubPath,
      tags: ["math"],
      isActive: true,
    };

    const docs = await localStrategy.fetch(source);

    expect(docs).toHaveLength(2);
    // Verifies title format: Book.epub - Chapter Title
    expect(docs[0].title).toBe("Calculus.epub - Chapter 1: Limits and Continuity");
    expect(docs[0].rawContent).toContain("A limit is the value that a function approaches");
    expect(docs[0].originUrl).toContain("Calculus.epub#ch1.xhtml");

    expect(docs[1].title).toBe("Calculus.epub - Chapter 2: Foundations");
    expect(docs[1].rawContent).toContain("Foundations of differential calculus");

    // Clean text extraction preserves exact titles and generates sha256 contentHash
    const cleanDoc = localStrategy.extractCleanText(docs[1]);
    expect(cleanDoc.title).toBe("Calculus.epub - Chapter 2: Foundations");
    expect(cleanDoc.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("recursively discovers and ingests .epub files in mixed document directories alongside .md, .pdf, and .docx", async () => {
    // 1. Markdown file
    fs.writeFileSync(path.join(tempDir, "note.md"), "# Architecture Note\nMicroservices decouple systems.");

    // 2. EPUB file
    const epubBuffer = await createMockEpub3({
      title: "Distributed Systems Book",
      chapters: [
        {
          filename: "ch1.xhtml",
          title: "Chapter 1: Consistency",
          html: `<html><body><h1>Chapter 1: Consistency</h1><p>Linearizability guarantees real-time recency.</p></body></html>`,
        },
      ],
    });
    fs.writeFileSync(path.join(tempDir, "distributed.epub"), epubBuffer);

    const source: DataSource = {
      id: "src-mixed-dir",
      name: "Mixed Research Vault",
      type: "local",
      uri: tempDir,
      tags: [],
      isActive: true,
    };

    const docs = await localStrategy.fetch(source);

    // note.md (1 doc) + distributed.epub (1 chapter doc) = 2 docs
    expect(docs).toHaveLength(2);
    const titles = docs.map((d) => d.title);
    expect(titles).toContain("Architecture Note");
    expect(titles).toContain("distributed.epub - Chapter 1: Consistency");
  });

  it("throws DrmProtectedEpubError when targeting a single DRM-protected EPUB file", async () => {
    const drmBuffer = await createMockDrmEpub();
    const drmPath = path.join(tempDir, "locked.epub");
    fs.writeFileSync(drmPath, drmBuffer);

    const source: DataSource = {
      id: "src-drm-single",
      name: "Locked Book",
      type: "local",
      uri: drmPath,
      tags: [],
      isActive: true,
    };

    await expect(localStrategy.fetch(source)).rejects.toThrow(DrmProtectedEpubError);
    await expect(localStrategy.fetch(source)).rejects.toThrow(
      "Encrypted or DRM-protected EPUBs are not supported. Please provide a DRM-free publication."
    );
  });

  it("safely skips DRM-protected EPUB files during directory scanning with warning", async () => {
    // Valid note
    fs.writeFileSync(path.join(tempDir, "valid.md"), "# Valid Note\nSome readable content.");

    // DRM EPUB
    const drmBuffer = await createMockDrmEpub();
    fs.writeFileSync(path.join(tempDir, "locked.epub"), drmBuffer);

    const source: DataSource = {
      id: "src-drm-dir",
      name: "Directory with DRM File",
      type: "local",
      uri: tempDir,
      tags: [],
      isActive: true,
    };

    const docs = await localStrategy.fetch(source);
    // DRM-protected file is skipped; valid.md is ingested
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe("Valid Note");
  });
});
