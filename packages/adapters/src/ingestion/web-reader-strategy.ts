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

export interface WebReaderStrategyOptions {
  timeoutMs?: number;
  customFetch?: typeof fetch;
  concurrency?: number;
  mediaService?: MediaService;
}

export function parseSourceUrls(uri: string): string[] {
  if (!uri || typeof uri !== "string") {
    return [];
  }
  const trimmed = uri.trim();
  if (!trimmed) {
    return [];
  }

  let rawTokens: string[] = [];

  // 1. Try parsing JSON array
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawTokens = parsed.map((u) => (typeof u === "string" ? u.trim() : ""));
      }
    } catch {
      const stripped = trimmed.replace(/^\[|\]$/g, "").trim();
      rawTokens = [stripped];
    }
  } else {
    rawTokens = [trimmed];
  }

  // 2. Tokenize by newlines and URL boundary delimiters
  const candidates: string[] = [];
  for (const token of rawTokens) {
    if (!token) continue;
    const lines = token.split(/[\r\n]+/);
    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      // Split on comma or whitespace only if followed by http:// or https://
      const splitByUrls = l.split(/[\s,]+(?=https?:\/\/)/i);
      for (const piece of splitByUrls) {
        const p = piece.trim().replace(/^[<"']|[>"']$/g, "");
        if (p) candidates.push(p);
      }
    }
  }

  // Filter valid HTTP/HTTPS URLs and deduplicate
  const validUrls: string[] = [];
  const seen = new Set<string>();

  for (const item of candidates) {
    if (!item) continue;
    try {
      const parsed = new URL(item);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        const normalized = parsed.href;
        if (!seen.has(normalized)) {
          seen.add(normalized);
          validUrls.push(item);
        }
      }
    } catch {
      // Skip invalid URL syntax
    }
  }

  return validUrls;
}

export class WebReaderStrategy implements IngestionStrategy {
  readonly type = "web" as const;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly concurrency: number;
  private readonly mediaService?: MediaService;

  constructor(options: WebReaderStrategyOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.customFetch ?? globalThis.fetch;
    this.concurrency =
      typeof options.concurrency === "number" && Number.isFinite(options.concurrency)
        ? Math.max(1, Math.min(Math.floor(options.concurrency), 10))
        : 3;
    this.mediaService = options.mediaService;
  }

  async localizeImagesInHtml(html: string, originUrl: string): Promise<string> {
    if (!this.mediaService || !html || typeof html !== "string") {
      return html;
    }

    try {
      const dom = new JSDOM(html, { url: originUrl });
      const doc = dom.window.document;
      const images = Array.from(doc.querySelectorAll("img"));

      for (const img of images) {
        const src = (img.getAttribute("src") || img.getAttribute("data-src") || "").trim();
        if (!src) continue;

        if (src.startsWith("/api/media/")) continue;

        try {
          const resolvedUrl = new URL(src, originUrl).href;
          const asset = await this.mediaService.downloadAndSave(resolvedUrl, originUrl);
          if (asset) {
            img.setAttribute("src", asset.url);
          } else {
            img.setAttribute("src", resolvedUrl);
          }
        } catch {
          // Leave src as-is if URL parsing fails
        }
      }

      return dom.serialize();
    } catch {
      return html;
    }
  }

  async fetch(source: DataSource, lastSync?: SyncState): Promise<RawDocument[]> {
    const urls = parseSourceUrls(source.uri);
    if (urls.length === 0) {
      return [];
    }

    const results: (RawDocument | null)[] = new Array(urls.length);
    let currentIndex = 0;

    const workerCount = Math.min(this.concurrency, urls.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < urls.length) {
        const idx = currentIndex++;
        const targetUrl = urls[idx];
        results[idx] = await this.fetchSingleUrl(targetUrl, source.id);
      }
    });

    await Promise.allSettled(workers);

    return results.filter((doc): doc is RawDocument => doc !== null);
  }

  async fetchSingleUrl(url: string, sourceId: string): Promise<RawDocument | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "flashcard-master/1.0 (Mozilla/5.0 Compatible; +https://github.com/aprodan/flashcard-master)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        console.warn(`[WebReaderStrategy] HTTP error ${response.status} fetching ${url}`);
        return null;
      }

      let html = await response.text();
      if (this.mediaService) {
        html = await this.localizeImagesInHtml(html, url);
      }
      return this.parseHtml(html, sourceId, url);
    } catch (err: any) {
      console.warn(`[WebReaderStrategy] Network or parse failure for ${url}:`, err.message);
      return null;
    } finally {
      clearTimeout(timer);
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
