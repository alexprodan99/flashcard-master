import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import type {
  Flashcard,
  ExporterPort,
  ExportOptions,
  ExportResult,
  SettingsService,
  MediaService,
} from "@flashcard-master/core";

export interface EpubFlashcardExporterOptions {
  title?: string;
  author?: string;
  publisher?: string;
  includeToc?: boolean;
  includeCitations?: boolean;
  includeBadges?: boolean;
  coverImage?: Buffer | string;
}

export class EpubFlashcardExporter implements ExporterPort {
  readonly format = "epub" as const;

  constructor(
    private readonly settingsService?: SettingsService,
    private readonly mediaService?: MediaService
  ) {}

  private slugify(text: string): string {
    return (
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "flashcards"
    );
  }

  private escapeXml(str?: string | null): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private escapeAttr(str?: string | null): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .replace(/[\r\n]+/g, " ");
  }

  private sanitizeUrl(url?: string | null): string | null {
    if (!url || typeof url !== "string") return null;
    const trimmed = url.trim();
    if (/^(https?:\/\/|\/|#)/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  /**
   * Converts markdown formatting and linebreaks into clean, strictly valid XHTML.
   */
  private formatXhtmlContent(text: string): string {
    const trimmed = (text || "").trim();
    if (!trimmed) return "<p><em>(Empty)</em></p>";

    // Protect code blocks first
    const codeBlocks: string[] = [];
    const placeholderPrefix = `__CODE_BLOCK_${Date.now()}_`;
    const textWithPlaceholders = trimmed.replace(
      /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g,
      (_match, lang, code) => {
        const idx = codeBlocks.length;
        const langClass = lang ? ` class="language-${this.escapeAttr(lang)}"` : "";
        const escapedCode = this.escapeXml(code.trimEnd());
        codeBlocks.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
        return `\n\n${placeholderPrefix}${idx}\n\n`;
      }
    );

    const rawBlocks = textWithPlaceholders.split(/\n{2,}/);
    const xhtmlBlocks: string[] = [];

    for (const rawBlock of rawBlocks) {
      const block = rawBlock.trim();
      if (!block) continue;

      // Code block placeholder
      const codeMatch = block.match(new RegExp(`^${placeholderPrefix}(\\d+)$`));
      if (codeMatch) {
        const idx = parseInt(codeMatch[1], 10);
        if (codeBlocks[idx]) {
          xhtmlBlocks.push(codeBlocks[idx]);
          continue;
        }
      }

      // Horizontal rule
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(block)) {
        xhtmlBlocks.push("<hr />");
        continue;
      }

      // Block image: ![alt](url)
      const imgMatch = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const alt = imgMatch[1].trim();
        const src = imgMatch[2].trim();
        const figcaption = alt ? `<figcaption>${this.escapeXml(alt)}</figcaption>` : "";
        xhtmlBlocks.push(
          `<figure class="card-figure"><img src="${this.escapeAttr(src)}" alt="${this.escapeAttr(
            alt
          )}" />${figcaption}</figure>`
        );
        continue;
      }

      // Headings
      const headingMatch = block.match(/^(#{1,6})\s+(.+)$/s);
      if (headingMatch && !block.includes("\n")) {
        const level = Math.min(6, headingMatch[1].length + 2);
        const content = this.formatInlineMarkdown(headingMatch[2].trim());
        xhtmlBlocks.push(`<h${level}>${content}</h${level}>`);
        continue;
      }

      // Blockquote
      if (block.startsWith(">")) {
        const quoteLines = block
          .split("\n")
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n");
        const content = this.formatInlineMarkdown(quoteLines).replace(/\n/g, "<br />");
        xhtmlBlocks.push(`<blockquote>${content}</blockquote>`);
        continue;
      }

      // Unordered list
      if (
        /^[\*\-]\s+/m.test(block) &&
        block.split("\n").every((l) => /^[\*\-]\s+/.test(l.trim()) || l.trim() === "")
      ) {
        const items = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^[\*\-]\s+/.test(l))
          .map((l) => `<li>${this.formatInlineMarkdown(l.replace(/^[\*\-]\s+/, ""))}</li>`)
          .join("\n");
        xhtmlBlocks.push(`<ul>\n${items}\n</ul>`);
        continue;
      }

      // Ordered list
      if (
        /^\d+\.\s+/m.test(block) &&
        block.split("\n").every((l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === "")
      ) {
        const items = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^\d+\.\s+/.test(l))
          .map((l) => `<li>${this.formatInlineMarkdown(l.replace(/^\d+\.\s+/, ""))}</li>`)
          .join("\n");
        xhtmlBlocks.push(`<ol>\n${items}\n</ol>`);
        continue;
      }

      // Standard paragraph
      const formatted = this.formatInlineMarkdown(block).replace(/\n/g, "<br />");
      xhtmlBlocks.push(`<p>${formatted}</p>`);
    }

    return xhtmlBlocks.join("\n");
  }

  private formatInlineMarkdown(text: string): string {
    let escaped = this.escapeXml(text);
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold: **text** or __text__
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/_([^_]+)_/g, "<em>$1</em>");
    // Inline images: ![alt](url)
    escaped = escaped.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
      '<img src="$2" alt="$1" class="inline-card-img" />'
    );
    // Markdown link: [label](url)
    escaped = escaped.replace(
      /(?<!\!)\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|\.\/[^\s)]+)\)/g,
      '<a href="$2">$1</a>'
    );
    return escaped;
  }

  private getImageMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      case ".svg":
        return "image/svg+xml";
      default:
        return "image/jpeg";
    }
  }

  private generateEpubCss(): string {
    return `@charset "UTF-8";

/* High-contrast, e-ink optimized typography */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  color: #111111;
  background-color: #ffffff;
  margin: 0;
  padding: 1.25rem;
}

.deck-header {
  border-bottom: 2px solid #222222;
  padding-bottom: 0.75rem;
  margin-bottom: 1.75rem;
}

.deck-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #0284c7;
  margin-bottom: 0.25rem;
}

.deck-title {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0 0 0.5rem 0;
  color: #000000;
}

.deck-meta {
  font-size: 0.9rem;
  color: #555555;
}

.difficulty-section-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
  margin: 2rem 0 1rem 0;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e5e7eb;
}

.card-item {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  padding: 1.25rem;
  background-color: #f9fafb;
  page-break-inside: avoid;
}

.card-badges {
  margin-bottom: 0.75rem;
}

.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #9ca3af;
  margin-right: 6px;
  color: #1f2937;
  background-color: #ffffff;
}

.badge-beginner {
  border-color: #16a34a;
  color: #15803d;
}

.badge-intermediate {
  border-color: #d97706;
  color: #b45309;
}

.badge-expert {
  border-color: #dc2626;
  color: #b91c1c;
}

.badge-mixed {
  border-color: #6366f1;
  color: #4f46e5;
}

.badge-persona {
  border-color: #7c3aed;
  color: #6d28d9;
}

.badge-deck {
  border-color: #0284c7;
  color: #0369a1;
}

details.flashcard {
  margin-top: 0.5rem;
}

summary.card-question {
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  color: #111827;
  list-style: none;
  outline: none;
}

summary.card-question::-webkit-details-marker {
  display: none;
}

summary.card-question::before {
  content: "▶ ";
  color: #0284c7;
  font-size: 0.85rem;
}

details[open] summary.card-question::before {
  content: "▼ ";
  color: #0284c7;
}

.q-prefix {
  font-weight: 800;
  color: #0284c7;
  margin-right: 6px;
}

.q-content {
  display: inline;
}

.reveal-hint {
  display: block;
  font-size: 0.8rem;
  font-weight: normal;
  color: #6b7280;
  margin-top: 6px;
}

.card-answer {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed #d1d5db;
}

.answer-header {
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #059669;
  margin-bottom: 6px;
}

.a-content {
  font-size: 1rem;
  color: #111827;
}

.card-citation {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background-color: #eff6ff;
  border-left: 3px solid #0284c7;
  border-radius: 4px;
  font-size: 0.85rem;
}

.citation-label {
  font-weight: 700;
  color: #1d4ed8;
  margin-bottom: 4px;
}

.citation-quote {
  margin: 4px 0 6px 0;
  font-style: italic;
  color: #334155;
  border-left: none;
  padding-left: 0;
}

.citation-meta {
  margin-top: 3px;
  color: #64748b;
  font-size: 0.8rem;
}

.meta-name {
  font-weight: 600;
  color: #475569;
}

.card-tags {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: #6b7280;
}

.tag {
  display: inline-block;
  background-color: #e5e7eb;
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: 4px;
  margin-top: 2px;
}

pre {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

code {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}

figure.card-figure {
  margin: 0.75rem 0;
  text-align: center;
}

figure.card-figure img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

img.inline-card-img {
  max-width: 100%;
  height: auto;
  vertical-align: middle;
  border-radius: 4px;
}

figcaption {
  font-size: 0.8rem;
  color: #6b7280;
  margin-top: 4px;
}

/* Nav Table of Contents */
nav#toc {
  padding: 1.5rem;
}

nav#toc h1 {
  font-size: 1.5rem;
  border-bottom: 2px solid #222222;
  padding-bottom: 0.5rem;
}

nav#toc ol {
  padding-left: 1.5rem;
  line-height: 1.8;
}

nav#toc a {
  color: #0284c7;
  text-decoration: none;
  font-weight: 500;
}
`;
  }

  private async resolveCoverImage(
    coverImage?: Buffer | string | null
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    if (!coverImage) return null;

    if (Buffer.isBuffer(coverImage)) {
      let mimeType = "image/jpeg";
      let filename = "cover.jpg";
      if (
        coverImage.length > 4 &&
        coverImage[0] === 0x89 &&
        coverImage[1] === 0x50 &&
        coverImage[2] === 0x4e &&
        coverImage[3] === 0x47
      ) {
        mimeType = "image/png";
        filename = "cover.png";
      }
      return { buffer: coverImage, mimeType, filename };
    }

    if (typeof coverImage === "string") {
      const trimmed = coverImage.trim();
      if (trimmed.startsWith("data:") && trimmed.includes(";base64,")) {
        const [header, base64Data] = trimmed.split(";base64,");
        const mimeType = header.replace(/^data:/, "") || "image/jpeg";
        const ext = mimeType.includes("png") ? "png" : "jpg";
        return {
          buffer: Buffer.from(base64Data, "base64"),
          mimeType,
          filename: `cover.${ext}`,
        };
      }

      if (
        /^[A-Za-z0-9+/=\r\n\s]+$/.test(trimmed) &&
        trimmed.replace(/[\r\n\s]/g, "").length % 4 === 0 &&
        trimmed.length > 100
      ) {
        const buf = Buffer.from(trimmed.replace(/[\r\n\s]/g, ""), "base64");
        let mimeType = "image/jpeg";
        let ext = "jpg";
        if (
          buf.length > 4 &&
          buf[0] === 0x89 &&
          buf[1] === 0x50 &&
          buf[2] === 0x4e &&
          buf[3] === 0x47
        ) {
          mimeType = "image/png";
          ext = "png";
        }
        return { buffer: buf, mimeType, filename: `cover.${ext}` };
      }

      try {
        const stats = await fs.stat(trimmed);
        if (stats.isFile()) {
          const buf = await fs.readFile(trimmed);
          const ext = path.extname(trimmed).toLowerCase().replace(/^\./, "") || "jpg";
          const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          return { buffer: buf, mimeType, filename: `cover.${ext}` };
        }
      } catch {
        // Not a readable local file path
      }
    }

    return null;
  }

  async export(
    cards: Flashcard[],
    options: ExportOptions & EpubFlashcardExporterOptions = {}
  ): Promise<ExportResult> {
    const zip = new JSZip();

    // 1. Mandatory EPUB 3.0 rule: First entry MUST be uncompressed 'mimetype' at byte 0
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // 2. META-INF/container.xml pointing to OEBPS/content.opf
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    // Optional Custom Cover Image
    const coverInfo = await this.resolveCoverImage(options.coverImage);
    if (coverInfo) {
      zip.file(`OEBPS/images/${coverInfo.filename}`, coverInfo.buffer);
      zip.file(
        "OEBPS/cover.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover</title>
  <style type="text/css">
    body { margin: 0; padding: 0; text-align: center; background-color: #000; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="cover-image">
    <img src="images/${coverInfo.filename}" alt="Cover Image" />
  </div>
</body>
</html>`
      );
    }

    // 3. Metadata resolution
    const author =
      options.author ||
      (typeof this.settingsService?.get === "function"
        ? this.settingsService.get("epub_default_author")
        : typeof (this.settingsService as any)?.getEpubDefaults === "function"
        ? (this.settingsService as any).getEpubDefaults().author
        : null) ||
      "Flashcard Master";
    const publisher =
      options.publisher ||
      (typeof this.settingsService?.get === "function"
        ? this.settingsService.get("epub_default_publisher")
        : typeof (this.settingsService as any)?.getEpubDefaults === "function"
        ? (this.settingsService as any).getEpubDefaults().publisher
        : null) ||
      "Flashcard Master Studio";

    const distinctDecks = Array.from(
      new Set(cards.map((c) => (c.targetDeck?.trim() ? c.targetDeck.trim() : "Default")))
    );

    let bookTitle: string;
    if (options.title) {
      bookTitle = options.title;
    } else if (options.targetDeck && options.targetDeck !== "all") {
      bookTitle = `${options.targetDeck} - Flashcard Study Guide`;
    } else if (distinctDecks.length === 1) {
      bookTitle = `${distinctDecks[0]} - Flashcard Study Guide`;
    } else {
      bookTitle = "Curated Flashcards - Interactive Study Guide";
    }

    const cardIdSeed = cards.map((c) => c.id).sort().join(":");
    const bookUuid = crypto.createHash("sha256").update(`${bookTitle}:${cardIdSeed}`).digest("hex").slice(0, 32);
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const modifiedTimestamp = now.toISOString().replace(/\.\d+Z$/, "Z");
    const escapedBookTitle = this.escapeXml(bookTitle);

    // 4. Media scanning & packaging into OEBPS/images/
    const localMediaRegex = /(?:(?:\/api\/media\/)|(?:api\/media\/))([a-zA-Z0-9_.-]+)/g;
    const referencedMedia = new Set<string>();

    cards.forEach((card) => {
      const texts = [card.question, card.answer, card.sourceQuote || ""];
      for (const text of texts) {
        if (!text) continue;
        const matches = Array.from(text.matchAll(localMediaRegex));
        for (const m of matches) {
          referencedMedia.add(m[1]);
        }
      }
    });

    const packagedImages = new Set<string>();
    if (this.mediaService && referencedMedia.size > 0) {
      for (const filename of referencedMedia) {
        try {
          const mediaBuffer = await this.mediaService.readMedia(filename);
          if (mediaBuffer) {
            zip.file(`OEBPS/images/${filename}`, mediaBuffer);
            packagedImages.add(filename);
          }
        } catch {
          // Skip missing media
        }
      }
    }

    const rewriteMediaForEpub = (content: string): string => {
      let rewritten = content;
      for (const filename of referencedMedia) {
        const escapedFn = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const localTarget = `(?:\\/api\\/media\\/|api\\/media\\/)${escapedFn}`;
        if (packagedImages.has(filename)) {
          rewritten = rewritten.replace(new RegExp(localTarget, "g"), `images/${filename}`);
        } else {
          rewritten = rewritten.replace(
            new RegExp(`!\\[([^\\]]*)\\]\\(${localTarget}(?:\\s+(['"])[^'"]*\\2)?\\)`, "g"),
            (_m, alt) => `*[Illustration: ${alt ? alt.trim() : "Image unavailable"}]*`
          );
        }
      }
      return rewritten;
    };

    // 5. Group cards by deck
    const deckGroups = new Map<string, Flashcard[]>();
    if (cards.length === 0) {
      deckGroups.set("Overview", []);
    } else {
      for (const card of cards) {
        const deck = card.targetDeck?.trim() || "Default";
        if (!deckGroups.has(deck)) {
          deckGroups.set(deck, []);
        }
        deckGroups.get(deck)!.push(card);
      }
    }

    const includeCitations = options.includeCitations !== false;
    const includeBadges = options.includeBadges !== false;
    const includeToc = options.includeToc !== false;
    const chapters: { id: string; filename: string; title: string; count: number }[] = [];
    let chapterIndex = 1;

    for (const [deckName, deckCards] of deckGroups.entries()) {
      const chapterId = `deck_${chapterIndex}`;
      const chapterFilename = `${chapterId}.xhtml`;
      chapters.push({
        id: chapterId,
        filename: chapterFilename,
        title: deckName,
        count: deckCards.length,
      });

      let cardsHtml = "";
      if (deckCards.length === 0) {
        cardsHtml = `<div class="card-item"><p><em>No flashcards found in this study guide collection.</em></p></div>`;
      } else {
        // Group or sort by difficulty: beginner, intermediate, expert
        const difficultyOrder: Record<string, number> = {
          beginner: 1,
          intermediate: 2,
          expert: 3,
        };

        const sortedCards = [...deckCards].sort((a, b) => {
          const diffA = difficultyOrder[a.difficulty.toLowerCase()] || 4;
          const diffB = difficultyOrder[b.difficulty.toLowerCase()] || 4;
          return diffA - diffB;
        });

        cardsHtml = sortedCards
          .map((card, idx) => {
            const diffClass = card.difficulty.toLowerCase();
            const localizedQ = rewriteMediaForEpub(card.question);
            const localizedA = rewriteMediaForEpub(card.answer);
            const qXhtml = this.formatXhtmlContent(localizedQ);
            const aXhtml = this.formatXhtmlContent(localizedA);

            let citationHtml = "";
            if (includeCitations && card.sourceQuote && card.sourceQuote.trim()) {
              const localizedQuote = rewriteMediaForEpub(card.sourceQuote.trim());
              const escapedQuote = this.escapeXml(localizedQuote);
              let locatorMeta = "";
              if (card.sourceLocator) {
                locatorMeta = `<div class="citation-meta"><span class="meta-name">Reference:</span> ${this.escapeXml(
                  card.sourceLocator
                )}</div>`;
              }
              let docMeta = "";
              if (card.documentTitle) {
                docMeta = `<div class="citation-meta"><span class="meta-name">Document:</span> ${this.escapeXml(
                  card.documentTitle
                )}</div>`;
              }
              let urlMeta = "";
              const safeUrl = this.sanitizeUrl(card.sourceOriginUrl);
              if (safeUrl) {
                urlMeta = `<div class="citation-meta"><span class="meta-name">Source:</span> <a href="${this.escapeAttr(
                  safeUrl
                )}">${this.escapeXml(safeUrl)} ↗</a></div>`;
              }

              citationHtml = `
            <div class="card-citation">
              <div class="citation-label">Verified Grounding Quote:</div>
              <blockquote class="citation-quote">&ldquo;${escapedQuote}&rdquo;</blockquote>
              ${locatorMeta}
              ${docMeta}
              ${urlMeta}
            </div>`;
            }

            let personaBadge = "";
            if (card.personaUsed) {
              personaBadge = `<span class="badge badge-persona">${this.escapeXml(card.personaUsed)}</span>`;
            }

            let tagsHtml = "";
            if (card.tags && card.tags.length > 0) {
              const tagSpans = card.tags
                .map((t) => `<span class="tag">#${this.escapeXml(t)}</span>`)
                .join(" ");
              tagsHtml = `<div class="card-tags">${tagSpans}</div>`;
            }

            let badgesHtml = "";
            if (includeBadges) {
              badgesHtml = `
        <div class="card-badges">
          <span class="badge badge-difficulty badge-${diffClass}">Card #${idx + 1} &bull; ${this.escapeXml(
                card.difficulty
              )}</span>
          ${personaBadge}
        </div>`;
            }

            return `
      <section class="card-item" id="card-${this.escapeAttr(card.id)}">${badgesHtml}
        <details class="flashcard">
          <summary class="card-question">
            <span class="q-prefix">Q:</span>
            <span class="q-content">${this.formatInlineMarkdown(localizedQ)}</span>
            <span class="reveal-hint">(Tap to reveal answer)</span>
          </summary>
          <div class="card-answer">
            <div class="answer-header">Answer</div>
            <div class="a-content">${aXhtml}</div>
            ${citationHtml}
          </div>
        </details>
        ${tagsHtml}
      </section>`;
          })
          .join("\n");
      }

      const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${this.escapeXml(deckName)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <section class="deck-chapter" id="${chapterId}">
    <header class="deck-header">
      <div class="deck-badge">Flashcard Deck #${chapterIndex}</div>
      <h1 class="deck-title">${this.escapeXml(deckName)}</h1>
      <div class="deck-meta">${deckCards.length} Flashcard${deckCards.length === 1 ? "" : "s"} &bull; Interactive Study Guide</div>
    </header>
    <div class="deck-cards">
${cardsHtml}
    </div>
  </section>
</body>
</html>`;

      zip.file(`OEBPS/${chapterFilename}`, chapterXhtml);
      chapterIndex++;
    }

    // 6. Generate OEBPS/nav.xhtml (EPUB 3 Table of Contents)
    const navItems = chapters
      .map(
        (chap, idx) =>
          `      <li><a href="${chap.filename}">${idx + 1}. ${this.escapeXml(chap.title)} (${chap.count} Cards)</a></li>`
      )
      .join("\n");

    const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <nav epub:type="toc" id="toc"${includeToc ? "" : ' hidden=""'}>
    <h1>Table of Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
${coverInfo ? `  <nav epub:type="landmarks" hidden="">
    <h2>Landmarks</h2>
    <ol>
      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>
      <li><a epub:type="toc" href="#toc">Table of Contents</a></li>
    </ol>
  </nav>` : ""}
</body>
</html>`;

    zip.file("OEBPS/nav.xhtml", navXhtml);

    // 7. Generate OEBPS/toc.ncx (EPUB 2 NCX compatibility)
    const ncxItems = chapters
      .map(
        (chap, idx) => `    <navPoint id="navpoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${idx + 1}. ${this.escapeXml(chap.title)} (${chap.count} Cards)</text></navLabel>
      <content src="${chap.filename}" />
    </navPoint>`
      )
      .join("\n");

    const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookUuid}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${escapedBookTitle}</text>
  </docTitle>
  <navMap>
${ncxItems}
  </navMap>
</ncx>`;

    zip.file("OEBPS/toc.ncx", tocNcx);

    // 8. Generate OEBPS/styles.css
    zip.file("OEBPS/styles.css", this.generateEpubCss());

    // 9. Generate OEBPS/content.opf (Package document)
    const chapterManifestItems = chapters
      .map(
        (chap) =>
          `    <item id="${chap.id}" href="${chap.filename}" media-type="application/xhtml+xml" />`
      )
      .join("\n");

    const imageManifestItems = Array.from(packagedImages)
      .map(
        (filename, idx) =>
          `    <item id="img_${idx + 1}" href="images/${filename}" media-type="${this.getImageMimeType(
            filename
          )}" />`
      )
      .join("\n");

    const spineItemrefs = chapters
      .map((chap) => `    <itemref idref="${chap.id}" />`)
      .join("\n");

    const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${bookUuid}</dc:identifier>
    <dc:title>${escapedBookTitle}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>${this.escapeXml(author)}</dc:creator>
    <dc:publisher>${this.escapeXml(publisher)}</dc:publisher>
    <dc:date>${dateStr}</dc:date>
    <meta property="dcterms:modified">${modifiedTimestamp}</meta>
${coverInfo ? '    <meta name="cover" content="cover-image" />\n' : ""  }</metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="css" href="styles.css" media-type="text/css" />
${coverInfo ? `    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml" />\n    <item id="cover-image" href="images/${coverInfo.filename}" media-type="${coverInfo.mimeType}" properties="cover-image" />\n` : ""}${chapterManifestItems}
${imageManifestItems ? imageManifestItems + "\n" : ""}  </manifest>
  <spine toc="ncx">
${coverInfo ? '    <itemref idref="cover-page" />\n' : ""}${spineItemrefs}
  </spine>
</package>`;

    zip.file("OEBPS/content.opf", opfXml);

    // 10. Generate ZIP buffer with DEFLATE (mimetype was stored uncompressed)
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      mimeType: "application/epub+zip",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    if (options.outputPath) {
      await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
      await fs.writeFile(options.outputPath, buffer);
    }

    return {
      format: "epub",
      successCount: cards.length,
      outputPath: options.outputPath,
      data: buffer,
      message: options.outputPath
        ? `Successfully exported ${cards.length} cards to EPUB: ${options.outputPath}`
        : `Successfully exported ${cards.length} cards to EPUB.`,
    };
  }
}
