import type { IngestionStrategy, DataSource, RawDocument, CleanTextDocument, SyncState } from "@flashcard-master/core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import crypto from "node:crypto";
import { safeIsoDate } from "../utils/date.js";

export interface WebReaderStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
}

export class WebReaderStrategy implements IngestionStrategy {
  readonly type = "web" as const;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: WebReaderStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
  }

  async fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(source.uri, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (Mozilla/5.0 Compatible; +https://github.com/aprodan/flashcard-master)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (!response.ok) {
        console.warn(`[WebReaderStrategy] HTTP error ${response.status} fetching ${source.uri}`);
        return [];
      }

      const html = await response.text();
      const doc = this.parseHtml(html, source.id, source.uri);
      return doc ? [doc] : [];
    } catch (err: any) {
      console.warn(`[WebReaderStrategy] Network or parse failure for ${source.uri}:`, err.message);
      return [];
    }
  }

  parseHtml(html: string, sourceId: string, originUrl: string): RawDocument | null {
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return null;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const document = dom.window.document;

      // Use Mozilla Readability algorithm to isolate main article
      const reader = new Readability(document);
      const article = reader.parse();

      let title = article?.title?.trim();
      let rawContent = article?.content?.trim();

      // Fallback if Readability fails to isolate an article tag (e.g. simple markdown/raw page)
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
      console.warn(`[WebReaderStrategy] DOM parsing error:`, err.message);
      return null;
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

    // 3. Normalize multiple whitespace and newlines
    clean = clean.replace(/\s+/g, " ").trim();

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
