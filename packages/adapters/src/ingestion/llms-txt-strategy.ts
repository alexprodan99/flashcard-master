import type {
  IngestionStrategy,
  DataSource,
  RawDocument,
  CleanTextDocument,
  SyncState,
  MediaService,
} from "@flashcard-master/core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import crypto from "node:crypto";
import { safeIsoDate } from "../utils/date.js";
import { htmlToCleanText } from "../utils/html-cleaner.js";

export interface LlmsTxtStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
  concurrency?: number;
  maxArticles?: number;
  urlFilter?: (url: string) => boolean;
  mediaService?: MediaService;
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
  private readonly mediaService?: MediaService;

  constructor(options: LlmsTxtStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
    this.concurrency = options.concurrency ?? 5;
    this.maxArticles = options.maxArticles ?? 500;
    this.urlFilter = options.urlFilter;
    this.mediaService = options.mediaService;
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
      const docId = crypto.createHash("sha256").update(`${sourceId}:${originUrl}`).digest("hex").slice(0, 32);

      return {
        id: docId,
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

  async localizeImagesInHtml(html: string, originUrl: string): Promise<string> {
    if (!this.mediaService || !html || typeof html !== "string") {
      return html;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const doc = dom.window.document;
      const images = Array.from(doc.querySelectorAll("img"));

      // Collect unique candidate image URLs
      const targetUrls = new Set<string>();
      for (const img of images) {
        let src = (img.getAttribute("src") || "").trim();
        const dataSrc = (img.getAttribute("data-src") || "").trim();

        // Handle lazy-loaded images where src is a placeholder data URI
        if (!src || src.startsWith("data:")) {
          src = dataSrc;
        }
        if (!src || src.startsWith("data:") || src.startsWith("/api/media/")) {
          continue;
        }

        try {
          const resolvedUrl = new URL(src, originUrl).href;
          targetUrls.add(resolvedUrl);
        } catch {}
      }

      if (targetUrls.size === 0) {
        return html;
      }

      // Concurrently download unique image assets
      const urlToAssetMap = new Map<string, string>();
      await Promise.all(
        Array.from(targetUrls).map(async (url) => {
          try {
            const asset = await this.mediaService!.downloadAndSave(url, originUrl);
            if (asset) {
              urlToAssetMap.set(url, asset.url);
            }
          } catch {}
        })
      );

      // Replace img src attributes
      for (const img of images) {
        let src = (img.getAttribute("src") || "").trim();
        const dataSrc = (img.getAttribute("data-src") || "").trim();
        if (!src || src.startsWith("data:")) {
          src = dataSrc;
        }
        if (!src || src.startsWith("data:") || src.startsWith("/api/media/")) {
          continue;
        }

        try {
          const resolvedUrl = new URL(src, originUrl).href;
          const localizedUrl = urlToAssetMap.get(resolvedUrl);
          if (localizedUrl) {
            img.setAttribute("src", localizedUrl);
          } else {
            img.setAttribute("src", resolvedUrl);
          }
        } catch {}
      }

      return dom.serialize();
    } catch {
      return html;
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
            let html = await this.fetchText(entry.url);
            if (!html) return null;
            if (this.mediaService) {
              html = await this.localizeImagesInHtml(html, entry.url);
            }
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
    const clean = htmlToCleanText(raw.rawContent || "", raw.originUrl);

    // Calculate SHA-256 hash
    const contentHash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");

    return {
      id: raw.id,
      sourceId: raw.sourceId,
      title: raw.title,
      textContent: clean,
      rawContent: raw.rawContent,
      originUrl: raw.originUrl,
      contentHash,
    };
  }
}

