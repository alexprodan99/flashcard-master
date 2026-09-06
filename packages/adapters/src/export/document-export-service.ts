import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type {
  DiscoveredDocument,
  DocumentExportFormat,
  DocumentExportMode,
  DocumentExportOptions,
  DocumentExportResult,
  ImageQuality,
  MediaService,
} from "@flashcard-master/core";

export class DocumentExportService {
  constructor(private readonly mediaService?: MediaService) {}

  private slugify(text: string): string {
    return (
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "document"
    );
  }

  private sanitizeUrl(url?: string | null): string {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return "";
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private formatInlineMarkdown(text: string): string {
    let escaped = this.escapeHtml(text);
    // Inline code: `code`
    escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold: **text** or __text__
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/_([^_]+)_/g, "<em>$1</em>");
    // Markdown image: ![alt](url)
    escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      const figcaption = alt ? `<figcaption>${alt}</figcaption>` : "";
      return `<figure class="doc-figure"><img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" />${figcaption}</figure>`;
    });
    // Markdown link: [label](url)
    escaped = escaped.replace(/(?<!\!)\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+|\.\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>');
    return escaped;
  }

  private formatHtmlParagraphs(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "<p><em>(No content available)</em></p>";

    // Extract code blocks first to protect formatting and line breaks
    const codeBlocks: string[] = [];
    const placeholderPrefix = `__CODE_BLOCK_${Date.now()}_`;
    const textWithPlaceholders = trimmed.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (_match, lang, code) => {
      const idx = codeBlocks.length;
      const langClass = lang ? ` class="language-${this.escapeHtml(lang)}"` : "";
      const escapedCode = this.escapeHtml(code.trimEnd());
      codeBlocks.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
      return `\n\n${placeholderPrefix}${idx}\n\n`;
    });

    // Split by double newlines into block elements
    const rawBlocks = textWithPlaceholders.split(/\n{2,}/);
    const htmlBlocks: string[] = [];

    for (const rawBlock of rawBlocks) {
      const block = rawBlock.trim();
      if (!block) continue;

      // Check for code block placeholder
      const codeMatch = block.match(new RegExp(`^${placeholderPrefix}(\\d+)$`));
      if (codeMatch) {
        const idx = parseInt(codeMatch[1], 10);
        if (codeBlocks[idx]) {
          htmlBlocks.push(codeBlocks[idx]);
          continue;
        }
      }

      // Check for horizontal rule (--- or ***)
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(block)) {
        htmlBlocks.push("<hr />");
        continue;
      }

      // Check for block image: ![alt](url)
      const imgMatch = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const alt = imgMatch[1].trim();
        const src = imgMatch[2].trim();
        const figcaption = alt ? `<figcaption>${this.escapeHtml(alt)}</figcaption>` : "";
        htmlBlocks.push(
          `<figure class="doc-figure"><img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer" />${figcaption}</figure>`
        );
        continue;
      }

      // Check for heading (# Heading)
      const headingMatch = block.match(/^(#{1,6})\s+(.+)$/s);
      if (headingMatch && !block.includes("\n")) {
        const level = Math.min(6, headingMatch[1].length + 2); // Shift h1->h3, h2->h4 so document title remains top heading
        const content = this.formatInlineMarkdown(headingMatch[2].trim());
        htmlBlocks.push(`<h${level}>${content}</h${level}>`);
        continue;
      }

      // Check for blockquote (> Quote)
      if (block.startsWith(">")) {
        const quoteLines = block
          .split("\n")
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n");
        const content = this.formatInlineMarkdown(quoteLines).replace(/\n/g, "<br />");
        htmlBlocks.push(`<blockquote>${content}</blockquote>`);
        continue;
      }

      // Check for unordered list (- item or * item)
      if (/^[\*\-]\s+/m.test(block) && block.split("\n").every((l) => /^[\*\-]\s+/.test(l.trim()) || l.trim() === "")) {
        const items = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^[\*\-]\s+/.test(l))
          .map((l) => `<li>${this.formatInlineMarkdown(l.replace(/^[\*\-]\s+/, ""))}</li>`)
          .join("\n");
        htmlBlocks.push(`<ul>\n${items}\n</ul>`);
        continue;
      }

      // Check for ordered list (1. item)
      if (/^\d+\.\s+/m.test(block) && block.split("\n").every((l) => /^\d+\.\s+/.test(l.trim()) || l.trim() === "")) {
        const items = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^\d+\.\s+/.test(l))
          .map((l) => `<li>${this.formatInlineMarkdown(l.replace(/^\d+\.\s+/, ""))}</li>`)
          .join("\n");
        htmlBlocks.push(`<ol>\n${items}\n</ol>`);
        continue;
      }

      // Standard paragraph
      const formattedPara = this.formatInlineMarkdown(block).replace(/\n/g, "<br />");
      htmlBlocks.push(`<p>${formattedPara}</p>`);
    }

    return htmlBlocks.join("\n");
  }

  private calculateTotalWords(docs: DiscoveredDocument[]): number {
    return docs.reduce((acc, doc) => {
      if (typeof doc.wordCount === "number" && doc.wordCount > 0) {
        return acc + doc.wordCount;
      }
      const words = doc.textContent?.trim() ? doc.textContent.trim().split(/\s+/).length : 0;
      return acc + words;
    }, 0);
  }

  private async inlineMediaAsBase64(
    htmlContent: string,
    options?: { imageQuality?: ImageQuality; grayscale?: boolean }
  ): Promise<string> {
    if (!this.mediaService || !htmlContent) {
      return htmlContent;
    }

    const mediaRegex = /(?:(?:\/api\/media\/)|(?:api\/media\/))([a-zA-Z0-9_.-]+)/g;
    const matches = Array.from(htmlContent.matchAll(mediaRegex));
    if (matches.length === 0) {
      return htmlContent;
    }

    const uniqueFilenames = Array.from(new Set(matches.map((m) => m[1])));
    const qualitySetting = options?.imageQuality ?? "compact";
    const isGrayscale = options?.grayscale ?? false;

    // Parallelize image reading and compression across worker threads
    const base64Entries = await Promise.all(
      uniqueFilenames.map(async (filename) => {
        try {
          let base64Data: { dataUrl: string; mimeType: string } | null = null;
          if (qualitySetting === "compact") {
            base64Data = await this.mediaService!.readMediaAsCompactBase64(filename, {
              maxWidth: 600,
              maxHeight: 600,
              quality: 50,
              effort: 6,
              grayscale: isGrayscale,
            });
          } else if (qualitySetting === "standard") {
            base64Data = await this.mediaService!.readMediaAsCompactBase64(filename, {
              maxWidth: 1200,
              maxHeight: 1200,
              quality: 75,
              effort: 4,
              grayscale: isGrayscale,
            });
          } else if (isGrayscale) {
            base64Data = await this.mediaService!.readMediaAsCompactBase64(filename, {
              maxWidth: 4000,
              maxHeight: 4000,
              quality: 90,
              effort: 4,
              grayscale: true,
            });
          }

          if (!base64Data) {
            base64Data = await this.mediaService!.readMediaAsBase64(filename);
          }
          return { filename, dataUrl: base64Data?.dataUrl };
        } catch {
          return { filename, dataUrl: null };
        }
      })
    );

    const dataUrlMap = new Map<string, string>();
    for (const entry of base64Entries) {
      if (entry.dataUrl) {
        dataUrlMap.set(entry.filename, entry.dataUrl);
      }
    }

    // Single-pass replacement using replacer function to avoid $ replacement issues and string copying
    return htmlContent.replace(mediaRegex, (_match, filename) => {
      return dataUrlMap.get(filename) || `/api/media/${filename}`;
    });
  }

  private normalizeFormat(format: string): "markdown" | "html" | "txt" | "json" {
    const f = (format || "").toLowerCase().trim();
    if (f === "md" || f === "markdown") return "markdown";
    if (f === "html" || f === "htm") return "html";
    if (f === "txt" || f === "text" || f === "plain") return "txt";
    if (f === "json") return "json";
    return "markdown";
  }

  async export(
    documents: DiscoveredDocument[],
    options: DocumentExportOptions
  ): Promise<DocumentExportResult> {
    const format = this.normalizeFormat(options.format);
    const mode = options.mode === "split" ? "split" : "merged";
    const sourceName = options.sourceName?.trim() || "Knowledge Base";
    const includeToc = options.includeTableOfContents ?? true;
    const includeCitations = options.includeCitations ?? true;
    const sourceSlug = this.slugify(sourceName);

    let result: DocumentExportResult;

    if (mode === "split") {
      result = await this.exportSplit(documents, {
        format,
        sourceName,
        sourceSlug,
        includeToc,
        includeCitations,
      });
    } else {
      result = await this.exportMerged(documents, {
        format,
        sourceName,
        sourceSlug,
        includeToc,
        includeCitations,
        imageQuality: options.imageQuality,
        grayscale: options.grayscale,
      });
    }

    if (options.outputPath) {
      const dir = path.dirname(options.outputPath);
      await fs.mkdir(dir, { recursive: true });
      if (typeof result.content === "string") {
        await fs.writeFile(options.outputPath, result.content, "utf-8");
      } else {
        await fs.writeFile(options.outputPath, result.content);
      }
    }

    return result;
  }

  private async exportMerged(
    docs: DiscoveredDocument[],
    opts: {
      format: "markdown" | "html" | "txt" | "json";
      sourceName: string;
      sourceSlug: string;
      includeToc: boolean;
      includeCitations: boolean;
      imageQuality?: ImageQuality;
      grayscale?: boolean;
    }
  ): Promise<DocumentExportResult> {
    const totalWords = this.calculateTotalWords(docs);
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];

    switch (opts.format) {
      case "markdown": {
        const lines: string[] = [];
        lines.push(`# ${opts.sourceName} - Knowledge Base\n`);
        lines.push(`> **Master Document Compilation**  `);
        lines.push(`> - **Exported:** ${dateStr}  `);
        lines.push(`> - **Total Documents:** ${docs.length}  `);
        lines.push(`> - **Total Words:** ${totalWords.toLocaleString()} words\n`);

        if (opts.includeToc && docs.length > 0) {
          lines.push(`<a id="table-of-contents"></a>`);
          lines.push(`## 📑 Table of Contents\n`);
          docs.forEach((doc, idx) => {
            const num = idx + 1;
            const slug = `${num}-${this.slugify(doc.title)}`;
            const safeTitle = doc.title.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
            lines.push(`${num}. [${safeTitle}](#${slug})`);
          });
          lines.push("");
        }

        if (docs.length === 0) {
          lines.push(`\n*No documents found in this knowledge base collection.*\n`);
        }

        docs.forEach((doc, idx) => {
          const num = idx + 1;
          const slug = `${num}-${this.slugify(doc.title)}`;
          const words = doc.wordCount || (doc.textContent.trim() ? doc.textContent.trim().split(/\s+/).length : 0);

          lines.push(`---`);
          lines.push(`<a id="${slug}"></a>`);
          lines.push(`## ${num}. ${doc.title}\n`);

          const metaParts: string[] = [`📊 **Word Count:** ${words.toLocaleString()} words`];
          if (opts.includeCitations && doc.url) {
            metaParts.push(`🔗 **Source:** <${doc.url}>`);
          }
          lines.push(`*${metaParts.join(" | ")}*\n`);

          lines.push(doc.textContent ? doc.textContent.trim() : "*(No content)*");
          lines.push("");

          if (opts.includeToc && docs.length > 1) {
            lines.push(`[↑ Back to Table of Contents](#table-of-contents)\n`);
          }
        });

        return {
          filename: `${opts.sourceSlug}-knowledge-base.md`,
          mimeType: "text/markdown",
          content: lines.join("\n"),
          documentCount: docs.length,
        };
      }

      case "html": {
        let html = this.generateMergedHtml(docs, opts, totalWords, dateStr);
        if (this.mediaService) {
          html = await this.inlineMediaAsBase64(html, {
            imageQuality: opts.imageQuality,
            grayscale: opts.grayscale,
          });
        }
        return {
          filename: `${opts.sourceSlug}-knowledge-base.html`,
          mimeType: "text/html",
          content: html,
          documentCount: docs.length,
        };
      }

      case "txt": {
        const lines: string[] = [];
        const sep = "=".repeat(80);
        const subSep = "-".repeat(80);

        lines.push(sep);
        lines.push(`KNOWLEDGE BASE: ${opts.sourceName.toUpperCase()}`);
        lines.push(`Exported: ${dateStr} | Total Documents: ${docs.length} | Total Words: ${totalWords.toLocaleString()}`);
        lines.push(sep);
        lines.push("");

        if (opts.includeToc && docs.length > 0) {
          lines.push("TABLE OF CONTENTS:");
          docs.forEach((doc, idx) => {
            lines.push(`  ${String(idx + 1).padStart(2, " ")}. ${doc.title}`);
          });
          lines.push("");
          lines.push(sep);
          lines.push("");
        }

        if (docs.length === 0) {
          lines.push("(No documents found in this knowledge base collection.)\n");
        }

        docs.forEach((doc, idx) => {
          const num = idx + 1;
          const words = doc.wordCount || (doc.textContent.trim() ? doc.textContent.trim().split(/\s+/).length : 0);

          lines.push(`[DOCUMENT ${num} OF ${docs.length}] ${doc.title}`);
          if (opts.includeCitations && doc.url) {
            lines.push(`Source: ${doc.url}`);
          }
          lines.push(`Word Count: ${words.toLocaleString()} words`);
          lines.push(subSep);
          lines.push(doc.textContent ? doc.textContent.trim() : "(No content)");
          lines.push("");
          lines.push(sep);
          lines.push("");
        });

        return {
          filename: `${opts.sourceSlug}-knowledge-base.txt`,
          mimeType: "text/plain",
          content: lines.join("\n"),
          documentCount: docs.length,
        };
      }

      case "json": {
        const payload = {
          title: `${opts.sourceName} - Knowledge Base`,
          exportedAt: now.toISOString(),
          totalDocuments: docs.length,
          totalWordCount: totalWords,
          documents: docs.map((d, idx) => ({
            index: idx + 1,
            id: d.id,
            sourceId: d.sourceId,
            title: d.title,
            url: d.url || null,
            wordCount: d.wordCount || (d.textContent.trim() ? d.textContent.trim().split(/\s+/).length : 0),
            textContent: d.textContent || "",
            createdAt: d.createdAt || null,
          })),
        };

        return {
          filename: `${opts.sourceSlug}-knowledge-base.json`,
          mimeType: "application/json",
          content: JSON.stringify(payload, null, 2),
          documentCount: docs.length,
        };
      }
    }
  }

  private generateMergedHtml(
    docs: DiscoveredDocument[],
    opts: { sourceName: string; sourceSlug: string; includeToc: boolean; includeCitations: boolean },
    totalWords: number,
    dateStr: string
  ): string {
    const escapedSourceName = this.escapeHtml(opts.sourceName);

    let tocHtml = "";
    if (opts.includeToc && docs.length > 0) {
      const items = docs
        .map((doc, idx) => {
          const num = idx + 1;
          const escapedTitle = this.escapeHtml(doc.title);
          return `<li><a href="#doc-${num}">${num}. ${escapedTitle}</a></li>`;
        })
        .join("\n");

      tocHtml = `
      <nav class="toc-container" aria-label="Table of Contents">
        <h2>📑 Table of Contents</h2>
        <ol class="toc-list">
          ${items}
        </ol>
      </nav>
      `;
    }

    const docSections = docs
      .map((doc, idx) => {
        const num = idx + 1;
        const escapedTitle = this.escapeHtml(doc.title);
        const words = doc.wordCount || (doc.textContent.trim() ? doc.textContent.trim().split(/\s+/).length : 0);
        const sanitizedUrl = this.sanitizeUrl(doc.url);

        let citationHtml = "";
        if (opts.includeCitations && sanitizedUrl) {
          citationHtml = `
          <div class="meta-item">
            <span class="meta-icon">🔗</span>
            <strong>Source:</strong>
            <a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(doc.url || "")} ↗</a>
          </div>`;
        }

        const bodyHtml = this.formatHtmlParagraphs(doc.textContent || "");

        return `
        <article class="doc-card" id="doc-${num}">
          <header class="doc-header">
            <div class="doc-badge">Document #${num}</div>
            <h2 class="doc-title">${escapedTitle}</h2>
            <div class="doc-meta">
              <div class="meta-item">
                <span class="meta-icon">📊</span>
                <span>${words.toLocaleString()} words</span>
              </div>
              ${citationHtml}
            </div>
          </header>
          <div class="doc-body">
            ${bodyHtml}
          </div>
          ${opts.includeToc && docs.length > 1 ? '<div class="doc-footer"><a href="#top" class="back-link">↑ Back to Table of Contents</a></div>' : ""}
        </article>`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedSourceName} - Knowledge Base</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #7dd3fc;
      --accent: #6366f1;
      --badge-bg: #0369a1;
      --badge-text: #e0f2fe;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --border: #e2e8f0;
        --text: #0f172a;
        --text-muted: #64748b;
        --primary: #0284c7;
        --primary-hover: #0369a1;
        --accent: #4f46e5;
        --badge-bg: #e0f2fe;
        --badge-text: #0369a1;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header.main-header {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid var(--border);
    }
    .main-header h1 {
      font-size: 2.2rem;
      margin-bottom: 0.5rem;
      color: var(--text);
    }
    .header-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1rem;
    }
    .pill {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      color: var(--text-muted);
    }
    .toc-container {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .toc-container h2 {
      font-size: 1.3rem;
      margin-bottom: 1rem;
      color: var(--primary);
    }
    .toc-list {
      padding-left: 1.5rem;
      display: grid;
      gap: 0.5rem;
    }
    .toc-list a {
      color: var(--text);
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s;
    }
    .toc-list a:hover {
      color: var(--primary);
      text-decoration: underline;
    }
    .doc-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .doc-badge {
      display: inline-block;
      background: var(--badge-bg);
      color: var(--badge-text);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      margin-bottom: 0.75rem;
    }
    .doc-title {
      font-size: 1.6rem;
      margin-bottom: 0.75rem;
      color: var(--text);
    }
    .doc-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .meta-item a {
      color: var(--primary);
      text-decoration: none;
      word-break: break-all;
    }
    .meta-item a:hover {
      text-decoration: underline;
    }
    .doc-body {
      color: var(--text);
      font-size: 1.05rem;
      line-height: 1.75;
    }
    .doc-body p {
      margin-bottom: 1.25rem;
    }
    .doc-body p:last-child {
      margin-bottom: 0;
    }
    .doc-body h3 {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--primary);
      margin: 1.75rem 0 0.75rem 0;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.35rem;
    }
    .doc-body h4 {
      font-size: 1.15rem;
      font-weight: 600;
      color: var(--text);
      margin: 1.5rem 0 0.5rem 0;
    }
    .doc-body h5, .doc-body h6 {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text-muted);
      margin: 1.25rem 0 0.5rem 0;
    }
    .doc-body pre {
      background: #090d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      overflow-x: auto;
      margin: 1.25rem 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9rem;
      line-height: 1.5;
      color: #e2e8f0;
    }
    .doc-body code {
      background: rgba(255, 255, 255, 0.08);
      padding: 0.2rem 0.45rem;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #93c5fd;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .doc-body pre code {
      background: transparent;
      padding: 0;
      color: inherit;
    }
    .doc-body blockquote {
      border-left: 4px solid var(--accent);
      padding: 0.75rem 1.25rem;
      background: rgba(99, 102, 241, 0.08);
      border-radius: 0 8px 8px 0;
      margin: 1.25rem 0;
      color: #cbd5e1;
      font-style: italic;
    }
    .doc-body ul, .doc-body ol {
      margin: 0 0 1.25rem 0;
      padding-left: 1.75rem;
    }
    .doc-body li {
      margin-bottom: 0.4rem;
    }
    .doc-body hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2rem 0;
    }
    .doc-body a {
      color: var(--primary);
      text-decoration: none;
    }
    .doc-body a:hover {
      text-decoration: underline;
    }
    .doc-figure {
      margin: 1.75rem 0;
      text-align: center;
    }
    .doc-figure img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      display: block;
      margin: 0 auto;
    }
    .doc-figure figcaption {
      margin-top: 0.6rem;
      font-size: 0.875rem;
      color: var(--text-muted);
      font-style: italic;
    }
    .doc-footer {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      text-align: right;
    }
    .back-link {
      color: var(--text-muted);
      font-size: 0.85rem;
      text-decoration: none;
    }
    .back-link:hover {
      color: var(--primary);
      text-decoration: underline;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .container { max-width: 100%; }
      .doc-card { box-shadow: none; border: 1px solid #ccc; page-break-inside: avoid; margin-bottom: 2cm; }
      .toc-container { border: 1px solid #ccc; page-break-after: always; }
      .back-link { display: none; }
    }
  </style>
</head>
<body id="top">
  <div class="container">
    <header class="main-header">
      <h1>${escapedSourceName}</h1>
      <div class="header-pills">
        <div class="pill">📅 Exported: ${dateStr}</div>
        <div class="pill">📚 ${docs.length} Documents</div>
        <div class="pill">📊 ${totalWords.toLocaleString()} Words</div>
      </div>
    </header>

    ${tocHtml}

    <main>
      ${docSections || "<p><em>No documents found in this knowledge base collection.</em></p>"}
    </main>
  </div>
</body>
</html>`;
  }

  private async exportSplit(
    docs: DiscoveredDocument[],
    opts: {
      format: "markdown" | "html" | "txt" | "json";
      sourceName: string;
      sourceSlug: string;
      includeToc: boolean;
      includeCitations: boolean;
    }
  ): Promise<DocumentExportResult> {
    const zip = new JSZip();
    const ext = opts.format === "markdown" ? "md" : opts.format;
    const totalWords = this.calculateTotalWords(docs);
    const dateStr = new Date().toISOString().split("T")[0];

    // Scan documents for referenced local media files
    const mediaRegex = /(?:(?:\/api\/media\/)|(?:api\/media\/))([a-zA-Z0-9_.-]+)/g;
    const referencedMedia = new Set<string>();

    docs.forEach((doc) => {
      const text = doc.textContent || "";
      const matches = Array.from(text.matchAll(mediaRegex));
      for (const m of matches) {
        referencedMedia.add(m[1]);
      }
    });

    // Bundle media files into zip inside media/ folder
    if (this.mediaService && referencedMedia.size > 0) {
      for (const filename of referencedMedia) {
        try {
          const mediaBuffer = await this.mediaService.readMedia(filename);
          if (mediaBuffer) {
            zip.file(`media/${filename}`, mediaBuffer);
          }
        } catch {
          // Omit missing media from ZIP
        }
      }
    }

    // Helper to rewrite /api/media/<filename> to ./media/<filename>
    const rewriteMediaPaths = (content: string): string => {
      return content.replace(/(?:\/api\/media\/|api\/media\/)([a-zA-Z0-9_.-]+)/g, "./media/$1");
    };

    // 1. Add README index manifest
    const manifestLines: string[] = [
      `# ${opts.sourceName} - Knowledge Base Archive`,
      ``,
      `- **Export Date:** ${dateStr}`,
      `- **Format:** ${opts.format.toUpperCase()} (Split Archive)`,
      `- **Total Files:** ${docs.length}`,
      `- **Total Words:** ${totalWords.toLocaleString()}`,
      ``,
      `## Document Catalog:`,
      ``,
    ];

    docs.forEach((doc, idx) => {
      const num = String(idx + 1).padStart(2, "0");
      const slug = this.slugify(doc.title);
      const filename = `${num}-${slug}.${ext}`;
      const words = doc.wordCount || (doc.textContent.trim() ? doc.textContent.trim().split(/\s+/).length : 0);

      manifestLines.push(`${idx + 1}. **${doc.title}** (\`${filename}\` - ${words.toLocaleString()} words)`);
      if (doc.url) {
        manifestLines.push(`   - Source: <${doc.url}>`);
      }

      const localizedDoc = {
        ...doc,
        textContent: rewriteMediaPaths(doc.textContent || ""),
      };

      // Generate individual document file
      let fileContent = "";
      switch (opts.format) {
        case "markdown": {
          const docLines: string[] = [];
          docLines.push(`# ${localizedDoc.title}\n`);
          const meta: string[] = [`📊 **Word Count:** ${words.toLocaleString()} words`];
          if (opts.includeCitations && localizedDoc.url) {
            meta.push(`🔗 **Source:** <${localizedDoc.url}>`);
          }
          docLines.push(`*${meta.join(" | ")}*\n`);
          docLines.push(`---\n`);
          docLines.push(localizedDoc.textContent ? localizedDoc.textContent.trim() : "*(No content)*");
          docLines.push("");
          fileContent = docLines.join("\n");
          break;
        }
        case "html": {
          const escapedTitle = this.escapeHtml(localizedDoc.title);
          const sanitizedUrl = this.sanitizeUrl(localizedDoc.url);
          const bodyHtml = this.formatHtmlParagraphs(localizedDoc.textContent || "");
          let citationHtml = "";
          if (opts.includeCitations && sanitizedUrl) {
            citationHtml = `<p><strong>Source:</strong> <a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(localizedDoc.url || "")} ↗</a></p>`;
          }
          fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; color: #0f172a; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #0f172a; }
    .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.75rem; }
    h3 { font-size: 1.35rem; font-weight: 700; color: #0284c7; margin: 1.75rem 0 0.75rem 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.35rem; }
    h4 { font-size: 1.15rem; font-weight: 600; color: #0f172a; margin: 1.5rem 0 0.5rem 0; }
    h5, h6 { font-size: 1.05rem; font-weight: 600; color: #64748b; margin: 1.25rem 0 0.5rem 0; }
    p { margin-bottom: 1.25rem; line-height: 1.75; }
    pre { background: #0f172a; border-radius: 8px; padding: 1rem 1.25rem; overflow-x: auto; margin: 1.25rem 0; font-family: ui-monospace, monospace; font-size: 0.9rem; line-height: 1.5; color: #f8fafc; }
    code { background: #f1f5f9; padding: 0.2rem 0.45rem; border-radius: 4px; font-size: 0.875rem; color: #0284c7; font-family: ui-monospace, monospace; }
    pre code { background: transparent; padding: 0; color: inherit; }
    blockquote { border-left: 4px solid #6366f1; padding: 0.75rem 1.25rem; background: #f8fafc; border-radius: 0 8px 8px 0; margin: 1.25rem 0; color: #475569; font-style: italic; }
    ul, ol { margin: 0 0 1.25rem 0; padding-left: 1.75rem; }
    li { margin-bottom: 0.4rem; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0; }
    a { color: #0284c7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .doc-figure { margin: 1.75rem 0; text-align: center; }
    .doc-figure img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); display: block; margin: 0 auto; }
    .doc-figure figcaption { margin-top: 0.6rem; font-size: 0.875rem; color: #64748b; font-style: italic; }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  <div class="meta">
    <p><strong>Word Count:</strong> ${words.toLocaleString()} words</p>
    ${citationHtml}
  </div>
  <main>
    ${bodyHtml}
  </main>
</body>
</html>`;
          break;
        }
        case "txt": {
          const docLines: string[] = [];
          docLines.push(`TITLE: ${localizedDoc.title}`);
          if (opts.includeCitations && localizedDoc.url) {
            docLines.push(`SOURCE: ${localizedDoc.url}`);
          }
          docLines.push(`WORD COUNT: ${words.toLocaleString()} words`);
          docLines.push("-".repeat(80));
          docLines.push(localizedDoc.textContent ? localizedDoc.textContent.trim() : "(No content)");
          docLines.push("");
          fileContent = docLines.join("\n");
          break;
        }
        case "json": {
          fileContent = JSON.stringify(
            {
              id: localizedDoc.id,
              sourceId: localizedDoc.sourceId,
              title: localizedDoc.title,
              url: localizedDoc.url || null,
              wordCount: words,
              textContent: localizedDoc.textContent || "",
              createdAt: localizedDoc.createdAt || null,
            },
            null,
            2
          );
          break;
        }
      }

      zip.file(filename, fileContent);
    });

    zip.file("README.md", manifestLines.join("\n"));

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return {
      filename: `${opts.sourceSlug}-documents-split.zip`,
      mimeType: "application/zip",
      content: buffer,
      documentCount: docs.length,
    };
  }
}
