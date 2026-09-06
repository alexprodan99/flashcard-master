import fs from "node:fs";
import path from "node:path";
import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";

export interface HtmlStudyGuideExporterOptions {
  title?: string;
  includeToc?: boolean;
  includeCitations?: boolean;
  includeFoldGuide?: boolean;
}

export class HtmlStudyGuideExporter implements ExporterPort {
  readonly format = "html" as const;

  private escapeHtml(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/\n/g, "<br>");
  }

  private escapeAttr(text: string): string {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
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

  async export(
    cards: Flashcard[],
    options: ExportOptions & HtmlStudyGuideExporterOptions = {}
  ): Promise<ExportResult> {
    const deckName = options.targetDeck?.trim() || (cards.length > 0 ? cards[0].targetDeck?.trim() : "Default") || "Default";
    const title = options.title || `${deckName} - Printable Study Guide`;
    const includeToc = options.includeToc ?? true;
    const includeCitations = options.includeCitations ?? (options.includeCitationFootnotes ?? true);
    const includeFoldGuide = options.includeFoldGuide ?? true;
    const nowStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    let tocHtml = "";
    if (includeToc && cards.length > 0) {
      // 1. Build TOC Groups
      const tocGroups: { title: string; originUrl?: string | null; cards: { num: number; question: string; difficulty: string }[] }[] = [];
      const groupMap = new Map<string, { title: string; originUrl?: string | null; cards: { num: number; question: string; difficulty: string }[] }>();

      cards.forEach((c, idx) => {
        const num = idx + 1;
        const groupKey = c.documentTitle?.trim() || c.targetDeck?.trim() || "General Knowledge";
        if (!groupMap.has(groupKey)) {
          const group = {
            title: groupKey,
            originUrl: this.sanitizeUrl(c.sourceOriginUrl),
            cards: [],
          };
          groupMap.set(groupKey, group);
          tocGroups.push(group);
        } else if (!groupMap.get(groupKey)!.originUrl && c.sourceOriginUrl) {
          // If a subsequent card in this group has an origin URL, assign it
          groupMap.get(groupKey)!.originUrl = this.sanitizeUrl(c.sourceOriginUrl);
        }

        groupMap.get(groupKey)!.cards.push({
          num,
          question: c.question,
          difficulty: c.difficulty,
        });
      });

      const groupItemsHtml = tocGroups
        .map((g) => {
          const safeUrl = this.sanitizeUrl(g.originUrl);
          const docRefHtml = safeUrl
            ? `<a href="${this.escapeAttr(safeUrl)}" target="_blank" rel="noopener noreferrer" class="toc-doc-link">🔗 Origin Source ↗</a>`
            : "";
          const listItemsHtml = g.cards
            .map((item) => {
              return `<li><a href="#card-${item.num}"><span class="toc-num">#${item.num}</span> <span class="toc-question">${this.escapeHtml(item.question)}</span> <span class="badge badge-diff-sm">${this.escapeHtml(item.difficulty)}</span></a></li>`;
            })
            .join("\n");

          return `
            <div class="toc-group">
              <div class="toc-group-header">
                <span class="toc-group-title">📄 ${this.escapeHtml(g.title)}</span>
                ${docRefHtml}
              </div>
              <ul class="toc-list">
                ${listItemsHtml}
              </ul>
            </div>
          `;
        })
        .join("\n");

      tocHtml = `
        <nav id="toc" class="table-of-contents no-print" aria-label="Table of Contents">
          <div class="toc-header">
            <h2>📑 Table of Contents</h2>
            <span class="toc-count">${cards.length} flashcard${cards.length === 1 ? "" : "s"}</span>
          </div>
          <div class="toc-grid">
            ${groupItemsHtml}
          </div>
        </nav>
      `;
    }

    // 2. Build Card Rows
    const cardRows = cards
      .map((c, index) => {
        const num = index + 1;
        const tags = (c.tags || []).join(", ");
        const tagsHtml = tags ? `<span class="badge badge-tag">${this.escapeHtml(tags)}</span>` : "";
        const diffHtml = `<span class="badge badge-diff">${this.escapeHtml(c.difficulty)}</span>`;

        let citationHtml = "";
        const hasQuote = Boolean(c.sourceQuote && c.sourceQuote.trim().length > 0);
        const hasDocTitle = Boolean(c.documentTitle && c.documentTitle.trim().length > 0);
        const safeOriginUrl = this.sanitizeUrl(c.sourceOriginUrl);
        const hasUrl = Boolean(safeOriginUrl);

        if (includeCitations && (hasQuote || hasDocTitle || hasUrl)) {
          let quoteHtml = "";
          if (hasQuote) {
            quoteHtml = `<div class="citation-quote">💬 <strong>Source Quote:</strong> "${this.escapeHtml(c.sourceQuote.trim())}"</div>`;
          }

          let refHtml = "";
          if (hasDocTitle || hasUrl) {
            const label = hasDocTitle ? c.documentTitle!.trim() : safeOriginUrl!;
            if (hasUrl) {
              refHtml = `<div class="citation-ref">📖 <strong>Reference:</strong> <a href="${this.escapeAttr(safeOriginUrl!)}" target="_blank" rel="noopener noreferrer" class="citation-link">${this.escapeHtml(label)} ↗</a></div>`;
            } else {
              refHtml = `<div class="citation-ref">📖 <strong>Reference:</strong> ${this.escapeHtml(label)}</div>`;
            }
          }

          citationHtml = `
            <div class="citation">
              ${quoteHtml}
              ${refHtml}
            </div>
          `;
        }

        const backToTopHtml = includeToc
          ? `<a href="#toc" class="back-to-top no-print" title="Back to Table of Contents">↑ Top</a>`
          : "";

        return `
        <div id="card-${num}" class="card-row">
          <div class="col col-question ${includeFoldGuide ? "fold-border" : ""}">
            <div class="card-header">
              <span class="card-num">#${num}</span>
              ${diffHtml}
              ${tagsHtml}
              ${backToTopHtml}
            </div>
            <div class="question-body">
              ${this.escapeHtml(c.question)}
            </div>
          </div>
          <div class="col col-answer">
            <div class="answer-body">
              ${this.escapeHtml(c.answer)}
            </div>
            ${citationHtml}
          </div>
        </div>
        `;
      })
      .join("\n");

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeAttr(title)}</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --bg-toc: #f1f5f9;
      --border-color: #e2e8f0;
      --border-fold: #94a3b8;
    }

    html {
      scroll-behavior: smooth;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-main);
      line-height: 1.5;
      padding: 24px;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
      background: var(--bg-card);
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
      padding: 32px;
    }

    header {
      border-bottom: 2px solid var(--border-color);
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-main);
    }

    .meta {
      font-size: 14px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .btn-print {
      background-color: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background-color 0.15s;
    }

    .btn-print:hover {
      background-color: var(--primary-hover);
    }

    /* Table of Contents */
    .table-of-contents {
      background: var(--bg-toc);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .toc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 8px;
    }

    .toc-header h3 {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-main);
    }

    .toc-count {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .toc-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .toc-group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .toc-group-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
    }

    .toc-doc-link {
      font-size: 11px;
      color: var(--primary);
      text-decoration: none;
    }

    .toc-doc-link:hover {
      text-decoration: underline;
    }

    .toc-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .toc-list li a {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-main);
      text-decoration: none;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.15s;
    }

    .toc-list li a:hover {
      background-color: rgba(37, 99, 235, 0.08);
      color: var(--primary);
    }

    .toc-num {
      font-weight: 700;
      color: var(--text-muted);
      font-size: 12px;
      flex-shrink: 0;
    }

    .toc-question {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge-diff-sm {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: #e0f2fe;
      color: #0369a1;
      text-transform: capitalize;
      flex-shrink: 0;
    }

    .fold-notice {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 20px;
    }

    .cards-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .col {
      padding: 16px;
    }

    .col-question {
      background-color: #ffffff;
    }

    .col-question.fold-border {
      border-right: 2px dashed var(--border-fold);
    }

    .col-answer {
      background-color: #fafafa;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .card-num {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
    }

    .back-to-top {
      margin-left: auto;
      font-size: 11px;
      color: var(--text-muted);
      text-decoration: none;
      padding: 2px 6px;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.04);
    }

    .back-to-top:hover {
      color: var(--primary);
      background: rgba(37, 99, 235, 0.08);
    }

    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: capitalize;
    }

    .badge-diff {
      background: #e0f2fe;
      color: #0369a1;
    }

    .badge-tag {
      background: #f1f5f9;
      color: #475569;
    }

    .question-body {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-main);
    }

    .answer-body {
      font-size: 15px;
      color: var(--text-main);
    }

    .citation {
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-muted);
      border-left: 3px solid var(--primary);
      padding-left: 8px;
    }

    .citation-quote {
      font-style: italic;
      color: #334155;
    }

    .citation-ref {
      margin-top: 4px;
    }

    .citation-link {
      color: var(--primary);
      text-decoration: underline;
    }

    .citation-link:hover {
      color: var(--primary-hover);
    }

    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }

      .container {
        max-width: 100% !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      .no-print {
        display: none !important;
      }

      .card-row {
        border-color: #cbd5e1 !important;
        margin-bottom: 12px;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }

      @page {
        margin: 12mm;
        size: A4 portrait;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>${this.escapeHtml(title)}</h1>
        <div class="meta">
          Deck: <strong>${this.escapeHtml(deckName)}</strong> • ${cards.length} Flashcard${cards.length === 1 ? "" : "s"} • Generated on ${nowStr}
        </div>
      </div>
      <button class="btn-print no-print" onclick="window.print()">🖨️ Print Study Sheet</button>
    </header>

    ${includeFoldGuide ? '<div class="fold-notice no-print">💡 <strong>Print Tip:</strong> Fold the page along the center dashed line to test yourself on the questions before checking answers!</div>' : ""}

    ${tocHtml}

    <div class="cards-grid">
      ${cardRows}
    </div>
  </div>
</body>
</html>`;

    if (options.outputPath) {
      const targetDir = path.dirname(options.outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(options.outputPath, htmlContent, "utf8");
    }

    return {
      format: "html",
      successCount: cards.length,
      outputPath: options.outputPath,
      data: htmlContent,
      message: `Exported ${cards.length} cards to printable HTML study guide (${deckName}).`,
    };
  }
}

export class PdfStudyGuideExporter implements ExporterPort {
  readonly format = "pdf" as const;
  private readonly htmlExporter = new HtmlStudyGuideExporter();

  async export(
    cards: Flashcard[],
    options: ExportOptions & HtmlStudyGuideExporterOptions = {}
  ): Promise<ExportResult> {
    const result = await this.htmlExporter.export(cards, options);
    return {
      ...result,
      format: "pdf",
      message: `Exported ${cards.length} cards to printable PDF study guide (${options.targetDeck || "Default"}).`,
    };
  }
}

