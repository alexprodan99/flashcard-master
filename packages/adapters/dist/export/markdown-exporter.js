import fs from "node:fs";
import path from "node:path";
export class MarkdownExporter {
    format = "markdown";
    formatBlockquote(text) {
        return text
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
    }
    async export(cards, options = {}) {
        const deckName = options.targetDeck || (cards.length > 0 ? cards[0].targetDeck : "Default") || "Default";
        const title = options.title || `${deckName} - Active Recall Study Guide`;
        const includeFrontmatter = options.includeFrontmatter ?? true;
        const includeCitations = options.includeCitations ?? (options.includeCitationFootnotes ?? true);
        const includeBadges = options.includeBadges ?? true;
        const nowIso = new Date().toISOString();
        const sections = [];
        // 1. YAML Frontmatter
        if (includeFrontmatter) {
            const allTags = Array.from(new Set(cards.flatMap((c) => c.tags || [])));
            const tagsYaml = allTags.length > 0 ? `\n  - ${allTags.join("\n  - ")}` : " []";
            sections.push(`---
title: "${title.replace(/"/g, '\\"')}"
deck: "${deckName.replace(/"/g, '\\"')}"
total_cards: ${cards.length}
tags:${tagsYaml}
exported_at: "${nowIso}"
generator: "Flashcard Master"
---
`);
        }
        // 2. Title and Overview Header
        sections.push(`# 📚 ${title}

*Generated with Flashcard Master • **${cards.length}** flashcards total*

---
`);
        // 3. Card Items
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const cardNum = i + 1;
            const cardParts = [];
            cardParts.push(`### Card ${cardNum}: ${card.question}\n`);
            if (includeBadges) {
                const tagBadges = (card.tags && card.tags.length > 0) ? card.tags.join(", ") : "none";
                cardParts.push(`\`🏷️ Tags: ${tagBadges}\` | \`🎯 Difficulty: ${card.difficulty}\` | \`👤 Persona: ${card.personaUsed}\`\n`);
            }
            cardParts.push(`<details>
<summary><strong>💡 Reveal Answer</strong></summary>

> **Answer:**
${this.formatBlockquote(card.answer)}
`);
            if (includeCitations && card.sourceQuote) {
                cardParts.push(`>
> [!NOTE]
> **Source Citation:**
${this.formatBlockquote(`*"${card.sourceQuote}"*`)}
`);
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
//# sourceMappingURL=markdown-exporter.js.map