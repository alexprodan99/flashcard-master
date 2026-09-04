import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
import { XMLParser } from "fast-xml-parser";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import crypto from "node:crypto";
import { safeIsoDate } from "../utils/date.js";

export interface SitemapStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
  concurrency?: number;
  maxArticles?: number;
  urlFilter?: (url: string) => boolean;
}

interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
}

export class SitemapIngestionStrategy implements IngestionStrategy {
  readonly type = "sitemap" as const;
  private readonly parser: XMLParser;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly concurrency: number;
  private readonly maxArticles: number;
  private readonly urlFilter?: (url: string) => boolean;

  constructor(options: SitemapStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
    this.concurrency = options.concurrency ?? 5;
    this.maxArticles = options.maxArticles ?? 500;
    this.urlFilter = options.urlFilter;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: true,
      parseAttributeValue: false,
    });
  }

  private async fetchText(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await this.fetchFn(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (Mozilla/5.0 Compatible; +https://github.com/aprodan/flashcard-master)",
          Accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[SitemapIngestionStrategy] HTTP error ${res.status} fetching ${url}`);
        return null;
      }
      return await res.text();
    } catch (err: any) {
      console.warn(`[SitemapIngestionStrategy] Network error fetching ${url}:`, err.message);
      return null;
    }
  }

  async parseSitemapXml(xmlText: string, currentUrl: string, depth = 0): Promise<SitemapUrlEntry[]> {
    if (!xmlText || depth > 2) return [];

    try {
      const parsed = this.parser.parse(xmlText);
      const results: SitemapUrlEntry[] = [];

      // 1. Sitemap Index (<sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>)
      if (parsed.sitemapindex?.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
          ? parsed.sitemapindex.sitemap
          : [parsed.sitemapindex.sitemap];

        for (const sm of sitemaps) {
          const subLoc = typeof sm.loc === "object" ? sm.loc["#text"] : sm.loc;
          if (subLoc && typeof subLoc === "string") {
            const subXml = await this.fetchText(subLoc.trim());
            if (subXml) {
              const subEntries = await this.parseSitemapXml(subXml, subLoc.trim(), depth + 1);
              results.push(...subEntries);
            }
          }
        }
        return results;
      }

      // 2. Standard URL set (<urlset><url><loc>...</loc></url></urlset>)
      if (parsed.urlset?.url) {
        const urls = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];

        for (const u of urls) {
          const loc = typeof u.loc === "object" ? u.loc["#text"] : u.loc;
          const lastmod = typeof u.lastmod === "object" ? u.lastmod["#text"] : u.lastmod;
          if (loc && typeof loc === "string") {
            results.push({
              loc: loc.trim(),
              lastmod: lastmod ? safeIsoDate(lastmod) : undefined,
            });
          }
        }
      }

      return results;
    } catch (err: any) {
      console.warn(`[SitemapIngestionStrategy] XML parse error for ${currentUrl}:`, err.message);
      return [];
    }
  }

  private isIgnoredUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const pathname = parsed.pathname.toLowerCase();

      // Filter out non-article extensions
      if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot|pdf|zip|tar|gz|mp4|mp3|xml|json|rss|atom)$/i.test(pathname)) {
        return true;
      }

      // Apply custom filter if provided
      if (this.urlFilter && !this.urlFilter(urlStr)) {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  parseArticleHtml(html: string, sourceId: string, originUrl: string, publishedAt?: string): RawDocument | null {
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return null;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const document = dom.window.document;

      const reader = new Readability(document);
      const article = reader.parse();

      let title = article?.title?.trim();
      let rawContent = article?.content?.trim();

      if (!rawContent || rawContent.length === 0) {
        title = title || document.querySelector("title")?.textContent?.trim() || "Untitled Document";
        rawContent = document.body?.innerHTML || html;
      }

      const finalPublishedAt = publishedAt || safeIsoDate(article?.publishedTime) || new Date().toISOString();
      const docId = crypto.createHash("sha256").update(`${sourceId}:${originUrl}`).digest("hex").slice(0, 32);

      return {
        id: docId,
        sourceId,
        title: title || "Untitled Document",
        rawContent,
        originUrl,
        publishedAt: finalPublishedAt,
        guid: originUrl,
      };
    } catch (err: any) {
      console.warn(`[SitemapIngestionStrategy] DOM parsing error for ${originUrl}:`, err.message);
      return null;
    }
  }

  async fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]> {
    try {
      const rootXml = await this.fetchText(source.uri);
      if (!rootXml) {
        return [];
      }

      const allUrlEntries = await this.parseSitemapXml(rootXml, source.uri, 0);

      // Deduplicate URLs and apply URL filters
      const seenUrls = new Set<string>();
      const candidateUrls: SitemapUrlEntry[] = [];

      for (const entry of allUrlEntries) {
        if (seenUrls.has(entry.loc)) continue;
        seenUrls.add(entry.loc);

        if (this.isIgnoredUrl(entry.loc)) continue;
        candidateUrls.push(entry);

        if (candidateUrls.length >= this.maxArticles) break;
      }

      const docs: RawDocument[] = [];

      // Concurrently fetch articles with controlled batching
      for (let i = 0; i < candidateUrls.length; i += this.concurrency) {
        const batch = candidateUrls.slice(i, i + this.concurrency);
        const batchResults = await Promise.all(
          batch.map(async (entry) => {
            const html = await this.fetchText(entry.loc);
            if (!html) return null;
            return this.parseArticleHtml(html, source.id, entry.loc, entry.lastmod);
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
      console.warn(`[SitemapIngestionStrategy] Overall sitemap ingestion failure for ${source.uri}:`, err.message);
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
