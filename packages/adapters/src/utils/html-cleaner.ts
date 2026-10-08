import { JSDOM } from "jsdom";

export function normalizeCleanText(text: string): string {
  if (!text || typeof text !== "string") return "";

  // 1. Replace non-breaking spaces and normalize line endings
  const normalized = text.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");

  // 2. Process line by line, tracking whether we are inside a code block
  const lines = normalized.split("\n");
  const processedLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmedLine = line.trimEnd();
    if (trimmedLine.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      processedLines.push(trimmedLine);
      continue;
    }

    if (inCodeBlock) {
      // Preserve code block contents and indentation verbatim
      processedLines.push(line.trimEnd());
    } else {
      // Outside code blocks, collapse multiple consecutive spaces/tabs into a single space
      // and remove spaces before punctuation
      const cleaned = trimmedLine.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?])/g, "$1");
      processedLines.push(cleaned);
    }
  }

  let result = processedLines.join("\n");

  // 3. Collapse 3+ consecutive newlines to 2 newlines (\n\n)
  result = result.replace(/\n{3,}/g, "\n\n");

  // 4. Trim overall string
  return result.trim();
}

export interface HtmlCleanOptions {
  preserveInlineFormatting?: boolean;
}

function walkDom(node: Node, baseUrl?: string, options?: HtmlCleanOptions): string {
  if (node.nodeType === 3) {
    // Node.TEXT_NODE: ignore whitespace-only text nodes inside list/table containers
    const parentTag = (node as any).parentElement?.tagName?.toLowerCase();
    if (parentTag && ["ul", "ol", "table", "tbody", "thead", "tr"].includes(parentTag)) {
      if (!node.textContent?.trim()) {
        return "";
      }
    }
    return node.textContent || "";
  }

  if (node.nodeType !== 1) {
    // Not Node.ELEMENT_NODE
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (
    [
      "script",
      "style",
      "noscript",
      "svg",
      "template",
      "canvas",
      "iframe",
      "audio",
      "video",
      "object",
      "meta",
      "link",
    ].includes(tag)
  ) {
    return "";
  }

  const walkChildren = (): string => {
    let result = "";
    for (const child of Array.from(el.childNodes)) {
      result += walkDom(child, baseUrl, options);
    }
    return result;
  };

  switch (tag) {
    case "h1":
      return `\n\n# ${walkChildren().trim()}\n\n`;
    case "h2":
      return `\n\n## ${walkChildren().trim()}\n\n`;
    case "h3":
      return `\n\n### ${walkChildren().trim()}\n\n`;
    case "h4":
      return `\n\n#### ${walkChildren().trim()}\n\n`;
    case "h5":
      return `\n\n##### ${walkChildren().trim()}\n\n`;
    case "h6":
      return `\n\n###### ${walkChildren().trim()}\n\n`;
    case "p":
      if (["li", "td", "th"].includes(el.parentElement?.tagName.toLowerCase() || "")) {
        return walkChildren();
      }
      return `\n\n${walkChildren().trim()}\n\n`;
    case "table":
      return renderTableToMarkdown(el, baseUrl);
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
    case "th":
    case "td":
      return walkChildren();
    case "strong":
    case "b": {
      const text = walkChildren();
      if (options?.preserveInlineFormatting) {
        return text.trim() ? `**${text.trim()}**` : text;
      }
      return text;
    }
    case "em":
    case "i": {
      const text = walkChildren();
      if (options?.preserveInlineFormatting) {
        return text.trim() ? `*${text.trim()}*` : text;
      }
      return text;
    }
    case "a": {
      let href = (el.getAttribute("href") || "").trim();
      const text = walkChildren().trim();
      if (options?.preserveInlineFormatting && href) {
        if (baseUrl && !href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("#") && !href.startsWith("mailto:")) {
          try {
            href = new URL(href, baseUrl).href;
          } catch {}
        }
        return `[${text || href}](${href})`;
      }
      return text;
    }
    case "img": {
      let src = (el.getAttribute("src") || el.getAttribute("data-src") || "").trim();
      const alt = (el.getAttribute("alt") || el.getAttribute("title") || "").trim();
      if (!src) return "";

      // If src is a localized media path (e.g. /api/media/... or https://host/api/media/...), normalize to /api/media/...
      const mediaMatch = src.match(/(?:^|https?:\/\/[^/]+)(\/api\/media\/[a-zA-Z0-9_.-]+)/i);
      if (mediaMatch) {
        src = mediaMatch[1];
      } else if (baseUrl && !src.startsWith("data:")) {
        try {
          src = new URL(src, baseUrl).href;
        } catch {}
      }
      return `\n\n![${alt}](${src})\n\n`;
    }
    case "pre": {
      const codeEl = el.querySelector("code");
      const content = codeEl ? codeEl.textContent : el.textContent;
      const classStr = `${codeEl?.className || ""} ${el.className || ""}`;
      const lang = classStr.match(/(?:language-|lang-)([a-zA-Z0-9_-]+)/i)?.[1] || "";
      return `\n\n\`\`\`${lang}\n${(content || "").replace(/\r\n/g, "\n").trim()}\n\`\`\`\n\n`;
    }
    case "code": {
      if (el.parentElement?.tagName.toLowerCase() === "pre") {
        return walkChildren();
      }
      return `\`${(el.textContent || "").trim()}\``;
    }
    case "blockquote": {
      const text = walkChildren().trim();
      const lines = text.split("\n").map((l) => `> ${l}`).join("\n");
      return `\n\n${lines}\n\n`;
    }
    case "ul":
    case "ol":
      return `\n\n${walkChildren().trim()}\n\n`;
    case "li": {
      const parentTag = el.parentElement?.tagName.toLowerCase();
      const prefix = parentTag === "ol" ? "1. " : "- ";
      return `\n${prefix}${walkChildren().trim()}`;
    }
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "div":
    case "section":
    case "article":
    case "main":
    case "header":
    case "footer":
      return `\n\n${walkChildren()}\n\n`;
    default:
      return walkChildren();
  }
}

function renderTableToMarkdown(tableEl: HTMLElement, baseUrl?: string): string {
  const rows: HTMLElement[] = [];
  const findRows = (parent: HTMLElement) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "tr") {
        rows.push(child as HTMLElement);
      } else if (["thead", "tbody", "tfoot"].includes(tag)) {
        findRows(child as HTMLElement);
      }
    }
  };
  findRows(tableEl);

  if (rows.length === 0) {
    return "";
  }

  const tableData: string[][] = [];
  for (const row of rows) {
    const rowCells: string[] = [];
    for (const cell of Array.from(row.children)) {
      const cellTag = cell.tagName.toLowerCase();
      if (cellTag === "th" || cellTag === "td") {
        const text = walkDom(cell, baseUrl).trim().replace(/\r?\n+/g, " ").replace(/\|/g, "\\|");
        rowCells.push(text);
      }
    }
    if (rowCells.length > 0) {
      tableData.push(rowCells);
    }
  }

  if (tableData.length === 0) {
    return "";
  }

  const maxCols = tableData.reduce((max, r) => Math.max(max, r.length), 0);
  if (maxCols === 0) {
    return "";
  }

  const normalizedRows = tableData.map((r) => {
    const padded = [...r];
    while (padded.length < maxCols) {
      padded.push("");
    }
    return padded;
  });

  const headerRow = normalizedRows[0];
  const separatorRow = new Array(maxCols).fill("---");
  const dataRows = normalizedRows.slice(1);

  let md = `\n\n| ${headerRow.join(" | ")} |\n| ${separatorRow.join(" | ")} |`;
  for (const row of dataRows) {
    md += `\n| ${row.join(" | ")} |`;
  }
  md += "\n\n";

  return md;
}

export function htmlToCleanText(html: string, baseUrl?: string, options?: HtmlCleanOptions): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  const trimmed = html.trim();
  if (!trimmed) {
    return "";
  }

  // If no HTML tags found at all, treat as plain text / markdown
  if (!/<[a-z][\s\S]*>/i.test(trimmed)) {
    return normalizeCleanText(trimmed);
  }

  try {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>${trimmed}</body></html>`, {
      url: baseUrl || "https://local.document",
    });
    const body = dom.window.document.body;
    const rawMarkdown = walkDom(body, baseUrl, options);
    return normalizeCleanText(rawMarkdown);
  } catch {
    // Fallback if DOM parsing fails
    return normalizeCleanText(
      trimmed
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
    );
  }
}
