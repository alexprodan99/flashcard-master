import fs from "node:fs";
import path from "node:path";
import type { Flashcard, ExporterPort, ExportOptions, ExportResult } from "@flashcard-master/core";

export interface MarkdownExporterOptions {
  title?: string;
  includeFrontmatter?: boolean;
  includeToc?: boolean;
  includeCitations?: boolean;
  includeBadges?: boolean;
}

export class MarkdownExporter implements ExporterPort {
  readonly format = "markdown" as const;

  private formatBlockquote(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  private escapeMarkdownLabel(text: string): string {
    return text.replace(/[\[\]]/g, "\\$&");
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
    options: ExportOptions & MarkdownExporterOptions = {}
  ): Promise<ExportResult> {
    const deckName = options.targetDeck?.trim() || (cards.length > 0 ? cards[0].targetDeck?.trim() : "Default") || "Default";
    const title = options.title || `${deckName} - Active Recall Study Guide`;
    const includeFrontmatter = options.includeFrontmatter ?? true;
    const includeToc = options.includeToc ?? true;
    const includeCitations = options.includeCitations ?? (options.includeCitationFootnotes ?? true);
    const includeBadges = options.includeBadges ?? true;
    const nowIso = new Date().toISOString();

    const sections: string[] = [];

    // 1. YAML Frontmatter
    if (includeFrontmatter) {
      const allTags = Array.from(new Set(cards.flatMap((c) => c.tags || [])));
      const tagsYaml = allTags.length > 0
        ? `\n  - ${allTags.map((t) => JSON.stringify(t)).join("\n  - ")}`
        : " []";

      sections.push(`---
title: ${JSON.stringify(title)}
deck: ${JSON.stringify(deckName)}
total_cards: ${cards.length}
tags:${tagsYaml}
exported_at: "${nowIso}"
generator: "Flashcard Master"
---
`);
    }

    // 2. Title and Overview Header
    sections.push(`# 📚 ${title}

*Generated with Flashcard Master • **${cards.length}** flashcard${cards.length === 1 ? "" : "s"} total*

---
`);

    // 3. Table of Contents
    if (includeToc && cards.length > 0) {
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
          groupMap.get(groupKey)!.originUrl = this.sanitizeUrl(c.sourceOriginUrl);
        }

        groupMap.get(groupKey)!.cards.push({
          num,
          question: c.question,
          difficulty: c.difficulty,
        });
      });

      const tocLines: string[] = [
        '<a id="table-of-contents"></a>\n## 📑 Table of Contents\n',
      ];
      for (const group of tocGroups) {
        if (tocGroups.length > 1 || group.title !== "General Knowledge") {
          const safeUrl = this.sanitizeUrl(group.originUrl);
          const docLink = safeUrl ? ` ([Source Link](<${safeUrl}>))` : "";
          tocLines.push(`### 📄 ${this.escapeMarkdownLabel(group.title)}${docLink}\n`);
        }
        for (const item of group.cards) {
          const cleanQ = this.escapeMarkdownLabel(item.question.replace(/[\r\n]+/g, " ").trim());
          tocLines.push(`- [#${item.num}: ${cleanQ}](#card-${item.num}) \`[${item.difficulty}]\``);
        }
        tocLines.push("");
      }
      tocLines.push("---");
      sections.push(tocLines.join("\n"));
    }

    // 4. Card Items
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardNum = i + 1;
      const cardParts: string[] = [];

      const cleanHeadingQ = card.question.replace(/[\r\n]+/g, " ").trim();
      cardParts.push(`<a id="card-${cardNum}"></a>\n### Card ${cardNum}: ${cleanHeadingQ}\n`);

      if (includeBadges) {
        const tagBadges = (card.tags && card.tags.length > 0)
          ? card.tags.map((t) => t.replace(/`/g, "'")).join(", ")
          : "none";
        const safePersona = (card.personaUsed || "standard").replace(/`/g, "'");
        cardParts.push(`\`🏷️ Tags: ${tagBadges}\` | \`🎯 Difficulty: ${card.difficulty}\` | \`👤 Persona: ${safePersona}\`\n`);
      }

      cardParts.push(`<details>
<summary><strong>💡 Reveal Answer</strong></summary>

> **Answer:**
${this.formatBlockquote(card.answer)}
`);

      const hasQuote = Boolean(card.sourceQuote && card.sourceQuote.trim().length > 0);
      const hasDocTitle = Boolean(card.documentTitle && card.documentTitle.trim().length > 0);
      const safeOriginUrl = this.sanitizeUrl(card.sourceOriginUrl);
      const hasUrl = Boolean(safeOriginUrl);

      if (includeCitations && (hasQuote || hasDocTitle || hasUrl)) {
        let citationBlock = `>\n> [!NOTE]\n> **Source Citation:**`;
        if (hasQuote) {
          citationBlock += `\n${this.formatBlockquote(`*"${card.sourceQuote.trim()}"*`)}`;
        }

        if (hasDocTitle || hasUrl) {
          const rawLabel = hasDocTitle ? card.documentTitle!.trim() : safeOriginUrl!;
          const safeLabel = this.escapeMarkdownLabel(rawLabel);
          const docRef = hasUrl
            ? `[${safeLabel}](<${safeOriginUrl!}>)`
            : safeLabel;
          citationBlock += `\n>\n> 📖 **Reference:** ${docRef}`;
        }

        cardParts.push(citationBlock + "\n");
      }

      if (includeToc) {
        cardParts.push(`\n[↑ Back to Table of Contents](#table-of-contents)\n`);
      }

      cardParts.push(`</details>\n\n---`);
      sections.push(cardParts.join("\n"));
    }

    const fullMarkdown = sections.join("\n\n");

    if (options.outputPath) {
      const targetDir = path.dirname(options.outputPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(options.outputPath, fullMarkdown, "utf8");
    }

    return {
      format: "markdown",
      successCount: cards.length,
      outputPath: options.outputPath,
      data: fullMarkdown,
      message: `Exported ${cards.length} cards to Markdown study guide (${deckName}).`,
    };
  }
}

