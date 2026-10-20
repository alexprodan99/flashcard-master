import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { JSDOM } from "jsdom";
import type { MediaService } from "@flashcard-master/core";
import { htmlToCleanText } from "../utils/html-cleaner.js";

export class DrmProtectedEpubError extends Error {
  constructor(
    message: string = "Encrypted or DRM-protected EPUBs are not supported. Please provide a DRM-free publication."
  ) {
    super(message);
    this.name = "DrmProtectedEpubError";
  }
}

export class InvalidEpubError extends Error {
  constructor(message: string = "Invalid or corrupted EPUB archive.") {
    super(message);
    this.name = "InvalidEpubError";
  }
}

export interface EpubChapter {
  id: string;
  title: string;
  href: string;
  markdown: string;
  wordCount: number;
  order: number;
}

export interface EpubParseResult {
  bookTitle: string;
  author?: string;
  language?: string;
  publisher?: string;
  chapters: EpubChapter[];
  totalWords: number;
}

export interface EpubParserOptions {
  mediaService?: MediaService;
}

interface ManifestItem {
  id: string;
  href: string;
  fullZipPath: string;
  mediaType: string;
  properties?: string;
}

function normalizeZipPath(...parts: string[]): string {
  const joined = parts.filter(Boolean).join("/").replace(/\\/g, "/");
  const segments = joined.split("/");
  const resolved: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  return resolved.join("/");
}

