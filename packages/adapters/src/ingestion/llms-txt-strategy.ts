import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import crypto from "node:crypto";
import { safeIsoDate } from "../utils/date.js";

export interface LlmsTxtStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
  concurrency?: number;
  maxArticles?: number;
  urlFilter?: (url: string) => boolean;
}

export interface LlmsCatalogEntry {
  title: string;
  url: string;
  topic?: string;
  description?: string;
}

export class LlmsTxtIngestionStrategy implements IngestionStrategy {
  readonly type = "llms-txt" as const;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly concurrency: number;
  private readonly maxArticles: number;
  private readonly urlFilter?: (url: string) => boolean;

  constructor(options: LlmsTxtStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
    this.concurrency = options.concurrency ?? 5;
    this.maxArticles = options.maxArticles ?? 500;
    this.urlFilter = options.urlFilter;
  }

  private async fetchText(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await this.fetchFn(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (Mozilla/5.0 Compatible; +https://github.com/aprodan/flashcard-master)",
          Accept: "text/plain,text/markdown,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[LlmsTxtIngestionStrategy] HTTP error ${res.status} fetching ${url}`);
        return null;
      }
      return await res.text();
    } catch (err: any) {
      console.warn(`[LlmsTxtIngestionStrategy] Network error fetching ${url}:`, err.message);
      return null;
    }
  }

  parseCatalogMarkdown(markdown: string, baseOriginUri: string): LlmsCatalogEntry[] {
    if (!markdown || typeof markdown !== "string" || markdown.trim().length === 0) {
      return [];
    }

    const lines = markdown.split(/\r?\n/);
    const entries: LlmsCatalogEntry[] = [];
    const seenUrls = new Set<string>();
    let currentTopic: string | undefined = undefined;

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+|\/[^\s\)]+)\)(?::\s*(.*))?/;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track section category (e.g. "## AI for .NET" or "### API Design")
      if (trimmed.startsWith("#")) {
        const headerMatch = trimmed.match(/^#+\s+(.+)$/);
        if (headerMatch) {
          const rawHeader = headerMatch[1].replace(/[:#]/g, "").trim();
          if (rawHeader.toLowerCase() !== "discover the content" && rawHeader.toLowerCase() !== "optional") {
            currentTopic = rawHeader;
          }
        }
        continue;
      }

      // Check for bullet link or direct markdown link
      const linkMatch = trimmed.match(linkRegex);
      if (linkMatch) {
        const title = linkMatch[1].trim();
        let targetUrl = linkMatch[2].trim();
        const description = linkMatch[3]?.trim();

        // Resolve relative paths if any
        if (targetUrl.startsWith("/")) {
          try {
            const base = new URL(baseOriginUri);
            targetUrl = new URL(targetUrl, base.origin).toString();
          } catch {
            // Keep as is if URL fails
          }
        }

        if (seenUrls.has(targetUrl)) continue;
        seenUrls.add(targetUrl);

        // Discard non-article links (e.g. about, root homepage, social media, other catalogs)
        if (this.isIgnoredUrl(targetUrl)) continue;

        entries.push({
          title,
          url: targetUrl,
          topic: currentTopic,
          description: description || undefined,
        });

        if (entries.length >= this.maxArticles) break;
      }
    }

    return entries;
  }

  private isIgnoredUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const pathname = parsed.pathname.toLowerCase();

      // Ignore asset files
      if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|pdf|zip|tar|gz|mp4|mp3|xml|json)$/i.test(pathname)) {
        return true;
      }

      // Ignore meta links
      if (pathname === "/" || pathname === "/about" || pathname === "/contact" || pathname === "/llms.txt" || pathname === "/llms-full.txt") {
        return true;
      }

      if (this.urlFilter && !this.urlFilter(urlStr)) {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  parseArticleHtml(html: string, sourceId: string, originUrl: string, fallbackTitle?: string): RawDocument | null {
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return null;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const document = dom.window.document;

      const reader = new Readability(document);
      const article = reader.parse();

      let title = article?.title?.trim() || fallbackTitle;
      let rawContent = article?.content?.trim();

      if (!rawContent || rawContent.length === 0) {
        title = title || document.querySelector("title")?.textContent?.trim() || "Untitled Document";
        rawContent = document.body?.innerHTML || html;
      }

      const publishedAt = safeIsoDate(article?.publishedTime) || new Date().toISOString();

      return {
        id: crypto.randomUUID(),
        sourceId,
        title: title || "Untitled Document",
        rawContent,
        originUrl,
        publishedAt,
        guid: originUrl,
      };
    } catch (err: any) {
      console.warn(`[LlmsTxtIngestionStrategy] DOM parsing error for ${originUrl}:`, err.message);
      return null;
    }
  }

  async fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]> {
    try {
      const catalogMarkdown = await this.fetchText(source.uri);
      if (!catalogMarkdown) {
        return [];
      }

      const entries = this.parseCatalogMarkdown(catalogMarkdown, source.uri);
      const docs: RawDocument[] = [];

      // Concurrently fetch catalog articles with batching
      for (let i = 0; i < entries.length; i += this.concurrency) {
        const batch = entries.slice(i, i + this.concurrency);
        const batchResults = await Promise.all(
          batch.map(async (entry) => {
            const html = await this.fetchText(entry.url);
            if (!html) return null;
            return this.parseArticleHtml(html, source.id, entry.url, entry.title);
          })
        );

        for (const doc of batchResults) {
          if (doc) {
            docs.push(doc);
          }
        }
      }

      return docs;
    } catch (err: any) {
      console.warn(`[LlmsTxtIngestionStrategy] Overall catalog ingestion failure for ${source.uri}:`, err.message);
      return [];
    }
  }

  extractCleanText(raw: RawDocument): CleanTextDocument {
    let clean = raw.rawContent || "";

    // 1. Strip HTML tags
    clean = clean.replace(/<[^>]+>/g, " ");

    // 2. Decode standard HTML entities
    clean = clean
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");

    // 3. Normalize multiple whitespace and clean up spaces before punctuation
    clean = clean.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();

    // 4. Calculate SHA-256 hash
    const contentHash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");

    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: clean,
      originUrl: raw.originUrl,
      contentHash,
    };
  }
}
