import fs from "node:fs";
import path from "node:path";
import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";

export interface HtmlStudyGuideExporterOptions {
  title?: string;
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
      .replace(/\n/g, "<br>");
  }

  async export(
    cards: Flashcard[],
    options: ExportOptions & HtmlStudyGuideExporterOptions = {}
  ): Promise<ExportResult> {
    const deckName = options.targetDeck || (cards.length > 0 ? cards[0].targetDeck : "Default") || "Default";
    const title = options.title || `${deckName} - Printable Study Guide`;
    const includeCitations = options.includeCitations ?? (options.includeCitationFootnotes ?? true);
    const includeFoldGuide = options.includeFoldGuide ?? true;
    const nowStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const cardRows = cards
      .map((c, index) => {
        const num = index + 1;
        const tags = (c.tags || []).join(", ");
        const tagsHtml = tags ? `<span class="badge badge-tag">${this.escapeHtml(tags)}</span>` : "";
        const diffHtml = `<span class="badge badge-diff">${this.escapeHtml(c.difficulty)}</span>`;

        let citationHtml = "";
        if (includeCitations && c.sourceQuote) {
          citationHtml = `
            <div class="citation">
              <strong>Source Quote:</strong> "${this.escapeHtml(c.sourceQuote)}"
            </div>
          `;
        }

        return `
        <div class="card-row">
          <div class="col col-question ${includeFoldGuide ? "fold-border" : ""}">
            <div class="card-header">
              <span class="card-num">#${num}</span>
              ${diffHtml}
              ${tagsHtml}
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
  <title>${this.escapeHtml(title)}</title>
  <style>
    :root {
      --primary: #2563eb;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --bg-page: #f8fafc;
      --bg-card: #ffffff;
      --border-color: #e2e8f0;
      --border-fold: #94a3b8;
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
    }

    .btn-print:hover {
      background-color: #1d4ed8;
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
      font-style: italic;
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
          Deck: <strong>${this.escapeHtml(deckName)}</strong> • ${cards.length} Flashcards • Generated on ${nowStr}
        </div>
      </div>
      <button class="btn-print no-print" onclick="window.print()">🖨️ Print Study Sheet</button>
    </header>

    ${includeFoldGuide ? '<div class="fold-notice no-print">💡 <strong>Print Tip:</strong> Fold the page along the center dashed line to test yourself on the questions before checking answers!</div>' : ""}

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