function getZipDir(zipPath: string): string {
  const normalized = normalizeZipPath(zipPath);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

export class EpubParser {
  private readonly mediaService?: MediaService;
  private readonly xmlParser: XMLParser;

  constructor(options: EpubParserOptions = {}) {
    this.mediaService = options.mediaService;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: true,
      parseAttributeValue: false,
    });
  }

  async parse(buffer: Buffer | Uint8Array, filename?: string): Promise<EpubParseResult | null> {
    if (!buffer || buffer.length === 0) {
      console.warn("[EpubParser] Encountered empty or zero-byte EPUB file.");
      return null;
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (err: any) {
      throw new InvalidEpubError(`Failed to unpack EPUB zip archive: ${err.message}`);
    }

    // 1. DRM / Encryption Detection
    if (
      this.findZipFile(zip, "META-INF/encryption.xml") ||
      this.findZipFile(zip, "meta-inf/encryption.xml")
    ) {
      throw new DrmProtectedEpubError(
        "Encrypted or DRM-protected EPUBs are not supported. Please provide a DRM-free publication."
      );
    }

    // 2. Container File (META-INF/container.xml)
    const containerEntry =
      this.findZipFile(zip, "META-INF/container.xml") ||
      this.findZipFile(zip, "meta-inf/container.xml");

    if (!containerEntry) {
      throw new InvalidEpubError("Missing META-INF/container.xml in EPUB archive.");
    }

    const containerXml = await containerEntry.async("string");
    const containerObj = this.xmlParser.parse(containerXml);
    const rootfiles = containerObj?.container?.rootfiles?.rootfile;
    const rootfileList = Array.isArray(rootfiles) ? rootfiles : [rootfiles].filter(Boolean);

    if (rootfileList.length === 0) {
      throw new InvalidEpubError("No rootfile element found in META-INF/container.xml.");
    }

    const opfRootfile =
      rootfileList.find(
        (r: any) =>
          r["@_media-type"] === "application/oebps-package+xml" ||
          (r["@_full-path"] && r["@_full-path"].endsWith(".opf"))
      ) || rootfileList[0];

    const opfPathRaw = opfRootfile?.["@_full-path"];
    if (!opfPathRaw) {
      throw new InvalidEpubError("Package document full-path not specified in container.xml.");
    }

    const opfPath = normalizeZipPath(decodeURIComponent(opfPathRaw));
    const opfDir = getZipDir(opfPath);
    const opfEntry = this.findZipFile(zip, opfPath);

    if (!opfEntry) {
      throw new InvalidEpubError(`Package document not found at: ${opfPath}`);
    }

    // 3. Parse OPF Package Document
    const opfXml = await opfEntry.async("string");
    const opfObj = this.xmlParser.parse(opfXml);
    const packageDoc = opfObj?.package;

    if (!packageDoc) {
      throw new InvalidEpubError("Invalid OPF package document structure.");
    }

    // 3a. Extract Metadata
    const metadata = packageDoc.metadata || {};
    const getMetaText = (val: any): string => {
      if (!val) return "";
      if (typeof val === "string") return val.trim();
      if (typeof val === "object") {
        if (val["#text"] != null) return String(val["#text"]).trim();
        if (val._text != null) return String(val._text).trim();
      }
      return String(val).trim();
    };

    let bookTitle =
      getMetaText(metadata["dc:title"]) ||
      getMetaText(metadata.title) ||
      "";

    const author =
      getMetaText(metadata["dc:creator"]) ||
      getMetaText(metadata.creator) ||
      undefined;

    const language =
      getMetaText(metadata["dc:language"]) ||
      getMetaText(metadata.language) ||
      undefined;

    const publisher =
      getMetaText(metadata["dc:publisher"]) ||
      getMetaText(metadata.publisher) ||
      undefined;

    if (!bookTitle && filename) {
      bookTitle = path.basename(filename, path.extname(filename));
    }
    if (!bookTitle) {
      bookTitle = "Untitled Publication";
    }

    // 3b. Extract Manifest
    const manifestItems = packageDoc.manifest?.item;
    const itemsList = Array.isArray(manifestItems) ? manifestItems : [manifestItems].filter(Boolean);
    const manifestMap = new Map<string, ManifestItem>();

    for (const item of itemsList) {
      const id = item["@_id"];
      const href = item["@_href"];
      const mediaType = item["@_media-type"] || "";
      const properties = item["@_properties"] || "";

      if (id && href) {
        const decodedHref = decodeURIComponent(href);
        const fullZipPath = normalizeZipPath(opfDir, decodedHref);
        manifestMap.set(id, {
          id,
          href: decodedHref,
          fullZipPath,
          mediaType,
          properties,
        });
      }
    }

    // 3c. Extract Spine
    const spine = packageDoc.spine || {};
    const ncxId = spine["@_toc"];
    const itemrefs = spine.itemref;
    const itemrefList = Array.isArray(itemrefs) ? itemrefs : [itemrefs].filter(Boolean);
    const spineIds: string[] = itemrefList
      .map((ref: any) => ref["@_idref"])
      .filter((id: string) => Boolean(id) && manifestMap.has(id));

    // 4. Extract Table of Contents (TOC)
    const tocMap = new Map<string, string>();
    await this.extractToc(zip, manifestMap, ncxId, tocMap);

    // 5. Extract Chapters in Spine Reading Order
    const chapters: EpubChapter[] = [];
    let orderIndex = 1;

    for (const itemId of spineIds) {
      const item = manifestMap.get(itemId);
      if (!item) continue;

      // Only process XHTML/HTML content documents
      const mt = item.mediaType.toLowerCase();
      if (!mt.includes("html") && !mt.includes("xml")) {
        continue;
      }

      const chapterEntry = this.findZipFile(zip, item.fullZipPath);
      if (!chapterEntry) continue;

      const rawHtml = await chapterEntry.async("string");
      const dom = new JSDOM(rawHtml);
      const doc = dom.window.document;
      const chapterDir = getZipDir(item.fullZipPath);

      // Localize Images inside chapter if MediaService is provided
      await this.localizeImages(zip, doc, chapterDir);

      // Convert body HTML to Markdown
      const bodyHtml = doc.body ? doc.body.innerHTML : rawHtml;
      const markdown = htmlToCleanText(bodyHtml, undefined, {
        preserveInlineFormatting: true,
      });

      // Resolve chapter title:
      // Priority: 1. TOC entry by full file path
      //           2. TOC entry by relative href
      //           3. Document h1, h2, or title element
      //           4. Sequential fallback ("Section 1")
      let chapterTitle =
        tocMap.get(item.fullZipPath) ||
        tocMap.get(item.href) ||
        tocMap.get(path.basename(item.fullZipPath));

      if (!chapterTitle) {
        const headingEl = doc.querySelector("h1, h2, h3, title");
        if (headingEl && headingEl.textContent?.trim()) {
          chapterTitle = headingEl.textContent.trim();
        }
      }

      if (!chapterTitle) {
        chapterTitle = `Section ${orderIndex}`;
      }

      const words = markdown.trim().match(/\S+/g);
      const wordCount = words ? words.length : 0;

      // Skip completely empty sections that have neither text nor images
      if (wordCount === 0 && !markdown.includes("![")) {
        continue;
      }

      chapters.push({
        id: item.id,
        title: chapterTitle,
        href: item.href,
        markdown,
        wordCount,
        order: orderIndex++,
      });
    }

    if (chapters.length === 0) {
      console.warn(`[EpubParser] No readable chapters found in "${bookTitle}".`);
    }

    const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    return {
      bookTitle,
      author,
      language,
      publisher,
      chapters,
      totalWords,
    };
  }

  async parseFile(filePath: string): Promise<EpubParseResult | null> {
    if (!fs.existsSync(filePath)) {
      console.warn(`[EpubParser] File does not exist: ${filePath}`);
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    return await this.parse(buffer, path.basename(filePath));
  }

  private async extractToc(
    zip: JSZip,
    manifestMap: Map<string, ManifestItem>,
    ncxId: string | undefined,
    tocMap: Map<string, string>
  ): Promise<void> {
    // 1. Try EPUB 3 Navigation Document first (item with properties="nav")
    const navItem = Array.from(manifestMap.values()).find(
      (it) => it.properties && it.properties.split(/\s+/).includes("nav")
    );

    if (navItem) {
      const navEntry = this.findZipFile(zip, navItem.fullZipPath);
      if (navEntry) {
        try {
          const navHtml = await navEntry.async("string");
          const navDom = new JSDOM(navHtml);
          const navDoc = navDom.window.document;
          const navDir = getZipDir(navItem.fullZipPath);

          // Locate <nav epub:type="toc"> or <nav id="toc"> or any <nav>
          let navContainer =
            navDoc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"], nav#toc, nav.toc') ||
            navDoc.querySelector("nav");

          if (navContainer) {
            const links = navContainer.querySelectorAll("a[href]");
            for (const a of Array.from(links)) {
              const hrefRaw = a.getAttribute("href")?.trim();
              const label = a.textContent?.trim();
              if (hrefRaw && label) {
                const [filePathPart, anchor] = hrefRaw.split("#");
                const resolved = normalizeZipPath(navDir, decodeURIComponent(filePathPart));
                if (!tocMap.has(resolved)) {
                  tocMap.set(resolved, label);
                }
                if (anchor) {
                  tocMap.set(`${resolved}#${anchor}`, label);
                }
                const baseName = path.basename(resolved);
                if (!tocMap.has(baseName)) {
                  tocMap.set(baseName, label);
                }
              }
            }
          }
        } catch (navErr: any) {
          console.warn(`[EpubParser] Error reading EPUB 3 navigation document: ${navErr.message}`);
        }
      }
    }

    // 2. If no entries found in EPUB 3 nav, try EPUB 2 NCX document (toc.ncx)
    if (tocMap.size === 0) {
      const ncxItem =
        (ncxId ? manifestMap.get(ncxId) : undefined) ||
        Array.from(manifestMap.values()).find(
          (it) =>
            it.mediaType === "application/x-dtbncx+xml" ||
            it.href.toLowerCase().endsWith(".ncx") ||
            it.id.toLowerCase() === "ncx"
        );

      if (ncxItem) {
        const ncxEntry = this.findZipFile(zip, ncxItem.fullZipPath);
        if (ncxEntry) {
          try {
            const ncxXml = await ncxEntry.async("string");
            const ncxObj = this.xmlParser.parse(ncxXml);
            const ncxDir = getZipDir(ncxItem.fullZipPath);

            const traverseNavPoints = (np: any) => {
              if (!np) return;
              const text =
                np.navLabel?.text != null
                  ? String(np.navLabel.text).trim()
                  : np.navLabel?.["#text"] != null
                    ? String(np.navLabel["#text"]).trim()
                    : "";
              const src = np.content?.["@_src"];
              if (text && src) {
                const [filePathPart, anchor] = String(src).split("#");
                const resolved = normalizeZipPath(ncxDir, decodeURIComponent(filePathPart));
                if (!tocMap.has(resolved)) {
                  tocMap.set(resolved, text);
                }
                if (anchor) {
                  tocMap.set(`${resolved}#${anchor}`, text);
                }
                const baseName = path.basename(resolved);
                if (!tocMap.has(baseName)) {
                  tocMap.set(baseName, text);
                }
              }

              const children = np.navPoint;
              if (children) {
                const childList = Array.isArray(children) ? children : [children];
                for (const child of childList) {
                  traverseNavPoints(child);
                }
              }
            };

            const navPoints = ncxObj?.ncx?.navMap?.navPoint;
            if (navPoints) {
              const npList = Array.isArray(navPoints) ? navPoints : [navPoints];
              for (const np of npList) {
                traverseNavPoints(np);
              }
            }
          } catch (ncxErr: any) {
            console.warn(`[EpubParser] Error reading EPUB 2 NCX document: ${ncxErr.message}`);
          }
        }
      }
    }
  }

  private async localizeImages(zip: JSZip, doc: Document, chapterDir: string): Promise<void> {
    if (!this.mediaService) return;

    const imgElements = Array.from(doc.querySelectorAll("img, image"));
    for (const img of imgElements) {
      const rawSrc =
        img.getAttribute("src") ||
        img.getAttribute("xlink:href") ||
        img.getAttribute("href");

      if (
        !rawSrc ||
        rawSrc.startsWith("data:") ||
        rawSrc.startsWith("http://") ||
        rawSrc.startsWith("https://")
      ) {
        continue;
      }

      const cleanSrc = rawSrc.split("#")[0].split("?")[0];
      const decodedSrc = decodeURIComponent(cleanSrc);
      const imgZipPath = normalizeZipPath(chapterDir, decodedSrc);
      const imgEntry = this.findZipFile(zip, imgZipPath);

      if (imgEntry) {
        try {
          const imgBuffer = await imgEntry.async("nodebuffer");
          let mimeType = "image/png";
          const ext = path.extname(imgZipPath).toLowerCase();
          if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
          else if (ext === ".webp") mimeType = "image/webp";
          else if (ext === ".gif") mimeType = "image/gif";
          else if (ext === ".svg") mimeType = "image/svg+xml";

          const saved = await this.mediaService.saveMedia(imgBuffer, mimeType);
          img.setAttribute("src", `/api/media/${saved.filename}`);
        } catch {
          // Gracefully continue if media optimization/saving fails
        }
      }
    }
  }

  private findZipFile(zip: JSZip, filePath: string): JSZip.JSZipObject | null {
    const direct = zip.file(filePath);
    if (direct) return direct;

    const normalized = normalizeZipPath(filePath);
    const byNormalized = zip.file(normalized);
    if (byNormalized) return byNormalized;

    // Case-insensitive fallback
    const targetLower = normalized.toLowerCase();
    for (const entryPath in zip.files) {
      if (entryPath.toLowerCase() === targetLower) {
        return zip.files[entryPath];
      }
    }

    return null;
  }
}
