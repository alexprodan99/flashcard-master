import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type {
  DiscoveredDocument,
  DocumentExportFormat,
  DocumentExportMode,
  DocumentExportOptions,
  DocumentExportResult,
} from "@flashcard-master/core";

export class DocumentExportService {
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

  private formatHtmlParagraphs(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) return "<p><em>(No content available)</em></p>";

    // Split by multiple newlines into paragraphs
    const paragraphs = trimmed.split(/\n{2,}/);
    return paragraphs
      .map((p) => {
        const escaped = this.escapeHtml(p.trim()).replace(/\n/g, "<br />");
        return `<p>${escaped}</p>`;
      })
      .join("\n");
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
      result = this.exportMerged(documents, {
        format,
        sourceName,
        sourceSlug,
        includeToc,
        includeCitations,
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

  private exportMerged(
    docs: DiscoveredDocument[],
    opts: {
      format: "markdown" | "html" | "txt" | "json";
      sourceName: string;
      sourceSlug: string;
      includeToc: boolean;
      includeCitations: boolean;
    }
  ): DocumentExportResult {
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
        const html = this.generateMergedHtml(docs, opts, totalWords, dateStr);
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

      // Generate individual document file
      let fileContent = "";
      switch (opts.format) {
        case "markdown": {
          const docLines: string[] = [];
          docLines.push(`# ${doc.title}\n`);
          const meta: string[] = [`📊 **Word Count:** ${words.toLocaleString()} words`];
          if (opts.includeCitations && doc.url) {
            meta.push(`🔗 **Source:** <${doc.url}>`);
          }
          docLines.push(`*${meta.join(" | ")}*\n`);
          docLines.push(`---\n`);
          docLines.push(doc.textContent ? doc.textContent.trim() : "*(No content)*");
          docLines.push("");
          fileContent = docLines.join("\n");
          break;
        }
        case "html": {
          const escapedTitle = this.escapeHtml(doc.title);
          const sanitizedUrl = this.sanitizeUrl(doc.url);
          const bodyHtml = this.formatHtmlParagraphs(doc.textContent || "");
          let citationHtml = "";
          if (opts.includeCitations && sanitizedUrl) {
            citationHtml = `<p><strong>Source:</strong> <a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(doc.url || "")} ↗</a></p>`;
          }
          fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1e293b; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.75rem; }
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
          docLines.push(`TITLE: ${doc.title}`);
          if (opts.includeCitations && doc.url) {
            docLines.push(`SOURCE: ${doc.url}`);
          }
          docLines.push(`WORD COUNT: ${words.toLocaleString()} words`);
          docLines.push("-".repeat(80));
          docLines.push(doc.textContent ? doc.textContent.trim() : "(No content)");
          docLines.push("");
          fileContent = docLines.join("\n");
          break;
        }
        case "json": {
          fileContent = JSON.stringify(
            {
              id: doc.id,
              sourceId: doc.sourceId,
              title: doc.title,
              url: doc.url || null,
              wordCount: words,
              textContent: doc.textContent || "",
              createdAt: doc.createdAt || null,
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
